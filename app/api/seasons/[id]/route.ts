import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// PATCH /api/seasons/[id]
// Supported actions via body:
//   { action: 'update_info', label: string, year: number }  — edit label/year
//   { action: 'set_current' }                               — make this the active season
//   { action: 'set_status', status: SeasonStatus }          — advance lifecycle status
//   { action: 'record_placements',
//     placements: { team_id: string, final_placement: number, total_points: number }[] }
//                                                           — write final standings for history

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Auth — commissioner only
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  const body = await req.json()
  const { action } = body

  // ── update_info ────────────────────────────────────────────────────────────
  // Accepts: { label, year, status? }
  // Updating status here avoids a second round-trip from the edit form.
  if (action === 'update_info') {
    const { label, year, status: newStatus } = body

    if (!label?.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }
    if (year !== undefined && (typeof year !== 'number' || year < 2010)) {
      return NextResponse.json({ error: 'year must be a number >= 2010' }, { status: 400 })
    }

    const validStatuses = ['setup', 'drafting', 'active', 'complete']
    if (newStatus !== undefined && !validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = { label: label.trim() }
    if (year !== undefined) updates.year = year
    if (newStatus !== undefined) updates.status = newStatus

    const { data, error } = await supabase
      .from('seasons')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `A season for year ${year} already exists` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // ── set_current ────────────────────────────────────────────────────────────
  if (action === 'set_current') {
    // Clear all existing current flags
    const { error: clearErr } = await supabase
      .from('seasons')
      .update({ is_current: false })
      .eq('is_current', true)

    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })

    const { data, error } = await supabase
      .from('seasons')
      .update({ is_current: true })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── set_status ─────────────────────────────────────────────────────────────
  if (action === 'set_status') {
    const { status } = body
    const valid = ['setup', 'drafting', 'active', 'complete']
    if (!valid.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${valid.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('seasons')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── Auto-snapshot final standings when a season is completed ────────────
    // Reads current draft_picks → scores totals and writes final_placement +
    // total_points into team_seasons so the Past Seasons page shows them
    // immediately without the commissioner having to upload results manually.
    if (status === 'complete') {
      // 1. Get all teams that participated in this season
      const { data: teamSeasonRows } = await supabase
        .from('team_seasons')
        .select('team_id')
        .eq('season_id', id)

      const teamIds = (teamSeasonRows ?? []).map((r) => r.team_id)

      if (teamIds.length > 0) {
        // 2. Fetch every draft pick for those teams + the athlete's score rows
        const { data: picks } = await supabase
          .from('draft_picks')
          .select('team_id, athlete:athletes(scores(total_points))')
          .in('team_id', teamIds)

        // 3. Sum total_points per team (all teams default to 0 so no team is missed)
        const teamTotals: Record<string, number> = Object.fromEntries(teamIds.map((tid) => [tid, 0]))

        for (const pick of picks ?? []) {
          const pts: number = ((pick.athlete as any)?.scores ?? []).reduce(
            (sum: number, s: any) => sum + (s.total_points ?? 0),
            0
          )
          teamTotals[pick.team_id] = (teamTotals[pick.team_id] ?? 0) + pts
        }

        // 4. Sort highest → lowest and assign placements 1..N
        const sorted = Object.entries(teamTotals).sort(([, a], [, b]) => b - a)
        const placements = sorted.map(([team_id, total_points], i) => ({
          team_id,
          season_id: id,
          final_placement: i + 1,
          total_points: parseFloat(total_points.toFixed(2)),
        }))

        await supabase
          .from('team_seasons')
          .upsert(placements, { onConflict: 'team_id,season_id' })
      }

      // Bust ISR caches so Past Seasons and home standings reflect immediately
      revalidatePath('/past-seasons')
      revalidatePath('/')
    }

    return NextResponse.json(data)
  }

  // ── record_placements ──────────────────────────────────────────────────────
  // Writes final_placement + total_points into team_seasons for each team.
  // Creates team_season rows if they don't exist yet.
  if (action === 'record_placements') {
    const { placements } = body as {
      placements: { team_id: string; final_placement: number; total_points: number }[]
    }

    if (!Array.isArray(placements) || placements.length === 0) {
      return NextResponse.json({ error: 'placements array required' }, { status: 400 })
    }

    const upserts = placements.map((p) => ({
      team_id: p.team_id,
      season_id: id,
      final_placement: p.final_placement,
      total_points: p.total_points,
    }))

    const { data, error } = await supabase
      .from('team_seasons')
      .upsert(upserts, { onConflict: 'team_id,season_id' })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE /api/seasons/[id] — only allowed for seasons in 'setup' status
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  // Verify the season exists
  const { data: season } = await supabase
    .from('seasons')
    .select('status, is_current, label')
    .eq('id', id)
    .single()

  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  // Guard: refuse to delete the currently-active season to avoid breaking
  // live draft/scoring. The commissioner must set a different current season first.
  if (season.is_current) {
    return NextResponse.json(
      { error: 'Cannot delete the current active season. Set another season as current first.' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('seasons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
  if (action === 'update_info') {
    const { label, year } = body

    if (!label?.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }
    if (year !== undefined && (typeof year !== 'number' || year < 2020)) {
      return NextResponse.json({ error: 'year must be a number >= 2020' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { label: label.trim() }
    if (year !== undefined) updates.year = year

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

  // Safety: only deletable when in setup
  const { data: season } = await supabase
    .from('seasons')
    .select('status, is_current')
    .eq('id', id)
    .single()

  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })
  if (season.status !== 'setup') {
    return NextResponse.json(
      { error: 'Only seasons in "setup" status can be deleted' },
      { status: 409 }
    )
  }
  if (season.is_current) {
    return NextResponse.json(
      { error: 'Cannot delete the current active season' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('seasons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

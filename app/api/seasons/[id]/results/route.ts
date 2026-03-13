/**
 * POST /api/seasons/[id]/results
 *
 * Uploads historical season results when you only have team names + total points.
 *
 * Body:
 *   {
 *     rows: [{ team_name: string; total_points: number }]
 *     mark_complete?: boolean   // default true — sets season.status = 'complete'
 *   }
 *
 * The server:
 *   1. Fetches all teams (id, name) from the DB.
 *   2. Matches each row to a team by name (case-insensitive exact, then fuzzy last-word).
 *   3. Ranks matched rows by total_points descending → assigns final_placement 1..N.
 *   4. Upserts into team_seasons.
 *   5. Optionally marks the season as 'complete'.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: seasonId } = await params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  // ── Validate season ─────────────────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons').select('id, label').eq('id', seasonId).maybeSingle()
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const { rows, mark_complete = true } = body as {
    rows: { team_name: string; total_points: number }[]
    mark_complete?: boolean
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '`rows` array is required' }, { status: 400 })
  }

  // ── Fetch all teams ─────────────────────────────────────────────────────────
  const { data: teams } = await supabase.from('teams').select('id, name')
  if (!teams?.length) {
    return NextResponse.json({ error: 'No teams found in the database' }, { status: 400 })
  }

  // ── Match each row's team_name to a team ────────────────────────────────────
  const matched: { team_id: string; team_name: string; total_points: number }[] = []
  const notFound: string[] = []

  for (const row of rows) {
    const needle = row.team_name.trim().toLowerCase()

    // 1. Exact match (case-insensitive)
    let team = teams.find((t) => t.name.trim().toLowerCase() === needle)

    // 2. Partial / substring match
    if (!team) {
      team = teams.find((t) =>
        t.name.trim().toLowerCase().includes(needle) ||
        needle.includes(t.name.trim().toLowerCase())
      )
    }

    if (!team) {
      notFound.push(row.team_name)
      continue
    }

    const pts = Number(row.total_points)
    if (isNaN(pts) || pts < 0) {
      return NextResponse.json(
        { error: `Invalid total_points for "${row.team_name}": ${row.total_points}` },
        { status: 400 }
      )
    }

    matched.push({ team_id: team.id, team_name: team.name, total_points: pts })
  }

  if (matched.length === 0) {
    return NextResponse.json(
      { error: 'No team names could be matched. Check names against Teams in the app.', not_found: notFound },
      { status: 400 }
    )
  }

  // ── Assign placements (rank 1 = highest points) ─────────────────────────────
  const sorted = [...matched].sort((a, b) => b.total_points - a.total_points)
  const placements = sorted.map((row, i) => ({
    team_id: row.team_id,
    season_id: seasonId,
    final_placement: i + 1,
    total_points: row.total_points,
  }))

  // ── Upsert into team_seasons ────────────────────────────────────────────────
  const { error: upsertErr } = await supabase
    .from('team_seasons')
    .upsert(placements, { onConflict: 'team_id,season_id' })

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // ── Mark season complete (optional) ────────────────────────────────────────
  if (mark_complete) {
    await supabase.from('seasons').update({ status: 'complete' }).eq('id', seasonId)
  }

  return NextResponse.json({
    success: true,
    saved: placements.length,
    not_found: notFound,
    placements: sorted.map((r, i) => ({
      rank: i + 1,
      team: r.team_name,
      points: r.total_points,
    })),
  })
}

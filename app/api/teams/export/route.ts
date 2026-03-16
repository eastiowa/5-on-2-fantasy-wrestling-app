import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/teams/export
 *
 * Commissioner-only. Returns a CSV file with one row per team containing:
 *   Draft Position, Team Name, Manager Name, Manager Email,
 *   Athlete 1 … Athlete 10  (each cell: "Name | Xlbs | Seed #N | School")
 *
 * Picks are ordered by pick_number so the columns are chronological.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Load teams + managers ────────────────────────────────────────────────
  const { data: teamsRaw } = await supabase
    .from('teams')
    .select('id, name, manager:profiles!manager_id(display_name, email)')
    .order('name')

  // ── Load current season draft positions ──────────────────────────────────
  const { data: currentSeason } = await supabase
    .from('seasons').select('id').eq('is_current', true).maybeSingle()

  const posMap: Record<string, number | null> = {}
  if (currentSeason) {
    const { data: teamSeasons } = await supabase
      .from('team_seasons')
      .select('team_id, draft_position')
      .eq('season_id', currentSeason.id)
    teamSeasons?.forEach((ts) => { posMap[ts.team_id] = ts.draft_position })
  }

  // ── Load all draft picks with athlete info ───────────────────────────────
  const { data: picks } = await supabase
    .from('draft_picks')
    .select('team_id, pick_number, athlete:athletes(name, weight, seed, school)')
    .order('pick_number')

  // Group picks by team
  const picksByTeam: Record<string, typeof picks> = {}
  picks?.forEach((p) => {
    if (!picksByTeam[p.team_id]) picksByTeam[p.team_id] = []
    picksByTeam[p.team_id]!.push(p)
  })

  // Sort teams by draft position
  const teams = (teamsRaw ?? [])
    .map((t) => ({ ...t, draft_position: posMap[t.id] ?? null }))
    .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))

  // ── Build CSV ────────────────────────────────────────────────────────────
  const MAX_PICKS = 10

  // Header row
  const athleteHeaders = Array.from({ length: MAX_PICKS }, (_, i) => `Athlete ${i + 1}`)
  const headers = ['Draft Position', 'Team Name', 'Manager Name', 'Manager Email', ...athleteHeaders]

  const escape = (val: string | number | null | undefined): string => {
    const s = val == null ? '' : String(val)
    // Wrap in quotes if it contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const rows: string[] = [headers.map(escape).join(',')]

  for (const team of teams) {
    const mgr = (Array.isArray(team.manager) ? team.manager[0] : team.manager) as { display_name: string | null; email: string } | null | undefined
    const teamPicks = (picksByTeam[team.id] ?? []).slice(0, MAX_PICKS)

    const athleteCells = Array.from({ length: MAX_PICKS }, (_, i) => {
      const pick = teamPicks[i]
      if (!pick) return ''
      const a = (Array.isArray(pick.athlete) ? pick.athlete[0] : pick.athlete) as { name: string; weight: number; seed: number; school: string } | null | undefined
      if (!a) return ''
      return `${a.name} | ${a.weight}lbs | Seed #${a.seed} | ${a.school ?? ''}`
    })

    const row = [
      team.draft_position ?? '',
      team.name,
      mgr?.display_name ?? '',
      mgr?.email ?? '',
      ...athleteCells,
    ].map(escape).join(',')

    rows.push(row)
  }

  const csv = rows.join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="teams-export.csv"',
    },
  })
}

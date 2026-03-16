/**
 * POST /api/projections/recalculate
 *
 * Reads all athletes for the current season plus their live bracket state,
 * runs the Monte Carlo prediction engine, and upserts results into:
 *   • athlete_projections  (per-athlete expected_points_remaining + projected_total)
 *   • team_projections     (per-team projected_total + win_probability)
 *
 * ── Auth (same dual-mode pattern as scrape-trackwrestling) ───────────────────
 *   1. Cron / scrape hook: send header  x-cron-secret: <CRON_SECRET>
 *   2. Commissioner manual trigger: valid commissioner session cookie.
 *
 * ── Optional body ─────────────────────────────────────────────────────────────
 *   { "iterations": 5000 }  — override Monte Carlo iteration count (default 3000).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeProjections,
  DEFAULT_SEED_POWER,
  type AthleteStateForProjection,
  type AthleteModelData,
  type TeamRoster,
  type BracketStatus,
} from '@/lib/predictions'

export async function POST(req: Request) {
  // ── 1. Authorise ─────────────────────────────────────────────────────────────
  const cronSecret     = process.env.CRON_SECRET
  const incomingSecret = req.headers.get('x-cron-secret')
  const isAuthorisedCron = cronSecret && incomingSecret === cronSecret

  let isCommissioner = false
  if (!isAuthorisedCron) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      isCommissioner = profile?.role === 'commissioner'
    }
  }

  if (!isAuthorisedCron && !isCommissioner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse optional body ────────────────────────────────────────────────────
  let body: { iterations?: number } = {}
  try { body = await req.json() } catch { /* optional */ }
  const iterations = Number(body.iterations) > 0 ? Number(body.iterations) : 3000

  const admin = createAdminClient()

  // ── 3. Resolve current season ─────────────────────────────────────────────────
  const { data: season } = await admin
    .from('seasons')
    .select('id, status')
    .eq('is_current', true)
    .maybeSingle()

  if (!season) {
    return NextResponse.json({ error: 'No active season found.' }, { status: 400 })
  }

  // Only run projections during an active season
  if (season.status !== 'active') {
    return NextResponse.json({
      skipped: true,
      reason: `Season status is "${season.status}" — projections only run during active seasons.`,
    })
  }

  // ── 4. Load seed power ratings ────────────────────────────────────────────────
  const { data: ratingRows } = await admin
    .from('seed_power_ratings')
    .select('seed, power_rating')

  const seedRatings: Record<number, number> = { ...DEFAULT_SEED_POWER }
  for (const r of ratingRows ?? []) {
    seedRatings[r.seed] = r.power_rating
  }

  // ── 5. Load athletes with their seeds and weight classes ──────────────────────
  const { data: athleteRows } = await admin
    .from('athletes')
    .select('id, seed, weight')
    .eq('season_id', season.id)

  if (!athleteRows?.length) {
    return NextResponse.json({ error: 'No athletes found for current season.' }, { status: 400 })
  }

  const weightClasses: Record<string, number> = {}
  for (const a of athleteRows) {
    weightClasses[a.id] = a.weight
  }

  // ── 6. Load current scores (bracket state + actual points) ────────────────────
  // Each athlete has at most one score row per event (tournament).
  const { data: scoreRows } = await admin
    .from('scores')
    .select('athlete_id, championship_wins, consolation_wins, placement, total_points, bracket_status')
    .in('athlete_id', athleteRows.map(a => a.id))

  // Index scores by athlete_id (take the latest/only row per athlete)
  const scoreByAthlete = new Map<string, {
    championship_wins: number
    consolation_wins: number
    placement: number | null
    total_points: number
    bracket_status: string
  }>()
  for (const s of scoreRows ?? []) {
    scoreByAthlete.set(s.athlete_id, s)
  }

  // ── 7. Build AthleteStateForProjection list ───────────────────────────────────
  const athletes: AthleteStateForProjection[] = athleteRows.map(a => {
    const score = scoreByAthlete.get(a.id)
    const rawStatus = score?.bracket_status ?? 'unknown'
    const bracketStatus: BracketStatus =
      rawStatus === 'championship' || rawStatus === 'consolation' ||
      rawStatus === 'placed'       || rawStatus === 'eliminated'
        ? rawStatus as BracketStatus
        : 'unknown'

    return {
      athlete_id: a.id,
      seed: a.seed ?? 33,
      current_points: score?.total_points ?? 0,
      bracket_status: bracketStatus,
      championship_wins: score?.championship_wins ?? 0,
      consolation_wins: score?.consolation_wins ?? 0,
      placement: score?.placement ?? null,
    }
  })

  // ── 8. Load draft picks to build team rosters ─────────────────────────────────
  const { data: picks } = await admin
    .from('draft_picks')
    .select('team_id, athlete_id')
    .eq('season_id', season.id)

  // Group by team
  const rosterMap = new Map<string, string[]>()
  for (const p of picks ?? []) {
    if (!rosterMap.has(p.team_id)) rosterMap.set(p.team_id, [])
    rosterMap.get(p.team_id)!.push(p.athlete_id)
  }

  const teamRosters: TeamRoster[] = Array.from(rosterMap.entries()).map(
    ([team_id, athlete_ids]) => ({ team_id, athlete_ids }),
  )

  if (!teamRosters.length) {
    return NextResponse.json({ error: 'No draft picks found — run the draft first.' }, { status: 400 })
  }

  // ── 9. Load athlete model data (from upload-model CSV, if available) ─────────
  // athlete_model_data is a new table (migration 016) not yet in the generated
  // Supabase types, so we query via any-cast.
  const { data: modelRows } = await (admin as any)
    .from('athlete_model_data')
    .select(
      'athlete_id, mc_p1, mc_p2, mc_p3, mc_p4, mc_p5, mc_p6, mc_p7, mc_p8,' +
      'mc_top8, mc_expected_points, ws_elo, bonus_rate',
    )
    .eq('season_id', season.id)
    .not('athlete_id', 'is', null) as { data: any[] | null }

  // Build modelData map — athlete_id → AthleteModelData
  const modelDataMap = new Map<string, AthleteModelData>()
  for (const r of modelRows ?? []) {
    if (!r.athlete_id) continue
    modelDataMap.set(r.athlete_id, {
      athlete_id: r.athlete_id,
      mc_p1: r.mc_p1 ?? 0,
      mc_p2: r.mc_p2 ?? 0,
      mc_p3: r.mc_p3 ?? 0,
      mc_p4: r.mc_p4 ?? 0,
      mc_p5: r.mc_p5 ?? 0,
      mc_p6: r.mc_p6 ?? 0,
      mc_p7: r.mc_p7 ?? 0,
      mc_p8: r.mc_p8 ?? 0,
      mc_top8: r.mc_top8 ?? 0,
      mc_expected_points: r.mc_expected_points ?? 0,
      ws_elo: r.ws_elo ?? null,
      bonus_rate: r.bonus_rate ?? null,
    })
  }

  // Also override seed power ratings with ws_elo values when available
  for (const md of modelDataMap.values()) {
    if (md.ws_elo && md.ws_elo > 0) {
      // Find the athlete's seed and update the rating map
      // We do this by athlete_id → seed lookup from the athletes list
      const a = athletes.find(x => x.athlete_id === md.athlete_id)
      if (a?.seed) {
        // Only override if the elo-based value is more informative than the generic seed
        // Use the athlete's actual seed slot but scale the elo to the same range
        seedRatings[a.seed] = Math.max(seedRatings[a.seed] ?? 0, 0) // keep as-is for now
        // Store elo directly in the model data — the engine uses it via ws_elo field
      }
    }
  }

  // ── 10. Run prediction engine ─────────────────────────────────────────────────
  const { athleteProjections, teamProjections } = computeProjections({
    athletes,
    teamRosters,
    seedRatings,
    weightClasses,
    modelData: modelDataMap.size > 0 ? modelDataMap : undefined,
    iterations,
  })

  const now = new Date().toISOString()

  // ── 11. Upsert athlete_projections ────────────────────────────────────────────
  const athleteUpsertRows = Array.from(athleteProjections.values()).map(p => ({
    season_id: season.id,
    athlete_id: p.athlete_id,
    bracket_status: p.bracket_status,
    championship_round: p.championship_round,
    consolation_round: p.consolation_round,
    expected_points_remaining: p.expected_points_remaining,
    projected_total: p.projected_total,
    last_computed_at: now,
  }))

  const { error: athleteUpsertError } = await admin
    .from('athlete_projections')
    .upsert(athleteUpsertRows, { onConflict: 'season_id,athlete_id' })

  if (athleteUpsertError) {
    console.error('[projections/recalculate] athlete upsert error:', athleteUpsertError)
    return NextResponse.json(
      { error: 'Failed to save athlete projections', details: athleteUpsertError.message },
      { status: 500 },
    )
  }

  // ── 12. Upsert team_projections ───────────────────────────────────────────────
  const teamUpsertRows = Array.from(teamProjections.values()).map(p => ({
    season_id: season.id,
    team_id: p.team_id,
    projected_total: p.projected_total,
    win_probability: p.win_probability,
    last_computed_at: now,
  }))

  const { error: teamUpsertError } = await admin
    .from('team_projections')
    .upsert(teamUpsertRows, { onConflict: 'season_id,team_id' })

  if (teamUpsertError) {
    console.error('[projections/recalculate] team upsert error:', teamUpsertError)
    return NextResponse.json(
      { error: 'Failed to save team projections', details: teamUpsertError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    athletes_projected: athleteUpsertRows.length,
    teams_projected: teamUpsertRows.length,
    model_data_athletes: modelDataMap.size,
    mode: modelDataMap.size > 0 ? 'model' : 'seed_fallback',
    iterations,
  })
}

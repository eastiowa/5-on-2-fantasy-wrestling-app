/**
 * POST /api/projections/upload-model
 *
 * Commissioner uploads the pre-tournament Monte Carlo simulation CSV
 * (mc_full_results_2026.csv format) to seed the athlete_model_data table.
 *
 * Expected CSV columns (all lowercase, spaces → underscores after transform):
 *   weight, name, school, conference, seed,
 *   ws_elo, win_rate, bonus_rate, model_score, Value_Tier, salary,
 *   mc_p1–mc_p8, mc_top8, mc_expected_points,
 *   cash_score, gpp_score, value_score
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Commissioner session cookie required.
 *
 * ── Body ─────────────────────────────────────────────────────────────────────
 *   multipart/form-data with field "file" containing the CSV.
 *
 * ── Returns ──────────────────────────────────────────────────────────────────
 *   { success, inserted, matched, unmatched: string[], errors: string[] }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Papa from 'papaparse'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelCsvRow {
  // Common to both old and new CSV formats
  name: string
  weight: string
  seed?: string
  salary?: string
  mc_p1?: string
  mc_p2?: string
  mc_p3?: string
  mc_p4?: string
  mc_p5?: string
  mc_p6?: string
  mc_p7?: string
  mc_p8?: string
  mc_top8?: string

  // ── Present in all formats ────────────────────────────────────────────────
  school?: string
  conference?: string
  rank?: string
  p4p_rank?: string
  record?: string
  win_pct?: string
  // Calibrated model output (fantasy_wrestling_calibrated_model.csv)
  calibrated_points?: string          // PRIMARY expected pts — use this when present
  record_confidence?: string
  bonus_emphasis_multiplier?: string
  expected_bonus_per_win?: string

  // ── Skill / rating fields ─────────────────────────────────────────────────
  elo?: string          // final format uses "elo" (was "ws_elo" in v1)
  ws_elo?: string       // v1 legacy name — still accepted
  bonus_rate?: string
  adj_bonus_rate?: string
  win_rate?: string
  adj_win_rate?: string
  pairwise_rating?: string
  blended_seed_gap?: string

  // ── v1-only ───────────────────────────────────────────────────────────────
  model_score?: string
  value_tier?: string
  mc_expected_points?: string    // v1 pre-computed expected total
  cash_score?: string
  gpp_score?: string
  value_score?: string

  // ── v2/v3 format ─────────────────────────────────────────────────────────
  ncaa_expected_placement_points?: string
  ncaa_expected_placement_points_timed?: string
  ncaa_expected_advancement_points?: string
  ncaa_expected_bonus_points?: string
  ncaa_expected_team_points?: string           // v2 non-timed total
  ncaa_expected_team_points_timed?: string     // v2/v3 timed total (primary in v3)
  ncaa_points_rank_in_weight?: string
  // Round-conditional expected placement points
  exp_place_pts_qf_win?: string
  exp_place_pts_sf_win?: string
  exp_place_pts_champ_win?: string
  exp_place_pts_blood_round_win?: string
  exp_place_pts_wb_quarter_win?: string
  exp_place_pts_wb_semifinal_win?: string
  exp_place_pts_3rd_match_win?: string
  exp_place_pts_5th_match_win?: string
  exp_place_pts_7th_match_win?: string
  // Milestone probabilities
  prob_secures_finals?: string
  prob_secures_aa_via_blood?: string
  prob_secures_top6_via_wb_qf?: string
  prob_secures_top4_via_wb_sf?: string        // v2 name
  prob_secures_top4_via_wbsf?: string         // v3 name (no underscore)
}

// ─── Name normalisation ───────────────────────────────────────────────────────

function normaliseName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Try several forms of the name to maximise match rate. */
function nameVariants(raw: string): string[] {
  const base = normaliseName(raw)
  const parts = base.split(' ')
  const variants = [base]

  // If name contains a comma "Last, First" → try "first last"
  if (raw.includes(',')) {
    const [last, first] = raw.split(',').map(s => s.trim().toLowerCase())
    variants.push(`${first} ${last}`)
    variants.push(`${first.split(' ')[0]} ${last}`) // first first-name word only
  }

  // Drop suffixes like Jr., III etc.
  const noSuffix = parts.filter(p => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p)).join(' ')
  if (noSuffix !== base) variants.push(noSuffix)

  return [...new Set(variants)]
}

function safeFloat(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'null' || v === 'NaN') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function safeInt(v: string | undefined): number | null {
  if (v === undefined || v === '') return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── 1. Auth — commissioner only ───────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner access required' }, { status: 403 })
  }

  const admin = createAdminClient()

  // ── 2. Resolve current season ──────────────────────────────────────────────
  const { data: season } = await admin
    .from('seasons').select('id').eq('is_current', true).maybeSingle()
  if (!season) {
    return NextResponse.json({ error: 'No current season found.' }, { status: 400 })
  }

  // ── 3. Parse multipart form data ───────────────────────────────────────────
  let csvText: string
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided. Send a multipart field named "file".' }, { status: 400 })
    }
    csvText = await (file as File).text()
  } catch {
    return NextResponse.json({ error: 'Could not read uploaded file.' }, { status: 400 })
  }

  // ── 4. Parse CSV ──────────────────────────────────────────────────────────
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({
      error: 'CSV parse failed',
      details: parsed.errors.map(e => `Row ${e.row}: ${e.message}`).slice(0, 10),
    }, { status: 400 })
  }

  const csvRows = parsed.data as unknown as ModelCsvRow[]

  // ── 5. Load all athletes for the current season for name-matching ──────────
  const { data: athletes } = await admin
    .from('athletes').select('id, name, weight')
  if (!athletes?.length) {
    return NextResponse.json({ error: 'No athletes found. Upload athletes first.' }, { status: 400 })
  }

  // Build lookup: normalised_name → [{ id, weight }]
  const nameMap = new Map<string, { id: string; weight: number }[]>()
  for (const a of athletes) {
    const key = normaliseName(a.name)
    if (!nameMap.has(key)) nameMap.set(key, [])
    nameMap.get(key)!.push({ id: a.id, weight: Number(a.weight) })
  }

  // ── 6. Process each CSV row ────────────────────────────────────────────────
  const upsertRows: Record<string, unknown>[] = []
  const unmatched: string[] = []
  const parseErrors: string[] = []

  for (const row of csvRows) {
    const csvName  = row.name?.trim()
    const weightRaw = safeInt(row.weight)

    if (!csvName || weightRaw === null) {
      parseErrors.push(`Row missing name or weight: ${JSON.stringify(row).slice(0, 80)}`)
      continue
    }

    // Attempt name match (try variants, disambiguate by weight)
    let athleteId: string | null = null
    for (const variant of nameVariants(csvName)) {
      const candidates = nameMap.get(variant)
      if (!candidates?.length) continue
      if (candidates.length === 1) {
        athleteId = candidates[0].id
        break
      }
      const weightMatch = candidates.find(c => c.weight === weightRaw)
      if (weightMatch) { athleteId = weightMatch.id; break }
      athleteId = candidates[0].id // fallback: first candidate
      break
    }

    if (!athleteId) {
      unmatched.push(`${csvName} (${weightRaw} lbs)`)
    }

    // ── Resolve expected total points ─────────────────────────────────────────
    // Priority order (highest to lowest accuracy):
    //   1. calibrated_points   — calibrated model output (fantasy_wrestling_calibrated_model.csv)
    //   2. ncaa_expected_team_points        — v2 raw MC non-timed total
    //   3. ncaa_expected_team_points_timed  — v2/v3 raw MC timed total
    //   4. mc_expected_points               — v1 legacy field
    const mcExpected =
      safeFloat(row.calibrated_points) ??
      safeFloat(row.ncaa_expected_team_points) ??
      safeFloat(row.ncaa_expected_team_points_timed) ??
      safeFloat(row.mc_expected_points) ??
      0

    // Build upsert row — nulls for unmatched athlete_id
    upsertRows.push({
      season_id: season.id,
      athlete_id: athleteId,
      csv_name: csvName,
      csv_school: row.school?.trim() ?? null,   // null in new format; fine
      weight: weightRaw,
      seed: safeInt(row.seed),

      // Skill / rating fields — accept both old and new column names
      ws_elo:      safeFloat(row.elo) ?? safeFloat(row.ws_elo),
      win_rate:    safeFloat(row.adj_win_rate) ?? safeFloat(row.win_rate),
      bonus_rate:  safeFloat(row.adj_bonus_rate) ?? safeFloat(row.bonus_rate),
      model_score: safeFloat(row.pairwise_rating) ?? safeFloat(row.model_score),
      value_tier:  row.value_tier?.trim() ?? null,
      salary:      safeInt(row.salary),

      // Placement probability distribution (present in both formats)
      mc_p1:  safeFloat(row.mc_p1)  ?? 0,
      mc_p2:  safeFloat(row.mc_p2)  ?? 0,
      mc_p3:  safeFloat(row.mc_p3)  ?? 0,
      mc_p4:  safeFloat(row.mc_p4)  ?? 0,
      mc_p5:  safeFloat(row.mc_p5)  ?? 0,
      mc_p6:  safeFloat(row.mc_p6)  ?? 0,
      mc_p7:  safeFloat(row.mc_p7)  ?? 0,
      mc_p8:  safeFloat(row.mc_p8)  ?? 0,
      mc_top8: safeFloat(row.mc_top8) ?? 0,
      mc_expected_points: mcExpected,

      // Old-format DFS scores
      cash_score:  safeFloat(row.cash_score),
      gpp_score:   safeFloat(row.gpp_score),
      value_score: safeFloat(row.value_score),

      // ── New-format breakdown fields (migration 017) ──────────────────────
      ncaa_expected_placement_points:   safeFloat(row.ncaa_expected_placement_points),
      ncaa_expected_advancement_points: safeFloat(row.ncaa_expected_advancement_points),
      ncaa_expected_bonus_points:       safeFloat(row.ncaa_expected_bonus_points),
      ncaa_expected_team_points_timed:  safeFloat(row.ncaa_expected_team_points_timed),
      ncaa_points_rank_in_weight:       safeInt(row.ncaa_points_rank_in_weight),

      // Round-conditional expected placement points
      exp_pts_qf_win:    safeFloat(row.exp_place_pts_qf_win),
      exp_pts_sf_win:    safeFloat(row.exp_place_pts_sf_win),
      exp_pts_champ_win: safeFloat(row.exp_place_pts_champ_win),
      exp_pts_blood_win: safeFloat(row.exp_place_pts_blood_round_win),
      exp_pts_wb_qf_win: safeFloat(row.exp_place_pts_wb_quarter_win),
      exp_pts_wb_sf_win: safeFloat(row.exp_place_pts_wb_semifinal_win),
      exp_pts_3rd_win:   safeFloat(row.exp_place_pts_3rd_match_win),
      exp_pts_5th_win:   safeFloat(row.exp_place_pts_5th_match_win),
      exp_pts_7th_win:   safeFloat(row.exp_place_pts_7th_match_win),

      // Milestone probabilities
      // Note: v3 CSV uses "prob_secures_top4_via_wbsf" (no underscore before sf)
      //       v2 CSV uses "prob_secures_top4_via_wb_sf"
      prob_secures_finals: safeFloat(row.prob_secures_finals),
      prob_secures_aa:     safeFloat(row.prob_secures_aa_via_blood),
      prob_secures_top6:   safeFloat(row.prob_secures_top6_via_wb_qf),
      prob_secures_top4:
        safeFloat((row as any).prob_secures_top4_via_wbsf) ??
        safeFloat(row.prob_secures_top4_via_wb_sf),

      // ── Calibrated model fields (migration 018) ──────────────────────────
      calibrated_points:         safeFloat(row.calibrated_points),
      record_confidence:         safeFloat(row.record_confidence),
      bonus_emphasis_multiplier: safeFloat(row.bonus_emphasis_multiplier),
      expected_bonus_per_win:    safeFloat(row.expected_bonus_per_win),

      uploaded_at: new Date().toISOString(),
    })
  }

  // ── 7. Upsert in batches of 100 ───────────────────────────────────────────
  const BATCH = 100
  const dbErrors: string[] = []

  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH)
    const { error } = await (admin as any)
      .from('athlete_model_data')
      .upsert(batch, { onConflict: 'season_id,csv_name,weight' })
    if (error) {
      dbErrors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    }
  }

  const matched = upsertRows.filter(r => r.athlete_id !== null).length

  return NextResponse.json({
    success: dbErrors.length === 0,
    inserted: upsertRows.length,
    matched,
    unmatched,
    parse_errors: parseErrors,
    db_errors: dbErrors,
  })
}

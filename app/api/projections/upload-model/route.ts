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
  weight: string
  name: string
  school?: string
  conference?: string
  seed?: string
  ws_elo?: string
  win_rate?: string
  bonus_rate?: string
  model_score?: string
  value_tier?: string
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
  mc_expected_points?: string
  cash_score?: string
  gpp_score?: string
  value_score?: string
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

    // Build upsert row — nulls for unmatched athlete_id
    upsertRows.push({
      season_id: season.id,
      athlete_id: athleteId,
      csv_name: csvName,
      csv_school: row.school?.trim() ?? null,
      weight: weightRaw,
      seed: safeInt(row.seed),
      ws_elo: safeFloat(row.ws_elo),
      win_rate: safeFloat(row.win_rate),
      bonus_rate: safeFloat(row.bonus_rate),
      model_score: safeFloat(row.model_score),
      value_tier: row.value_tier?.trim() ?? null,
      salary: safeInt(row.salary),
      mc_p1: safeFloat(row.mc_p1) ?? 0,
      mc_p2: safeFloat(row.mc_p2) ?? 0,
      mc_p3: safeFloat(row.mc_p3) ?? 0,
      mc_p4: safeFloat(row.mc_p4) ?? 0,
      mc_p5: safeFloat(row.mc_p5) ?? 0,
      mc_p6: safeFloat(row.mc_p6) ?? 0,
      mc_p7: safeFloat(row.mc_p7) ?? 0,
      mc_p8: safeFloat(row.mc_p8) ?? 0,
      mc_top8: safeFloat(row.mc_top8) ?? 0,
      mc_expected_points: safeFloat(row.mc_expected_points) ?? 0,
      cash_score: safeFloat(row.cash_score),
      gpp_score: safeFloat(row.gpp_score),
      value_score: safeFloat(row.value_score),
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

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchSheetScores, extractSheetId } from '@/lib/google-sheets'

/**
 * POST /api/scores/sync-sheets
 *
 * Fetches scores from a Google Sheet and overwrites existing scores for
 * every matched athlete that has at least 1 point (unscored athletes are
 * skipped so they stay at 0 in the DB).
 *
 * Supports two sheet formats (auto-detected):
 *
 * ── Bracket format (new) ─────────────────────────────────────────────────
 *   All 10 weight classes stacked on a single sheet.
 *   Header rows:    <blank> | <weight_class> | S-1 | S-2 | S-3 | S-4 | S-5 | S-6
 *   Wrestler rows:  <seed>  | "{seed}) Name (School) record" | per-session pts …
 *   Total score = sum of S-1 … S-6.
 *
 * ── Flat format (legacy) ─────────────────────────────────────────────────
 *   Row 1 headers: name | team | weight | place | score
 *   "score" is the cumulative total.
 *
 * Overwrite behaviour (both formats):
 *   DELETE existing score rows for athlete → INSERT new cumulative row
 *   bonus_points = total score; total_points generated column = bonus_points
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { sheet_url } = await req.json()
  if (!sheet_url) return NextResponse.json({ error: 'sheet_url is required' }, { status: 400 })

  const spreadsheetId = extractSheetId(sheet_url)
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })
  }

  const { rows, errors } = await fetchSheetScores(spreadsheetId)

  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'Sheets fetch failed', details: errors }, { status: 400 })
  }

  // Fetch all athletes (id, name, weight) for matching
  const { data: athletes } = await supabase.from('athletes').select('id, name, weight')
  if (!athletes?.length) {
    return NextResponse.json({ error: 'No athletes found — upload athletes before scores.' }, { status: 400 })
  }

  // Build name → [{ id, weight }] lookup
  const nameMap = new Map<string, { id: string; weight: number }[]>()
  for (const a of athletes) {
    const key = a.name.toLowerCase()
    if (!nameMap.has(key)) nameMap.set(key, [])
    nameMap.get(key)!.push({ id: a.id, weight: a.weight })
  }

  const upserted: string[] = []
  const notFound: string[] = []

  for (const row of rows) {
    const candidates = nameMap.get(row.name.toLowerCase())
    if (!candidates?.length) { notFound.push(row.name); continue }

    let athleteId: string
    if (candidates.length === 1) {
      athleteId = candidates[0].id
    } else if (row.weight) {
      const match = candidates.find((c) => c.weight === row.weight)
      athleteId = match ? match.id : candidates[0].id
    } else {
      athleteId = candidates[0].id
    }

    // Full overwrite: delete existing, insert new cumulative row
    await supabase.from('scores').delete().eq('athlete_id', athleteId)

    const { error } = await supabase.from('scores').insert({
      athlete_id: athleteId,
      event: 'tournament',
      championship_wins: 0,
      consolation_wins: 0,
      bonus_points: row.score,
      placement: row.place ?? null,
      placement_points: 0,
      updated_at: new Date().toISOString(),
    })

    if (!error) upserted.push(row.name)
    else errors.push(`Failed to save score for "${row.name}": ${error.message}`)
  }

  return NextResponse.json({
    success: true,
    updated: upserted.length,
    not_found: notFound,
    warnings: errors,
  })
}

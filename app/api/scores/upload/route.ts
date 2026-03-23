import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseCumulativeScoreCSV } from '@/lib/scoring'
import { revalidatePath } from 'next/cache'

/**
 * POST /api/scores/upload
 *
 * Accepts a CSV with columns: name, team, weight, place, score
 *   name   – wrestler name (matched against athletes table)
 *   team   – source team (informational, not used for matching)
 *   weight – weight class (used as secondary match key when names collide)
 *   place  – final tournament placement 1–8 (optional)
 *   score  – cumulative total points for this athlete
 *
 * Behaviour: FULL OVERWRITE — any existing score rows for matched athletes
 * are deleted before the new cumulative score is inserted.  This keeps
 * team totals and all standings in sync with the latest upload.
 *
 * Storage: because total_points is a generated column
 * (champ_wins + consol_wins*0.5 + bonus_points + placement_points),
 * the cumulative score is stored entirely in bonus_points so that
 * total_points automatically equals the uploaded score.
 * placement is stored for finish-position display.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contentType = req.headers.get('content-type') ?? ''
  let csvText: string

  if (contentType.includes('application/json')) {
    const body = await req.json()
    csvText = body.csv
  } else {
    csvText = await req.text()
  }

  if (!csvText?.trim()) return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })

  const { rows, errors } = parseCumulativeScoreCSV(csvText)

  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'CSV parsing failed', details: errors }, { status: 400 })
  }

  // Fetch all athletes (id, name, weight) for matching
  const { data: athletes } = await supabase.from('athletes').select('id, name, weight')
  if (!athletes?.length) {
    return NextResponse.json({ error: 'No athletes found — upload athletes before scores.' }, { status: 400 })
  }

  // Build lookup maps
  // Primary: name (lowercase) → [{ id, weight }]
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

    if (!candidates?.length) {
      notFound.push(row.name)
      continue
    }

    // If weight provided and multiple candidates share a name, narrow by weight
    let athleteId: string
    if (candidates.length === 1) {
      athleteId = candidates[0].id
    } else if (row.weight) {
      const match = candidates.find((c) => c.weight === row.weight)
      if (match) {
        athleteId = match.id
      } else {
        // Weight didn't match any — fall back to first candidate + warn
        errors.push(`"${row.name}": weight ${row.weight} not found — using first match`)
        athleteId = candidates[0].id
      }
    } else {
      athleteId = candidates[0].id
    }

    // ── DELETE existing score rows for this athlete (full overwrite) ─────────
    await supabase.from('scores').delete().eq('athlete_id', athleteId)

    // ── INSERT new cumulative score row ─────────────────────────────────────
    // total_points (generated) = championship_wins + consolation_wins*0.5
    //                           + bonus_points + placement_points
    // We store the cumulative score in bonus_points so total_points = score.
    const { error: insertErr } = await supabase.from('scores').insert({
      athlete_id: athleteId,
      event: 'tournament',
      championship_wins: 0,
      consolation_wins: 0,
      bonus_points: row.score,
      placement: row.place ?? null,
      placement_points: 0,
      updated_at: new Date().toISOString(),
    })

    if (!insertErr) {
      upserted.push(row.name)
    } else {
      errors.push(`Failed to save score for "${row.name}": ${insertErr.message}`)
    }
  }

  // Bust the ISR cache so standings reflect the new scores immediately
  revalidatePath('/')
  revalidatePath('/teams', 'layout')

  return NextResponse.json({
    success: true,
    updated: upserted.length,
    not_found: notFound,
    parse_warnings: errors,
  })
}

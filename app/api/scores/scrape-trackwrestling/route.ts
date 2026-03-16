/**
 * POST /api/scores/scrape-trackwrestling
 *
 * Fetches live bracket data from TrackWrestling and upserts athlete scores
 * into the Supabase `scores` table.
 *
 * ── Authentication (two modes) ───────────────────────────────────────────────
 *
 * 1. Cron / external caller (cron-job.org):
 *    Must send header:  x-cron-secret: <CRON_SECRET env var>
 *    Uses the admin client (service role) so no session is required.
 *
 * 2. Commissioner manual trigger (from the scores dashboard):
 *    Must have a valid commissioner session cookie.
 *    Also uses the admin client for the DB writes.
 *
 * ── Optional body ────────────────────────────────────────────────────────────
 *    { "tournament_url": "https://..." }  — overrides the URL stored in DB.
 *    If omitted the URL saved in scrape_settings is used.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchTrackWrestlingScores } from '@/lib/trackwrestling'

export async function POST(req: Request) {
  // ── 1. Authorise ───────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
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

  const admin = createAdminClient()

  // ── 2. Resolve tournament URL ──────────────────────────────────────────────
  let body: { tournament_url?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Body is optional — ignore parse errors
  }

  let tournamentUrl = body.tournament_url?.trim() ?? ''

  if (!tournamentUrl) {
    const { data: settings } = await admin
      .from('scrape_settings')
      .select('trackwrestling_url, auto_scrape_enabled')
      .single()

    if (!settings?.trackwrestling_url) {
      return NextResponse.json(
        { error: 'No tournament URL configured. Save one in Score Management → TrackWrestling Sync.' },
        { status: 400 },
      )
    }

    // Respect the enabled toggle when called by cron (commissioners can always force a manual sync)
    if (isAuthorisedCron && !settings.auto_scrape_enabled) {
      return NextResponse.json({ skipped: true, reason: 'auto_scrape_enabled is false' })
    }

    tournamentUrl = settings.trackwrestling_url
  }

  // ── 3. Scrape TrackWrestling ───────────────────────────────────────────────
  const { scores: twScores, errors: fetchErrors, weightClassesProcessed } =
    await fetchTrackWrestlingScores(tournamentUrl)

  if (fetchErrors.length > 0 && twScores.length === 0) {
    await admin.from('scrape_settings').update({
      last_scraped_at: new Date().toISOString(),
      last_scrape_status: 'error',
      last_scrape_message: fetchErrors.join(' | '),
      updated_at: new Date().toISOString(),
    }).neq('id', '00000000-0000-0000-0000-000000000000') // update all rows (single-row table)

    return NextResponse.json(
      { error: 'TrackWrestling fetch failed', details: fetchErrors },
      { status: 502 },
    )
  }

  // ── 4. Match athletes by name + weight ────────────────────────────────────
  const { data: athletes } = await admin
    .from('athletes')
    .select('id, name, weight')

  if (!athletes?.length) {
    return NextResponse.json(
      { error: 'No athletes in database. Upload athletes before scraping scores.' },
      { status: 400 },
    )
  }

  // Build lookup: normalised_name → [{ id, weight }]
  const nameMap = new Map<string, { id: string; weight: number }[]>()
  for (const a of athletes) {
    const key = a.name.trim().toLowerCase()
    if (!nameMap.has(key)) nameMap.set(key, [])
    nameMap.get(key)!.push({ id: a.id, weight: a.weight })
  }

  const upserted: string[] = []
  const notFound: string[] = []
  const dbErrors: string[] = []

  for (const row of twScores) {
    // Skip athletes with no activity
    if (
      row.championship_wins === 0 &&
      row.consolation_wins === 0 &&
      row.placement === null
    ) continue

    // Attempt exact name match (normalised)
    const normalisedName = row.name.trim().toLowerCase()
    let candidates = nameMap.get(normalisedName)

    // Fuzzy fallback: try last-name-only match for names like "Smith, John" vs "John Smith"
    if (!candidates?.length) {
      const parts = normalisedName.split(' ')
      const lastName = parts[parts.length - 1]
      for (const [key, val] of nameMap.entries()) {
        if (key.includes(lastName) && val[0].weight === row.weight) {
          candidates = val
          break
        }
      }
    }

    if (!candidates?.length) {
      notFound.push(row.name)
      continue
    }

    // Disambiguate by weight when there are multiple athletes with the same name
    let athleteId: string
    if (candidates.length === 1) {
      athleteId = candidates[0].id
    } else if (row.weight) {
      const match = candidates.find((c) => c.weight === row.weight)
      athleteId = match ? match.id : candidates[0].id
    } else {
      athleteId = candidates[0].id
    }

    // Full overwrite: delete existing scores for this athlete, then insert fresh
    await admin.from('scores').delete().eq('athlete_id', athleteId)

    const { error: insertError } = await admin.from('scores').insert({
      athlete_id: athleteId,
      event: 'tournament',
      championship_wins: row.championship_wins,
      consolation_wins: row.consolation_wins,
      bonus_points: row.bonus_points,
      placement: row.placement ?? null,
      placement_points: row.placement_points,
      bracket_status: row.bracket_status,
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      dbErrors.push(`"${row.name}": ${insertError.message}`)
    } else {
      upserted.push(row.name)
    }
  }

  // ── 5. Update sync status in scrape_settings ──────────────────────────────
  const allErrors = [...fetchErrors, ...dbErrors]
  await admin
    .from('scrape_settings')
    .update({
      last_scraped_at: new Date().toISOString(),
      last_scrape_status: allErrors.length === 0 ? 'ok' : 'error',
      last_scrape_message:
        allErrors.length === 0
          ? `Updated ${upserted.length} athletes across ${weightClassesProcessed} weight classes.`
          : allErrors.slice(0, 5).join(' | '),
      updated_at: new Date().toISOString(),
    })
    .neq('id', '00000000-0000-0000-0000-000000000000')

  // ── 6. Trigger projection recalculation (fire-and-forget) ─────────────────
  // Runs asynchronously so it does not block the scrape response.
  // Uses the same cron secret so the projection route trusts this call.
  if (upserted.length > 0) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    fetch(`${baseUrl}/api/projections/recalculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CRON_SECRET ? { 'x-cron-secret': process.env.CRON_SECRET } : {}),
      },
    }).catch((err) => {
      // Non-fatal — projections will just be stale until the next scrape
      console.warn('[scrape-trackwrestling] projection recalculate fire-and-forget failed:', err)
    })
  }

  return NextResponse.json({
    success: true,
    updated: upserted.length,
    weight_classes_processed: weightClassesProcessed,
    not_found: notFound,
    warnings: allErrors,
  })
}

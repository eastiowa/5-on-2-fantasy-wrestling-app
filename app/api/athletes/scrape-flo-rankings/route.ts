/**
 * POST /api/athletes/scrape-flo-rankings
 *
 * Fetches per-weight-class rankings from FlowWrestling, matches each ranked
 * wrestler to an athlete in the current season, then writes flo_ranking back
 * to the athletes table.
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * 1. Cron / external caller: send  x-cron-secret: <CRON_SECRET>
 * 2. Commissioner session: standard cookie auth
 *
 * ── Optional body ─────────────────────────────────────────────────────────────
 *    { "rankings_url": "https://www.flowrestling.org/rankings/..." }
 *    Overrides the URL stored in scrape_settings.flowrestling_url.
 *
 * ── Match logic ───────────────────────────────────────────────────────────────
 * Athletes are matched by:
 *   1. Weight class (must match exactly)
 *   2. Name similarity — normalised lowercase token comparison.
 *      Accepts: exact match → last-name-only match (if unique) → first-token match
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scrapeFloRankings, nameMatchKey } from '@/lib/flowrestling'
import type { Athlete } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Score how well two name-keys match (higher = better). -1 means no match. */
function matchScore(dbKey: string, floKey: string): number {
  if (dbKey === floKey) return 100                   // exact
  if (dbKey.includes(floKey) || floKey.includes(dbKey)) return 80  // substring

  const dbParts  = dbKey.split(' ')
  const floParts = floKey.split(' ')

  // Last-name exact
  const dbLast  = dbParts[dbParts.length - 1]
  const floLast = floParts[floParts.length - 1]
  if (dbLast && floLast && dbLast === floLast) return 60

  // First-name + last-name initial
  if (dbParts[0] && floParts[0] && dbParts[0] === floParts[0]) {
    if (dbLast[0] === floLast[0]) return 40
    return 20
  }

  return -1
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── 1. Authorise ───────────────────────────────────────────────────────────
  const cronSecret    = process.env.CRON_SECRET
  const incomingSecret = req.headers.get('x-cron-secret')
  const isAuthorisedCron = !!(cronSecret && incomingSecret === cronSecret)

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

  // ── 2. Resolve rankings URL ────────────────────────────────────────────────
  let body: { rankings_url?: string } = {}
  try { body = await req.json() } catch { /* body is optional */ }

  let rankingsUrl = body.rankings_url?.trim() ?? ''

  if (!rankingsUrl) {
    const { data: settings } = await admin
      .from('scrape_settings')
      .select('flowrestling_url, flo_auto_scrape_enabled')
      .single()

    if (!settings?.flowrestling_url) {
      return NextResponse.json(
        { error: 'No FlowWrestling URL configured. Save one in Score Management → FlowWrestling Rankings.' },
        { status: 400 },
      )
    }

    if (isAuthorisedCron && !settings.flo_auto_scrape_enabled) {
      return NextResponse.json({ skipped: true, reason: 'flo_auto_scrape_enabled is false' })
    }

    rankingsUrl = settings.flowrestling_url
  }

  // ── 3. Fetch current-season athletes ──────────────────────────────────────
  const { data: currentSeason } = await admin
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()

  if (!currentSeason) {
    return NextResponse.json({ error: 'No current season found.' }, { status: 400 })
  }

  const { data: athleteRows, error: athleteErr } = await admin
    .from('athletes')
    .select('id, name, weight, school, flo_ranking')
    .eq('season_id', currentSeason.id)

  if (athleteErr || !athleteRows) {
    return NextResponse.json({ error: `Could not load athletes: ${athleteErr?.message}` }, { status: 500 })
  }

  const athletes = athleteRows as Pick<Athlete, 'id' | 'name' | 'weight' | 'school' | 'flo_ranking'>[]

  // ── 4. Scrape FlowWrestling ────────────────────────────────────────────────
  let scrapeResult
  try {
    scrapeResult = await scrapeFloRankings(rankingsUrl)
  } catch (err) {
    const msg = `Scrape threw: ${String(err)}`
    await admin
      .from('scrape_settings')
      .update({
        flo_last_scraped_at: new Date().toISOString(),
        flo_last_scrape_status: 'error',
        flo_last_scrape_message: msg,
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { rankings, errors: scrapeErrors, pagesProcessed } = scrapeResult

  // ── 5. Match rankings to athletes ─────────────────────────────────────────
  const notFound:  string[] = []
  const ambiguous: string[] = []
  const updates:   Array<{ id: string; flo_ranking: number }> = []

  // Build lookup: weight → athletes
  const byWeight = new Map<number, typeof athletes>()
  for (const a of athletes) {
    const list = byWeight.get(a.weight) ?? []
    list.push(a)
    byWeight.set(a.weight, list)
  }

  for (const floEntry of rankings) {
    // Only care about known NCAA weights (skip P4P)
    if (floEntry.weight === 0) continue

    const candidates = byWeight.get(floEntry.weight) ?? []
    if (candidates.length === 0) continue

    const floKey = nameMatchKey(floEntry.name)
    const scored = candidates
      .map((a) => ({ a, score: matchScore(nameMatchKey(a.name), floKey) }))
      .filter((x) => x.score >= 0)
      .sort((x, y) => y.score - x.score)

    if (scored.length === 0) {
      notFound.push(`${floEntry.name} (${floEntry.weight})`)
      continue
    }

    // Ambiguous only if top two candidates share the same score AND it's not an exact match
    if (
      scored.length >= 2 &&
      scored[0].score === scored[1].score &&
      scored[0].score < 100
    ) {
      ambiguous.push(
        `${floEntry.name} (${floEntry.weight}) → ambiguous between ` +
        scored.slice(0, 2).map((x) => x.a.name).join(' and '),
      )
      continue
    }

    updates.push({ id: scored[0].a.id, flo_ranking: floEntry.rank })
  }

  // ── 6. Write to DB ────────────────────────────────────────────────────────
  let dbErrors = 0
  for (const { id, flo_ranking } of updates) {
    const { error: upErr } = await admin
      .from('athletes')
      .update({ flo_ranking })
      .eq('id', id)
    if (upErr) dbErrors++
  }

  // ── 7. Update scrape_settings status ──────────────────────────────────────
  const allWarnings = [...scrapeErrors, ...ambiguous]
  const status      = scrapeErrors.length > 0 && updates.length === 0 ? 'error' : 'ok'
  const message     = `Updated ${updates.length} athletes across ${pagesProcessed} pages` +
    (notFound.length   > 0 ? `; ${notFound.length} unmatched`  : '') +
    (ambiguous.length  > 0 ? `; ${ambiguous.length} ambiguous` : '') +
    (dbErrors          > 0 ? `; ${dbErrors} DB errors`         : '')

  await admin
    .from('scrape_settings')
    .update({
      flo_last_scraped_at:    new Date().toISOString(),
      flo_last_scrape_status: status,
      flo_last_scrape_message: message,
      updated_at:             new Date().toISOString(),
    })
    .neq('id', '00000000-0000-0000-0000-000000000000')

  // ── 8. Respond ────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:              true,
    updated:         updates.length,
    pages_processed: pagesProcessed,
    rankings_found:  rankings.length,
    not_found:       notFound,
    ambiguous,
    warnings:        allWarnings,
  })
}

/**
 * FlowWrestling Rankings Scraper — lib/flowrestling.ts
 *
 * Scrapes per-weight-class rankings from FlowWrestling's public rankings pages
 * and returns a flat list of { rank, name, school, weight } entries.
 *
 * Strategy
 * ────────
 * 1. Accept a base rankings-collection URL
 *    e.g. https://www.flowrestling.org/rankings/14300895-2025-26-ncaa-di-wrestling-rankings
 * 2. Fetch the collection page, extract __NEXT_DATA__ JSON (FloSports is Next.js)
 * 3. Discover all per-weight-class sub-page URLs from that JSON / HTML
 * 4. For each weight-class sub-page, fetch + parse rankings
 * 5. Return all FloRanking entries so the caller can match against DB athletes
 *
 * If the collection page itself already contains all weight-class data (embedded
 * in __NEXT_DATA__), no sub-page fetches are required.
 *
 * Name normalisation
 * ──────────────────
 * FlowWrestling may return "First Last" or "Last, First".
 * `normaliseFloName()` always produces "First Last" (title-cased, trimmed).
 *
 * Weight-class detection
 * ──────────────────────
 * Extracted from page title / URL slug / JSON fields. NCAA weights:
 * 125, 133, 141, 149, 157, 165, 174, 184, 197, 285
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FloRanking {
  rank:   number      // 1-based ranking position within the weight class
  name:   string      // "First Last" normalised
  school: string
  weight: number      // weight class lbs; 0 = P4P / could not determine
}

export interface FloScrapeResult {
  rankings:        FloRanking[]
  errors:          string[]
  pagesProcessed:  number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NCAA_WEIGHTS = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const

/** ms to wait between requests — be polite to FloSports servers */
const REQUEST_DELAY_MS = 400

/** Browser-like headers to avoid bot-detection */
const FETCH_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Given any FlowWrestling rankings URL, return the base collection URL
 * (strips the trailing category segment if present).
 *
 * Input:  https://www.flowrestling.org/rankings/14300895-2025-26-.../56050-p4p-...
 * Output: https://www.flowrestling.org/rankings/14300895-2025-26-...
 */
export function extractBaseCollectionUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (!u.hostname.includes('flowrestling.org')) return null

    // /rankings/{collectionSegment}[/{categorySegment}]
    const parts = u.pathname.replace(/^\//, '').split('/')
    if (parts[0] !== 'rankings' || !parts[1]) return null

    return `${u.origin}/rankings/${parts[1]}`
  } catch {
    return null
  }
}

/** Return true if the path segment looks like a weight-class page (not P4P) */
function isWeightClassSegment(slug: string): boolean {
  // slug examples: "56040-125-lbs", "56041-133", "125-lb", "125lbs"
  // P4P slugs: "56050-p4p-mitchell-mesenbrink"
  const lower = slug.toLowerCase()
  if (lower.includes('p4p') || lower.includes('pound')) return false
  return NCAA_WEIGHTS.some((w) => lower.includes(String(w)))
}

/** Extract NCAA weight class number from a string (title, slug, JSON field) */
export function extractWeightFromText(text: string): number {
  if (!text) return 0
  for (const w of NCAA_WEIGHTS) {
    const re = new RegExp(`\\b${w}\\b`)
    if (re.test(text)) return w
  }
  return 0
}

// ─── Name normalisation ───────────────────────────────────────────────────────

/** Normalise a name to "First Last" trimmed */
export function normaliseFloName(raw: string): string {
  if (!raw) return ''
  const s = raw.trim()
  // "Last, First" → "First Last"
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim())
    return `${first} ${last}`.trim()
  }
  return s
}

/** Produce a lowercase token for fuzzy matching against DB athlete names */
export function nameMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── __NEXT_DATA__ extraction ─────────────────────────────────────────────────

function extractNextData(html: string): Record<string, unknown> | null {
  // <script id="__NEXT_DATA__" type="application/json">{...}</script>
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!match) return null
  try {
    return JSON.parse(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Recursively walk an unknown value and collect all matching arrays/objects */
function deepFind<T>(
  value: unknown,
  predicate: (v: unknown) => T | null,
  results: T[] = [],
  depth = 0,
): T[] {
  if (depth > 15 || value === null || typeof value !== 'object') return results
  const found = predicate(value)
  if (found !== null) results.push(found)
  if (Array.isArray(value)) {
    for (const item of value) deepFind(item, predicate, results, depth + 1)
  } else {
    for (const val of Object.values(value as Record<string, unknown>)) {
      deepFind(val, predicate, results, depth + 1)
    }
  }
  return results
}

// ─── Ranking entry detection ──────────────────────────────────────────────────

interface RawEntry {
  rank: number
  name: string
  school: string
}

/**
 * Attempt to coerce an unknown object into a RawEntry.
 * Returns null if it does not look like a ranking entry.
 */
function asRankingEntry(obj: unknown): RawEntry | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const o = obj as Record<string, unknown>

  // Extract rank — must be a positive integer
  const rank =
    typeof o.rank === 'number' ? o.rank :
    typeof o.rankNumber === 'number' ? o.rankNumber :
    typeof o.position === 'number' ? o.position :
    typeof o.rank === 'string' ? parseInt(o.rank, 10) :
    null
  if (!rank || !Number.isFinite(rank) || rank <= 0) return null

  // Extract name — look in the object itself and one level of nested objects
  let name = ''
  const nameFields = ['name', 'fullName', 'displayName', 'athleteName', 'wrestlerName']
  for (const f of nameFields) {
    if (typeof o[f] === 'string' && o[f]) { name = o[f] as string; break }
  }

  // FloSports sometimes nests competitor info
  const nested = ['competitor', 'athlete', 'wrestler', 'person', 'user', 'member']
  for (const key of nested) {
    if (!name && o[key] && typeof o[key] === 'object') {
      const n = o[key] as Record<string, unknown>
      // firstName + lastName pattern
      if (typeof n.firstName === 'string' && typeof n.lastName === 'string') {
        name = `${n.firstName} ${n.lastName}`.trim()
        break
      }
      for (const f of nameFields) {
        if (typeof n[f] === 'string' && n[f]) { name = n[f] as string; break }
      }
      if (name) break
    }
  }
  if (!name) return null

  // Extract school
  let school = ''
  const schoolFields = ['school', 'team', 'teamName', 'program', 'institution', 'college', 'university']
  for (const f of schoolFields) {
    if (typeof o[f] === 'string' && o[f]) { school = o[f] as string; break }
  }
  for (const key of nested) {
    if (!school && o[key] && typeof o[key] === 'object') {
      const n = o[key] as Record<string, unknown>
      for (const f of schoolFields) {
        if (typeof n[f] === 'string' && n[f]) { school = n[f] as string; break }
      }
      if (school) break
    }
  }

  return { rank, name: normaliseFloName(name), school: school.trim() }
}

// ─── HTML fallback parsing ────────────────────────────────────────────────────

/**
 * Last-resort HTML parse: look for <ol> / <li> patterns with athlete names.
 * This is a best-effort approach if __NEXT_DATA__ yields nothing useful.
 */
function parseRankingsFromHtml(html: string, weight: number): FloRanking[] {
  const results: FloRanking[] = []

  // Try <script type="application/json"> blocks (some React apps use these)
  const scriptBlocks = html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of scriptBlocks) {
    try {
      const json = JSON.parse(block[1])
      const entries = deepFind<RawEntry>(json, asRankingEntry)
      if (entries.length > 0) {
        for (const e of entries) {
          results.push({ ...e, weight })
        }
        return results
      }
    } catch { /* skip */ }
  }

  return results
}

// ─── Sub-page discovery ───────────────────────────────────────────────────────

/**
 * Given the __NEXT_DATA__ and HTML of the main collection page, return
 * a list of per-weight-class sub-page URLs to fetch.
 */
function discoverWeightClassUrls(
  baseUrl: string,
  nextData: Record<string, unknown> | null,
  html: string,
): string[] {
  const found = new Set<string>()

  // ── Strategy 1: look in __NEXT_DATA__ for sub-category items ──────────────
  if (nextData) {
    // Collect all string values that look like /rankings/... paths
    const paths = deepFind<string>(nextData, (v) => {
      if (typeof v !== 'string') return null
      if (v.includes('/rankings/') && v.match(/\/rankings\/\d+[^/]*\/\d+/)) return v
      return null
    })
    for (const p of paths) {
      try {
        const url = p.startsWith('http') ? p : `https://www.flowrestling.org${p}`
        const u = new URL(url)
        const parts = u.pathname.split('/').filter(Boolean)
        // parts: ['rankings', 'collectionSlug', 'categorySlug']
        if (parts.length >= 3 && isWeightClassSegment(parts[2])) {
          found.add(`https://www.flowrestling.org${u.pathname}`)
        }
      } catch { /* skip */ }
    }
  }

  // ── Strategy 2: parse anchor href attributes from raw HTML ─────────────────
  const hrefRe = /href=["']([^"']*\/rankings\/[^"']+\/[^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1]
    try {
      const url = href.startsWith('http') ? href : `https://www.flowrestling.org${href}`
      const u = new URL(url)
      if (!u.hostname.includes('flowrestling.org')) continue
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length >= 3 && parts[0] === 'rankings' && isWeightClassSegment(parts[2])) {
        found.add(`https://www.flowrestling.org${u.pathname}`)
      }
    } catch { /* skip */ }
  }

  return [...found]
}

// ─── Single page scrape ───────────────────────────────────────────────────────

interface PageScrapeResult {
  rankings: FloRanking[]
  subPageUrls: string[]
  isCollectionPage: boolean
}

async function scrapePage(url: string, isCollection: boolean): Promise<PageScrapeResult> {
  const html = await fetchHtml(url)
  const nextData = extractNextData(html)

  // Determine weight class from URL slug
  const urlParts = new URL(url).pathname.split('/').filter(Boolean)
  const categorySlug = urlParts[urlParts.length - 1] ?? ''
  const weightFromUrl = extractWeightFromText(categorySlug)

  const rankings: FloRanking[] = []
  const errors: string[] = []

  // ── Extract ranking entries from __NEXT_DATA__ ─────────────────────────────
  if (nextData) {
    const rawEntries = deepFind<RawEntry>(nextData, asRankingEntry)

    if (rawEntries.length > 0) {
      // If we got a bunch of entries, determine their weight class.
      // If this is a weight-class page, use weightFromUrl (or derive from page title).
      let weight = weightFromUrl

      if (!weight) {
        // Try to find weight from page title in nextData
        const titles = deepFind<string>(nextData, (v) => {
          if (typeof v !== 'string') return null
          if (NCAA_WEIGHTS.some((w) => new RegExp(`\\b${w}\\b`).test(v))) return v
          return null
        })
        for (const t of titles) {
          weight = extractWeightFromText(t)
          if (weight) break
        }
      }

      for (const e of rawEntries) {
        rankings.push({ ...e, weight })
      }
    }
  }

  // ── Fallback: parse HTML directly ─────────────────────────────────────────
  if (rankings.length === 0) {
    const fallback = parseRankingsFromHtml(html, weightFromUrl)
    rankings.push(...fallback)
  }

  // ── Discover sub-page URLs (only on collection page) ──────────────────────
  const subPageUrls = isCollection
    ? discoverWeightClassUrls(url, nextData, html)
    : []

  return {
    rankings,
    subPageUrls,
    isCollectionPage: isCollection,
  }
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    // Next.js server-side fetch cache busting
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * When multiple pages return entries for the same wrestler + weight,
 * keep the one with the lowest (best) rank.
 */
function deduplicateRankings(rankings: FloRanking[]): FloRanking[] {
  const seen = new Map<string, FloRanking>()
  for (const r of rankings) {
    const key = `${r.weight}:${nameMatchKey(r.name)}`
    const existing = seen.get(key)
    if (!existing || r.rank < existing.rank) {
      seen.set(key, r)
    }
  }
  return [...seen.values()].sort((a, b) => a.weight - b.weight || a.rank - b.rank)
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Scrape all per-weight-class rankings from a FlowWrestling rankings collection.
 *
 * @param inputUrl  Any FlowWrestling rankings URL — the collection base or a
 *                  specific weight-class sub-page.  The function will always
 *                  fetch the collection root to discover all weight classes.
 */
export async function scrapeFloRankings(inputUrl: string): Promise<FloScrapeResult> {
  const errors: string[] = []
  const allRankings: FloRanking[] = []
  let pagesProcessed = 0

  // ── Resolve base URL ───────────────────────────────────────────────────────
  const baseUrl = extractBaseCollectionUrl(inputUrl)
  if (!baseUrl) {
    return {
      rankings: [],
      errors: [`Could not parse a valid FlowWrestling rankings URL from: ${inputUrl}`],
      pagesProcessed: 0,
    }
  }

  // ── Fetch the collection page ──────────────────────────────────────────────
  let collectionResult: PageScrapeResult
  try {
    collectionResult = await scrapePage(baseUrl, true)
    pagesProcessed++
  } catch (err) {
    return {
      rankings: [],
      errors: [`Failed to fetch collection page ${baseUrl}: ${String(err)}`],
      pagesProcessed: 0,
    }
  }

  // Keep any rankings found directly on the collection page
  if (collectionResult.rankings.length > 0) {
    allRankings.push(...collectionResult.rankings)
  }

  // ── Fetch each weight-class sub-page ───────────────────────────────────────
  const subUrls = collectionResult.subPageUrls

  if (subUrls.length === 0 && allRankings.length === 0) {
    errors.push(
      'Could not discover any weight-class sub-pages from the collection page. ' +
      'The page structure may have changed — check the console for raw HTML hints.',
    )
  }

  for (const subUrl of subUrls) {
    await sleep(REQUEST_DELAY_MS)
    try {
      const result = await scrapePage(subUrl, false)
      pagesProcessed++
      if (result.rankings.length > 0) {
        allRankings.push(...result.rankings)
      } else {
        errors.push(`No rankings found on sub-page: ${subUrl}`)
      }
    } catch (err) {
      errors.push(`Failed to scrape ${subUrl}: ${String(err)}`)
    }
  }

  return {
    rankings: deduplicateRankings(allRankings),
    errors,
    pagesProcessed,
  }
}

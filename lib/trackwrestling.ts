/**
 * TrackWrestling Scraper — lib/trackwrestling.ts
 *
 * Fetches live bracket data from TrackWrestling's internal REST API and
 * converts it into the per-athlete score breakdown our app needs.
 *
 * TrackWrestling API base: https://www.trackwrestling.com/tw/rest/g/public/tournament
 *
 * Endpoints used:
 *   GET /tw/rest/g/public/tournament/{TIM}                → tournament metadata + weightclasses
 *   GET /tw/rest/g/public/tournament/{TIM}/bracket/{wcId} → full bracket with bout results
 *
 * If TrackWrestling changes their API contract, the raw response is logged so
 * you can adapt the parsers below without re-architecting anything.
 */

import { BONUS_POINTS, PLACEMENT_POINTS } from '@/types'

// ─── Public return type ───────────────────────────────────────────────────────

export interface TWAthleteScore {
  name: string               // "Last, First" as returned by TrackWrestling
  school: string
  weight: number             // weight class in lbs
  championship_wins: number  // wins in championship bracket
  consolation_wins: number   // wins in consolation bracket
  bonus_points: number       // sum of per-win bonus (fall=2, tf=1.5, md=1, dec=0)
  placement: number | null   // 1–8, or null if not placed / tournament in progress
  placement_points: number   // PLACEMENT_POINTS[placement] or 0
}

export interface TWFetchResult {
  scores: TWAthleteScore[]
  errors: string[]
  weightClassesProcessed: number
}

// ─── Internal TrackWrestling API shapes ──────────────────────────────────────
// These reflect what the API actually returns. Fields we don't use are omitted.

interface TWCompetitor {
  id: number
  firstName?: string
  lastName?: string
  name?: string          // sometimes "Last, First", sometimes "First Last"
  teamName?: string
  school?: string
  seed?: number
}

interface TWBout {
  id: number
  roundName?: string     // e.g. "Championship - Round 1", "Consolation - Round 2"
  boutType?: string      // "championship" | "consolation" | "placement" | "pigtail"
  winner?: TWCompetitor | null
  loser?: TWCompetitor | null
  topCompetitor?: TWCompetitor | null
  bottomCompetitor?: TWCompetitor | null
  winType?: string       // "Decision","Major Decision","Technical Fall","Fall","Forfeit","Default","Disqualification","Medical Forfeit"
  place?: number | null  // set for placement bouts (1, 2, 3, 4, 5, 6, 7, 8)
  completed?: boolean
}

interface TWBracketResponse {
  weightClass?: {
    id: number
    name?: string
    weight?: number
  }
  competitors?: TWCompetitor[]
  bouts?: TWBout[]
}

interface TWTournamentResponse {
  id?: number | string
  name?: string
  weightClasses?: Array<{ id: number; weight?: number; name?: string }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the TIM (tournament ID) from any TrackWrestling URL */
export function extractTIM(url: string): string | null {
  // Handles: ?TIM=12345  /tournament/12345  /t/12345  etc.
  const queryMatch = url.match(/[?&]TIM=(\d+)/i)
  if (queryMatch) return queryMatch[1]

  const pathMatch = url.match(/\/(?:tournament|t)\/(\d+)/i)
  if (pathMatch) return pathMatch[1]

  // Last resort: bare number segment in the path
  const numberMatch = url.match(/\/(\d{5,})\b/)
  if (numberMatch) return numberMatch[1]

  return null
}

/** Normalise a competitor's display name to "First Last" (trimmed, lowercased for matching) */
export function normaliseName(c: TWCompetitor): string {
  if (c.firstName && c.lastName) {
    return `${c.firstName.trim()} ${c.lastName.trim()}`
  }
  if (c.name) {
    // "Last, First" → "First Last"
    const parts = c.name.split(',')
    if (parts.length === 2) {
      return `${parts[1].trim()} ${parts[0].trim()}`
    }
    return c.name.trim()
  }
  return ''
}

/** Map a TrackWrestling win-type string to a bonus point value */
function winTypeBonus(winType: string | undefined): number {
  if (!winType) return 0
  const lower = winType.toLowerCase()
  if (lower.includes('fall') || lower.includes('pin')) return BONUS_POINTS.fall
  if (lower.includes('tech')) return BONUS_POINTS.tech_fall
  if (lower.includes('major')) return BONUS_POINTS.major_decision
  if (lower.includes('forfeit') || lower.includes('default') || lower.includes('disq') || lower.includes('medical')) {
    return BONUS_POINTS.forfeit
  }
  return BONUS_POINTS.decision // standard decision
}

/** Is this bout in the championship bracket? */
function isChampionshipBout(bout: TWBout): boolean {
  const type = (bout.boutType ?? '').toLowerCase()
  const round = (bout.roundName ?? '').toLowerCase()
  return (
    type === 'championship' ||
    type === 'pigtail' ||
    round.includes('championship') ||
    round.includes('pigtail')
  )
}

/** Is this bout in the consolation bracket? */
function isConsolationBout(bout: TWBout): boolean {
  const type = (bout.boutType ?? '').toLowerCase()
  const round = (bout.roundName ?? '').toLowerCase()
  return (
    type === 'consolation' ||
    type === 'wrestleback' ||
    round.includes('consolation') ||
    round.includes('wrestleback') ||
    round.includes('blood round')
  )
}

/** Is this a placement/finals bout (determines final place)? */
function isPlacementBout(bout: TWBout): boolean {
  const type = (bout.boutType ?? '').toLowerCase()
  const round = (bout.roundName ?? '').toLowerCase()
  return (
    type === 'placement' ||
    type === 'finals' ||
    round.includes('champion') && (round.includes('final') || round.includes('1st')) ||
    round.includes('3rd') ||
    round.includes('5th') ||
    round.includes('7th') ||
    round.includes('consolation final')
  )
}

// ─── Per-weight-class parser ──────────────────────────────────────────────────

function parseBracket(
  data: TWBracketResponse,
  weight: number,
): TWAthleteScore[] {
  const bouts: TWBout[] = data.bouts ?? []
  const competitors: TWCompetitor[] = data.competitors ?? []

  // Build athlete score map keyed by normalised name
  const scoreMap = new Map<string, TWAthleteScore>()

  function getOrCreate(competitor: TWCompetitor): TWAthleteScore {
    const name = normaliseName(competitor)
    if (!scoreMap.has(name)) {
      scoreMap.set(name, {
        name,
        school: competitor.teamName ?? competitor.school ?? '',
        weight,
        championship_wins: 0,
        consolation_wins: 0,
        bonus_points: 0,
        placement: null,
        placement_points: 0,
      })
    }
    return scoreMap.get(name)!
  }

  // Seed all known competitors so athletes with 0 wins still appear
  for (const c of competitors) {
    if (normaliseName(c)) getOrCreate(c)
  }

  for (const bout of bouts) {
    if (!bout.completed) continue
    if (!bout.winner) continue

    const winner = bout.winner
    const winnerScore = getOrCreate(winner)
    const bonus = winTypeBonus(bout.winType)

    if (isChampionshipBout(bout)) {
      winnerScore.championship_wins += 1
      winnerScore.bonus_points += bonus
    } else if (isConsolationBout(bout)) {
      winnerScore.consolation_wins += 1
      winnerScore.bonus_points += bonus
    }

    // Placement bouts: winner gets their place, loser gets the next place down
    if (isPlacementBout(bout) && bout.place != null) {
      winnerScore.championship_wins += 1 // final championship win still counts
      winnerScore.bonus_points += bonus

      const place = bout.place
      winnerScore.placement = place
      winnerScore.placement_points = PLACEMENT_POINTS[place] ?? 0

      // Loser of 1st-place bout → 2nd place, etc.
      if (bout.loser) {
        const loserScore = getOrCreate(bout.loser)
        const loserPlace = place + 1
        if (loserPlace <= 8) {
          loserScore.placement = loserPlace
          loserScore.placement_points = PLACEMENT_POINTS[loserPlace] ?? 0
        }
      }
    }
  }

  return Array.from(scoreMap.values())
}

// ─── HTTP fetch helpers ───────────────────────────────────────────────────────

const TW_BASE = 'https://www.trackwrestling.com'

async function twFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${TW_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.trackwrestling.com/',
    },
    // Don't cache — we always want live data
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`TrackWrestling API ${path} → ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Fetch all bracket data for a TrackWrestling tournament and return
 * per-athlete score breakdowns ready to upsert into the `scores` table.
 *
 * @param tournamentUrl  Any TrackWrestling URL that contains the TIM parameter
 *                       e.g. https://www.trackwrestling.com/tw/public/tournaments/TournamentBrackets.jsp?TIM=912847832
 */
export async function fetchTrackWrestlingScores(
  tournamentUrl: string,
): Promise<TWFetchResult> {
  const errors: string[] = []
  const scores: TWAthleteScore[] = []

  // 1. Extract tournament ID
  const tim = extractTIM(tournamentUrl)
  if (!tim) {
    errors.push(
      `Could not find a TIM (tournament ID) in the URL: "${tournamentUrl}". ` +
      'Make sure the URL contains ?TIM=<number>.',
    )
    return { scores, errors, weightClassesProcessed: 0 }
  }

  // 2. Fetch tournament metadata to get weight class IDs
  let tournament: TWTournamentResponse
  try {
    tournament = await twFetch<TWTournamentResponse>(
      `/tw/rest/g/public/tournament/${tim}`,
    )
  } catch (err) {
    errors.push(`Failed to load tournament metadata: ${String(err)}`)
    return { scores, errors, weightClassesProcessed: 0 }
  }

  const weightClasses = tournament.weightClasses ?? []
  if (weightClasses.length === 0) {
    errors.push(
      `Tournament ${tim} returned no weight classes. ` +
      'The tournament may not have started yet, or the TIM may be wrong.',
    )
    return { scores, errors, weightClassesProcessed: 0 }
  }

  // 3. Fetch each weight class bracket in parallel
  const bracketResults = await Promise.allSettled(
    weightClasses.map(async (wc) => {
      const parsedFromName = Number((wc.name ?? '').replace(/[^0-9]/g, '')) || 0
      const weightLbs = wc.weight ?? parsedFromName

      const data = await twFetch<TWBracketResponse>(
        `/tw/rest/g/public/tournament/${tim}/bracket/${wc.id}`,
      )
      return { data, weight: weightLbs }
    }),
  )

  let processed = 0

  for (let i = 0; i < bracketResults.length; i++) {
    const result = bracketResults[i]
    const wcName = weightClasses[i]?.name ?? String(weightClasses[i]?.id)

    if (result.status === 'rejected') {
      errors.push(`Weight class "${wcName}": ${String(result.reason)}`)
      continue
    }

    const { data, weight } = result.value
    try {
      const weightScores = parseBracket(data, weight)
      scores.push(...weightScores)
      processed += 1
    } catch (err) {
      errors.push(`Weight class "${wcName}" parse error: ${String(err)}`)
    }
  }

  return { scores, errors, weightClassesProcessed: processed }
}

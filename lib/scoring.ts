import Papa from 'papaparse'
import { PLACEMENT_POINTS } from '@/types'

// ── Legacy types (kept for backward compatibility) ────────────────────────────

export interface ScoreRow {
  athlete_name: string
  event: string
  championship_wins: number
  consolation_wins: number
  bonus_points: number
  placement: number | null
}

export interface ParsedScoreResult {
  rows: ScoreRow[]
  errors: string[]
}

// ── New cumulative format ─────────────────────────────────────────────────────
// CSV columns: name, team, weight, place, score
// "score" is the cumulative total for the athlete.

export interface CumulativeScoreRow {
  name: string          // athlete name
  team: string          // source team (informational only)
  weight: number | null // weight class
  place: number | null  // final placement 1–8, or null if not placed
  score: number         // cumulative total points
}

export interface ParsedCumulativeResult {
  rows: CumulativeScoreRow[]
  errors: string[]
}

/**
 * Parses the new cumulative score CSV format.
 * Expected columns: name, team, weight, place, score
 *
 * "score" is the commissioner-provided running total — it overwrites
 * any previously stored scores for that athlete.
 */
export function parseCumulativeScoreCSV(csvText: string): ParsedCumulativeResult {
  const errors: string[] = []
  const rows: CumulativeScoreRow[] = []

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e) => `CSV parse error at row ${e.row}: ${e.message}`))
  }

  result.data.forEach((row, i) => {
    const lineNum = i + 2 // 1-indexed + header row

    const name = row.name?.trim()
    if (!name) {
      errors.push(`Row ${lineNum}: Missing required field "name"`)
      return
    }

    const scoreRaw = row.score?.trim()
    if (scoreRaw === undefined || scoreRaw === '') {
      errors.push(`Row ${lineNum}: Missing required field "score" for "${name}"`)
      return
    }

    const score = Number(scoreRaw)
    if (isNaN(score) || score < 0) {
      errors.push(`Row ${lineNum}: "score" must be a non-negative number for "${name}"`)
      return
    }

    const placeRaw = row.place?.trim()
    let place: number | null = null
    if (placeRaw && placeRaw !== '0' && placeRaw !== '') {
      place = Number(placeRaw)
      if (isNaN(place) || place < 1 || place > 8) {
        errors.push(`Row ${lineNum}: "place" must be 1–8 or empty for "${name}"`)
        return
      }
    }

    const weightRaw = row.weight?.trim()
    const weight = weightRaw ? Number(weightRaw) : null

    rows.push({
      name,
      team: row.team?.trim() ?? '',
      weight: weight && !isNaN(weight) ? weight : null,
      place,
      score,
    })
  })

  return { rows, errors }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Calculates placement points from a placement finish (1–8).
 */
export function calcPlacementPoints(placement: number | null): number {
  if (!placement) return 0
  return PLACEMENT_POINTS[placement] ?? 0
}

/**
 * Calculates the total points for a wrestler's tournament performance.
 */
export function calcTotalPoints(row: Omit<ScoreRow, 'athlete_name' | 'event'>): number {
  const advancement = row.championship_wins * 1.0 + row.consolation_wins * 0.5
  const placement = calcPlacementPoints(row.placement)
  return advancement + row.bonus_points + placement
}

/**
 * Generates a sample CSV string for the new cumulative score format.
 * Columns: name, team, weight, place, score
 */
export function generateScoreCSVTemplate(): string {
  const headers = 'name,team,weight,place,score'
  const example1 = '"John Smith","Iowa",125,1,31.5'
  const example2 = '"Mike Jones","Penn State",133,3,22.0'
  const example3 = '"Alex Brown","Ohio State",141,,8.5'
  const example4 = '"Chris Davis","Minnesota",149,5,18.0'
  return [headers, example1, example2, example3, example4].join('\n')
}

/**
 * Calculates team total points from a map of athlete_id → total_points.
 */
export function calcTeamTotal(
  teamAthleteIds: string[],
  athletePoints: Record<string, number>
): number {
  return teamAthleteIds.reduce((sum, id) => sum + (athletePoints[id] ?? 0), 0)
}

// ── Legacy CSV parser (kept for backward compatibility) ───────────────────────

/**
 * Parses the legacy CSV format.
 * Columns: athlete_name, event, championship_wins, consolation_wins, bonus_points, placement
 */
export function parseScoreCSV(csvText: string): ParsedScoreResult {
  const errors: string[] = []
  const rows: ScoreRow[] = []

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e) => `CSV parse error at row ${e.row}: ${e.message}`))
  }

  const requiredFields = ['athlete_name', 'event', 'championship_wins', 'consolation_wins', 'bonus_points']

  result.data.forEach((row, i) => {
    const lineNum = i + 2

    for (const field of requiredFields) {
      if (!row[field] && row[field] !== '0') {
        errors.push(`Row ${lineNum}: Missing required field "${field}"`)
        return
      }
    }

    const champWins = Number(row.championship_wins)
    const consolWins = Number(row.consolation_wins)
    const bonusPts = Number(row.bonus_points)
    const placement = row.placement ? Number(row.placement) : null

    if (isNaN(champWins) || champWins < 0) { errors.push(`Row ${lineNum}: championship_wins must be a non-negative number`); return }
    if (isNaN(consolWins) || consolWins < 0) { errors.push(`Row ${lineNum}: consolation_wins must be a non-negative number`); return }
    if (isNaN(bonusPts) || bonusPts < 0) { errors.push(`Row ${lineNum}: bonus_points must be a non-negative number`); return }
    if (placement !== null && (isNaN(placement) || placement < 1 || placement > 8)) {
      errors.push(`Row ${lineNum}: placement must be 1–8 or empty`); return
    }

    rows.push({
      athlete_name: row.athlete_name.trim(),
      event: row.event.trim(),
      championship_wins: champWins,
      consolation_wins: consolWins,
      bonus_points: bonusPts,
      placement,
    })
  })

  return { rows, errors }
}

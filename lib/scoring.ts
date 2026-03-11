import Papa from 'papaparse'
import { PLACEMENT_POINTS } from '@/types'

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
 * Parses a CSV file (as text) into score rows with validation.
 * Expected columns: athlete_name, event, championship_wins, consolation_wins, bonus_points, placement
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
    const lineNum = i + 2 // 1-indexed + header row

    // Check required fields
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

    if (isNaN(champWins) || champWins < 0) {
      errors.push(`Row ${lineNum}: championship_wins must be a non-negative number`)
      return
    }
    if (isNaN(consolWins) || consolWins < 0) {
      errors.push(`Row ${lineNum}: consolation_wins must be a non-negative number`)
      return
    }
    if (isNaN(bonusPts) || bonusPts < 0) {
      errors.push(`Row ${lineNum}: bonus_points must be a non-negative number`)
      return
    }
    if (placement !== null && (isNaN(placement) || placement < 1 || placement > 8)) {
      errors.push(`Row ${lineNum}: placement must be 1–8 or empty`)
      return
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

/**
 * Generates a sample CSV string for download as a template.
 */
export function generateScoreCSVTemplate(): string {
  const headers = 'athlete_name,event,championship_wins,consolation_wins,bonus_points,placement'
  const example1 = '"John Smith","NCAA-2024",3,1,3.5,3'
  const example2 = '"Mike Jones","NCAA-2024",2,0,2.0,6'
  const example3 = '"Alex Brown","NCAA-2024",0,1,0,0'
  return [headers, example1, example2, example3].join('\n')
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

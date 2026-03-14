import { Team, Athlete, DraftPick, CurrentPickInfo, WEIGHT_CLASSES } from '@/types'

const TOTAL_TEAMS = 10
const TOTAL_ROUNDS = 10 // one per weight class

/**
 * Given a pick number (1-indexed), returns which round it belongs to
 * and what position within that round (1-indexed).
 */
export function getPickMeta(pickNumber: number): {
  round: number
  positionInRound: number
  isOddRound: boolean
} {
  const round = Math.ceil(pickNumber / TOTAL_TEAMS)
  const positionInRound = ((pickNumber - 1) % TOTAL_TEAMS) + 1
  return { round, positionInRound, isOddRound: round % 2 !== 0 }
}

/**
 * Given a pick number and the ordered list of teams (by draft_position ascending),
 * returns which team picks next.
 */
export function getTeamForPick(
  pickNumber: number,
  teamsByDraftPosition: Team[]
): Team {
  const { positionInRound, isOddRound } = getPickMeta(pickNumber)
  const index = isOddRound ? positionInRound - 1 : TOTAL_TEAMS - positionInRound
  return teamsByDraftPosition[index]
}

/**
 * Returns the full snake draft order as an array of { pickNumber, round, team }
 * for display in the draft board.
 */
export function buildFullDraftOrder(
  teamsByDraftPosition: Team[]
): Array<{ pickNumber: number; round: number; teamId: string; teamName: string }> {
  const order = []
  for (let pick = 1; pick <= TOTAL_TEAMS * TOTAL_ROUNDS; pick++) {
    const { round } = getPickMeta(pick)
    const team = getTeamForPick(pick, teamsByDraftPosition)
    order.push({ pickNumber: pick, round, teamId: team.id, teamName: team.name })
  }
  return order
}

/**
 * Returns info about the current pick, including whether it's the given team's turn.
 */
export function getCurrentPickInfo(
  currentPickNumber: number,
  teamsByDraftPosition: Team[],
  myTeamId: string | null
): CurrentPickInfo | null {
  if (currentPickNumber > TOTAL_TEAMS * TOTAL_ROUNDS) return null
  const { round } = getPickMeta(currentPickNumber)
  const team = getTeamForPick(currentPickNumber, teamsByDraftPosition)
  return {
    pick_number: currentPickNumber,
    round,
    team_id: team.id,
    team_name: team.name,
    is_my_turn: myTeamId === team.id,
  }
}

/**
 * Validates whether a team can legally pick an athlete.
 * Returns an error string if invalid, null if valid.
 */
export function validatePick(
  athlete: Athlete,
  team: Team,
  existingPicks: DraftPick[]
): string | null {
  // Already drafted?
  if (athlete.is_drafted) {
    return 'This athlete has already been drafted.'
  }

  const teamPicks = existingPicks.filter((p) => p.team_id === team.id)

  // Check weight class constraint: one athlete per weight
  const hasWeight = teamPicks.some((p) => p.athlete?.weight === athlete.weight)
  if (hasWeight) {
    return `Your team already has an athlete in the ${athlete.weight} lbs weight class.`
  }

  // Check seed constraint: one athlete per seed
  const hasSeed = teamPicks.some((p) => p.athlete?.seed === athlete.seed)
  if (hasSeed) {
    return `Your team already has an athlete with seed #${athlete.seed}.`
  }

  return null
}

/**
 * Returns which weight classes a team still needs to fill.
 */
export function getRemainingWeights(
  teamId: string,
  existingPicks: DraftPick[]
): number[] {
  const teamPicks = existingPicks.filter((p) => p.team_id === teamId)
  const draftedWeights = new Set(teamPicks.map((p) => p.athlete?.weight).filter(Boolean))
  return WEIGHT_CLASSES.filter((w) => !draftedWeights.has(w))
}

/**
 * Filters available (undrafted) athletes that a team can legally pick.
 */
export function getEligibleAthletes(
  athletes: Athlete[],
  teamId: string,
  existingPicks: DraftPick[]
): Athlete[] {
  return athletes.filter(
    (a) => !a.is_drafted && validatePick(a, { id: teamId } as Team, existingPicks) === null
  )
}

/**
 * Returns the top available wishlist athlete that the team can legally pick.
 */
export function getAutoPickAthlete(
  wishlist: Array<{ athlete_id: string; rank: number }>,
  availableAthletes: Athlete[],
  teamId: string,
  existingPicks: DraftPick[]
): Athlete | null {
  const availableIds = new Set(
    availableAthletes
      .filter((a) => validatePick(a, { id: teamId } as Team, existingPicks) === null)
      .map((a) => a.id)
  )
  const sorted = [...wishlist].sort((a, b) => a.rank - b.rank)
  for (const item of sorted) {
    if (availableIds.has(item.athlete_id)) {
      return availableAthletes.find((a) => a.id === item.athlete_id) ?? null
    }
  }
  return null
}

/**
 * Returns the best available athlete for auto-pick when the wishlist has no
 * eligible options. Selection priority:
 *   1. Lowest seed number (seed 1 = highest-ranked)
 *   2. Ties broken by weight class order (lightest first)
 *
 * Only returns athletes that pass validatePick for the given team.
 */
export function getBestAvailableAthlete(
  athletes: Athlete[],
  teamId: string,
  existingPicks: DraftPick[]
): Athlete | null {
  const eligible = athletes
    .filter((a) => !a.is_drafted && validatePick(a, { id: teamId } as Team, existingPicks) === null)
    .sort((a, b) => a.seed - b.seed || a.weight - b.weight)
  return eligible[0] ?? null
}

/**
 * Full auto-pick selection: wishlist first, then best available athlete.
 */
export function selectAutoPickAthlete(
  wishlist: Array<{ athlete_id: string; rank: number }>,
  athletes: Athlete[],
  teamId: string,
  existingPicks: DraftPick[]
): Athlete | null {
  const fromWishlist = getAutoPickAthlete(wishlist, athletes, teamId, existingPicks)
  if (fromWishlist) return fromWishlist
  return getBestAvailableAthlete(athletes, teamId, existingPicks)
}

/**
 * Calculates remaining seconds on the pick timer.
 * Returns null if no timer is set.
 */
export function getRemainingSeconds(
  pickStartedAt: string | null,
  pickTimerSeconds: number
): number | null {
  if (!pickStartedAt || pickTimerSeconds === 0) return null
  const elapsed = (Date.now() - new Date(pickStartedAt).getTime()) / 1000
  return Math.max(0, Math.floor(pickTimerSeconds - elapsed))
}

/**
 * Formats pick number as "Round X, Pick Y"
 */
export function formatPickLabel(pickNumber: number): string {
  const { round, positionInRound } = getPickMeta(pickNumber)
  return `Round ${round}, Pick ${positionInRound}`
}

/**
 * Returns the current hour (0-23) in America/Chicago timezone.
 * Works in both Node.js (server) and browser environments.
 */
export function getCurrentChicagoHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  )
}

/**
 * Returns true if the draft should currently be paused due to the
 * overnight pause window (times in America/Chicago timezone).
 *
 * Handles windows that cross midnight (e.g. 22 → 8) and same-day
 * windows (e.g. 2 → 6, unlikely but supported).
 *
 * @param overnight_pause_enabled  - feature toggle
 * @param pause_start_hour         - hour (0-23 Chicago) when pause begins
 * @param pause_end_hour           - hour (0-23 Chicago) when draft resumes
 */
export function isInOvernightPause(
  overnight_pause_enabled: boolean,
  pause_start_hour: number,
  pause_end_hour: number
): boolean {
  if (!overnight_pause_enabled) return false
  const hour = getCurrentChicagoHour()
  if (pause_start_hour > pause_end_hour) {
    // Window crosses midnight — e.g. 22 → 8
    return hour >= pause_start_hour || hour < pause_end_hour
  }
  // Same-day window — e.g. 2 → 6
  return hour >= pause_start_hour && hour < pause_end_hour
}

/**
 * Formats an hour integer (0-23) as a readable 12-hour time string.
 * e.g. 0 → "12:00 AM", 13 → "1:00 PM"
 */
export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  const period = hour < 12 ? 'AM' : 'PM'
  return `${h}:00 ${period}`
}

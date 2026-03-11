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
 * Returns the top available wishlist athlete for auto-pick.
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

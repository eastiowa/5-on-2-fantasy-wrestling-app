/**
 * predictions.ts — NCAA Wrestling Fantasy Prediction Engine
 *
 * Computes two things after each score sync:
 *
 *   1. Per-athlete: expected_points_remaining + projected_total
 *      Using a Monte Carlo simulation of the remaining bracket.
 *
 *   2. Per-team: projected_total + win_probability
 *      Win probability = fraction of simulations where that team scores the most points.
 *
 * MODEL OVERVIEW
 * ──────────────
 * • Bradley-Terry model: P(A beats B) = power(A) / (power(A) + power(B))
 * • Seed power ratings are loaded from the seed_power_ratings DB table
 *   (seeded by migration 015; defaults below are used as fallback).
 * • Within each weight class, remaining bouts are simulated by sorting
 *   active athletes by power and pairing top-half vs bottom-half each round
 *   (an approximation of the seeded NCAA bracket structure).
 * • Championship bracket: up to 4 rounds → placements 1st / 2nd.
 *   (Semi-final losers drop into consolation for 3rd/4th.)
 * • Consolation bracket: athletes who lost once in championship survive
 *   for placements 3rd–8th depending on when they lost.
 * • Average bonus points per win: ~0.30 pts (empirical NCAA average).
 *
 * USAGE
 * ─────
 * Called exclusively from POST /api/projections/recalculate (server-side).
 * No client-side exposure.
 */

import { PLACEMENT_POINTS } from '@/types'

// ─── Seed power ratings (Bradley-Terry) ──────────────────────────────────────
// Used as fallback when the DB table isn't available.
// Derived from historical NCAA wrestling championship data.
export const DEFAULT_SEED_POWER: Record<number, number> = {
   1: 100.0,  2: 82.0,  3: 67.0,  4: 65.0,
   5:  52.0,  6: 50.0,  7: 48.0,  8: 46.0,
   9:  36.0, 10: 34.0, 11: 32.0, 12: 30.0,
  13:  24.0, 14: 22.0, 15: 20.0, 16: 18.0,
  17:  15.0, 18: 14.0, 19: 13.0, 20: 12.0,
  21:  11.0, 22: 10.5, 23: 10.0, 24:  9.5,
  25:   9.0, 26:  8.5, 27:  8.0, 28:  7.5,
  29:   7.0, 30:  6.5, 31:  6.0, 32:  5.5,
  33:   5.0,
}

/** Average bonus points earned per win (fall=2, tech=1.5, major=1, dec=0). */
const AVG_BONUS_PER_WIN = 0.30

// ─── Pre-tournament model data (from uploaded simulation CSV) ─────────────────

/**
 * Per-athlete data from the external Monte Carlo simulation CSV.
 * Loaded from the athlete_model_data table and passed to computeProjections.
 * When present, these values replace the seed-based bracket simulation.
 *
 * Supports both CSV formats:
 *   v1 (mc_full_results_2026.csv)               — ws_elo, bonus_rate present
 *   v2 (final_mc_simulation_ncaa_scoring_*.csv)  — round-conditional pts present
 */
export interface AthleteModelData {
  athlete_id: string

  // Monte Carlo placement probability distribution (sum ≤ 1.0; remainder = DNP)
  mc_p1: number
  mc_p2: number
  mc_p3: number
  mc_p4: number
  mc_p5: number
  mc_p6: number
  mc_p7: number
  mc_p8: number
  mc_top8: number

  // Pre-tournament expected fantasy points (maps to ncaa_expected_team_points in v2)
  mc_expected_points: number

  // v1-only skill metrics
  ws_elo: number | null
  bonus_rate: number | null

  // v2: round-conditional expected PLACEMENT points
  // = expected placement pts if this athlete wins the named round
  // Used by conditionalExpectedRemaining() for precise in-tournament projections
  exp_pts_qf_win:    number | null  // wins championship QF
  exp_pts_sf_win:    number | null  // wins championship SF
  exp_pts_champ_win: number | null  // wins championship final
  exp_pts_blood_win: number | null  // wins blood round (consolation)
  exp_pts_wb_qf_win: number | null  // wins wrestleback QF
  exp_pts_wb_sf_win: number | null  // wins wrestleback SF
  exp_pts_3rd_win:   number | null  // wins 3rd-place bout
  exp_pts_5th_win:   number | null  // wins 5th-place bout
  exp_pts_7th_win:   number | null  // wins 7th-place bout

  // v2: milestone probabilities
  prob_secures_finals: number | null  // P(reaches championship final)
  prob_secures_aa:     number | null  // P(All-American via blood round)
  prob_secures_top6:   number | null  // P(top-6 via wrestleback QF)
  prob_secures_top4:   number | null  // P(top-4 via wrestleback SF)
}

/** Return the mc_p distribution as an array indexed by placement 1–8. */
function mcPArray(m: AthleteModelData): number[] {
  return [0, m.mc_p1, m.mc_p2, m.mc_p3, m.mc_p4, m.mc_p5, m.mc_p6, m.mc_p7, m.mc_p8]
  // index 0 is unused; index 1 = p(1st place), etc.
}

/**
 * Given a bracket state, return the set of placements (1–8) that are still
 * achievable for this athlete.
 *
 * NCAA bracket rules:
 *   Championship k=0–1: all 8 placements still possible
 *   Championship k=2 (in SF): must place 1st–4th (SF loser goes to 3rd/4th bout)
 *   Championship k≥3 (in Finals): must place 1st or 2nd
 *   Consolation, lost from champ k=0 (R1 loss): can reach 7th–8th at best
 *   Consolation, lost from champ k=1 (QF loss): can reach 5th–8th
 *   Consolation, lost from champ k≥2 (SF loss): can reach 3rd–4th
 */
export function getAchievablePlacements(
  bracketStatus: BracketStatus,
  championshipWins: number,
): number[] {
  if (bracketStatus === 'placed' || bracketStatus === 'eliminated') return []

  if (bracketStatus === 'championship') {
    if (championshipWins >= 3) return [1, 2]
    if (championshipWins >= 2) return [1, 2, 3, 4]
    return [1, 2, 3, 4, 5, 6, 7, 8]
  }

  if (bracketStatus === 'consolation') {
    if (championshipWins >= 2) return [3, 4]         // lost in SF
    if (championshipWins >= 1) return [5, 6, 7, 8]  // lost in QF
    return [7, 8]                                    // lost in R1
  }

  // 'unknown' — pre-tournament; all placements possible
  return [1, 2, 3, 4, 5, 6, 7, 8]
}

/**
 * Expected remaining points for an athlete, conditioned on their current bracket state.
 *
 * STRATEGY A (v2 CSV — preferred): Use the round-conditional expected placement
 * points from the model directly.  These are pre-computed per-athlete values for
 * "what are my expected placement points if I win the next round?"  Combined with
 * an advancement points estimate, this gives a precise in-tournament projection.
 *
 * STRATEGY B (v1 CSV fallback): Bayesian update of the mc_p distribution over
 * achievable placements.
 *
 * Returns 0 for placed or eliminated athletes.
 */
export function conditionalExpectedRemaining(
  model: AthleteModelData,
  bracketStatus: BracketStatus,
  championshipWins: number,
  consolationWins: number,
  currentPoints: number,
): number {
  if (bracketStatus === 'placed' || bracketStatus === 'eliminated') return 0

  // Pre-tournament / unknown: use full model expectation
  if (bracketStatus === 'unknown') {
    return Math.max(0, model.mc_expected_points - currentPoints)
  }

  // ── Strategy A: round-conditional expected placement points (v2 CSV) ───────
  //
  // Look up the correct conditional expected placement pts based on bracket state.
  // For championship bracket: "winning the next round" determines their expected pts.
  // For consolation bracket: similarly.
  //
  // bracketStatus = 'championship', championshipWins:
  //   0 → about to wrestle R1/pigtail → no direct lookup; use Bayesian fallback
  //   1 → about to wrestle QF         → exp_pts_qf_win
  //   2 → about to wrestle SF         → exp_pts_sf_win
  //   3 → about to wrestle Finals     → exp_pts_champ_win
  //
  // bracketStatus = 'consolation', consolationWins:
  //   0 → in blood round area         → exp_pts_blood_win
  //   1 → in wrestleback QF area      → exp_pts_wb_qf_win
  //   2 → in wrestleback SF area      → exp_pts_wb_sf_win
  //   (entered consolation from SF loss: 3rd/4th bout)
  //   special: championshipWins ≥ 2   → exp_pts_3rd_win
  //
  // These are the EXPECTED placement points from this point forward.
  // We add estimated advancement pts and subtract what's already been earned.

  let conditionalPlacementPts: number | null = null

  if (bracketStatus === 'championship') {
    if (championshipWins === 3 && model.exp_pts_champ_win !== null) {
      conditionalPlacementPts = model.exp_pts_champ_win
    } else if (championshipWins === 2 && model.exp_pts_sf_win !== null) {
      conditionalPlacementPts = model.exp_pts_sf_win
    } else if (championshipWins === 1 && model.exp_pts_qf_win !== null) {
      conditionalPlacementPts = model.exp_pts_qf_win
    }
    // championshipWins === 0: pre-first-bout; use Bayesian fallback below
  }

  if (bracketStatus === 'consolation') {
    if (championshipWins >= 2 && model.exp_pts_3rd_win !== null) {
      // Lost in SF → 3rd/4th bout
      conditionalPlacementPts = model.exp_pts_3rd_win
    } else if (consolationWins >= 2 && model.exp_pts_wb_sf_win !== null) {
      conditionalPlacementPts = model.exp_pts_wb_sf_win
    } else if (consolationWins >= 1 && model.exp_pts_wb_qf_win !== null) {
      conditionalPlacementPts = model.exp_pts_wb_qf_win
    } else if (model.exp_pts_blood_win !== null) {
      conditionalPlacementPts = model.exp_pts_blood_win
    }
  }

  if (conditionalPlacementPts !== null) {
    // Add estimated remaining advancement points
    const effectiveBonus = model.bonus_rate ?? AVG_BONUS_PER_WIN
    const champWinsLeft =
      bracketStatus === 'championship'
        ? Math.max(0, 4 - championshipWins)
        : 0
    const consolWinsLeft =
      bracketStatus === 'consolation'
        ? Math.max(0, 3 - consolationWins)
        : 0
    // Discount by expected win rate — athlete won't necessarily win every remaining bout
    const effectiveWinsLeft = (champWinsLeft + consolWinsLeft) * 0.5
    const advancementPts = effectiveWinsLeft * (1 + effectiveBonus)

    return Math.max(0, conditionalPlacementPts + advancementPts - currentPoints)
  }

  // ── Strategy B: Bayesian update of mc_p distribution (v1 CSV fallback) ────
  const achievable = getAchievablePlacements(bracketStatus, championshipWins)
  if (achievable.length === 0) return 0

  const pArr = mcPArray(model)
  const achievableMass = achievable.reduce((s, p) => s + (pArr[p] ?? 0), 0)

  let bPlacementPts: number
  if (achievableMass <= 0.001) {
    bPlacementPts =
      achievable.reduce((s, p) => s + (PLACEMENT_POINTS[p] ?? 0), 0) / achievable.length
  } else {
    bPlacementPts = achievable.reduce((s, p) => {
      return s + ((pArr[p] ?? 0) / achievableMass) * (PLACEMENT_POINTS[p] ?? 0)
    }, 0)
  }

  const effectiveBonus = model.bonus_rate ?? AVG_BONUS_PER_WIN
  const champWinsRemaining =
    bracketStatus === 'championship' ? Math.max(0, (3.5 - championshipWins) * 0.5) : 0
  const consolWinsRemaining =
    bracketStatus === 'consolation' ? Math.max(0, 1.5 - consolationWins * 0.3) : 0
  const advancementPts = (champWinsRemaining + consolWinsRemaining) * (1 + effectiveBonus)

  return Math.max(0, bPlacementPts + advancementPts - currentPoints)
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type BracketStatus =
  | 'championship' // still alive in championship bracket
  | 'consolation'  // lost once in championship, alive in consolation
  | 'placed'       // tournament over; placement is set
  | 'eliminated'   // lost in consolation (or pigtail) without placing
  | 'unknown'      // default before first scrape

/** The current state of one athlete, as read from the DB. */
export interface AthleteStateForProjection {
  athlete_id: string
  seed: number
  current_points: number       // total_points already earned (actual, from scores table)
  bracket_status: BracketStatus
  championship_wins: number    // wins in championship bracket so far
  consolation_wins: number     // wins in consolation bracket so far
  placement: number | null     // 1–8 if tournament is finished for this athlete
}

/** Per-team roster map used as input to the simulation. */
export interface TeamRoster {
  team_id: string
  athlete_ids: string[]
}

/** Output: per-athlete projection. */
export interface AthleteProjection {
  athlete_id: string
  expected_points_remaining: number
  projected_total: number
  bracket_status: BracketStatus
  championship_round: number   // rounds won in championship bracket (= championship_wins)
  consolation_round: number    // rounds won in consolation bracket (= consolation_wins)
}

/** Output: per-team projection. */
export interface TeamProjectionResult {
  team_id: string
  projected_total: number   // sum of athlete projected_totals
  win_probability: number   // 0.0–1.0 (fraction of simulations this team finished 1st)
}

// ─── Internal simulation types ────────────────────────────────────────────────

interface SimAthlete {
  athlete_id: string
  seed: number
  power: number
  /** 'championship' | 'consolation' | 'done' */
  bracket: 'championship' | 'consolation' | 'done'
  /**
   * Which championship round did they lose?
   * null = still in championship or placed.
   * 0    = lost in pigtail / before round 1 (not applicable for our model).
   * 1    = lost in championship round 1.
   * 2    = lost in championship QF.
   * 3    = lost in championship SF → guaranteed 3rd/4th consolation path.
   */
  champ_loss_round: number | null
  champ_wins: number       // championship wins accumulated in this simulation
  consol_wins: number      // consolation wins accumulated in this simulation
  final_placement: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the Bradley-Terry power for a given seed. */
export function getSeedPower(
  seed: number,
  ratings: Record<number, number> = DEFAULT_SEED_POWER,
): number {
  if (ratings[seed] !== undefined) return ratings[seed]
  // Extrapolate beyond seed 33 using a decaying formula
  return Math.max(2, 110 - seed * 3.2)
}

/** Bradley-Terry win probability: P(A beats B). */
export function winProbability(powerA: number, powerB: number): number {
  const total = powerA + powerB
  if (total <= 0) return 0.5
  return powerA / total
}

/** Fast LCG pseudo-random number generator (seeded per simulation run). */
function makePrng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s = Math.imul(s, 1664525) + 1013904223
    s = s >>> 0
    return s / 0x100000000
  }
}

/** Compute placement points using the global lookup table. */
function placementPts(place: number | null): number {
  if (place === null) return 0
  return PLACEMENT_POINTS[place] ?? 0
}

// ─── Bracket simulation (one weight class, one iteration) ─────────────────────

/**
 * Simulate the remaining tournament rounds for one weight class.
 *
 * Returns a map of athlete_id → {additional_points, final_placement}.
 * "additional_points" = points earned FROM NOW (not including already-earned).
 *
 * Bracket model (simplified NCAA wrestling):
 *   Championship: round-by-round, top-power vs bottom-power pairing.
 *     • 4 rounds total → placements 1st and 2nd.
 *     • Losers fall to consolation at the round they lost.
 *   Consolation:
 *     • Athletes who lost in champ round 3 (SF) → consolation SF → 3rd/4th.
 *     • Athletes who lost earlier → consolation bracket; further rounds
 *       are simulated until 3rd–8th places are filled.
 *     • Blood-round survivors (3+ consol wins) compete for 5th–8th.
 */
function simulateWeightClass(
  athletes: SimAthlete[],
  rng: () => number,
): Map<string, { extra_points: number; final_placement: number | null }> {
  const result = new Map<string, { extra_points: number; final_placement: number | null }>()

  // Initialise result map
  for (const a of athletes) {
    result.set(a.athlete_id, { extra_points: 0, final_placement: a.final_placement })
  }

  // Helpers
  function addChampWin(a: SimAthlete) {
    a.champ_wins++
    result.get(a.athlete_id)!.extra_points += 1 + AVG_BONUS_PER_WIN
  }

  function addConsolWin(a: SimAthlete) {
    a.consol_wins++
    result.get(a.athlete_id)!.extra_points += 0.5 + AVG_BONUS_PER_WIN
  }

  function assignPlacement(a: SimAthlete, place: number) {
    a.final_placement = place
    a.bracket = 'done'
    result.get(a.athlete_id)!.final_placement = place
    result.get(a.athlete_id)!.extra_points += placementPts(place)
  }

  /**
   * Run one round of pairing within a group.
   * Sorts by power descending, pairs index i vs index (n-1-i).
   * Winner advances, loser goes to loseList.
   */
  function runPairingRound(
    group: SimAthlete[],
    onWin: (w: SimAthlete) => void,
    onLose: (l: SimAthlete) => void,
  ): SimAthlete[] {
    const sorted = [...group].sort((a, b) => b.power - a.power)
    const winners: SimAthlete[] = []
    const half = Math.floor(sorted.length / 2)

    for (let i = 0; i < half; i++) {
      const high = sorted[i]
      const low  = sorted[sorted.length - 1 - i]
      const pHigh = winProbability(high.power, low.power)
      if (rng() < pHigh) {
        onWin(high); winners.push(high)
        onLose(low)
      } else {
        onWin(low); winners.push(low)
        onLose(high)
      }
    }

    // If odd number, the middle athlete gets a bye (advances automatically)
    if (sorted.length % 2 === 1) {
      winners.push(sorted[half])
    }

    return winners
  }

  // ── Championship bracket simulation ──────────────────────────────────────

  // Round 3 (SF) losers enter a special consolation path for 3rd/4th
  let champ = athletes.filter(a => a.bracket === 'championship')
  let consol = athletes.filter(a => a.bracket === 'consolation')

  // Track which championship round we're simulating (relative to current state)
  // We simulate until ≤2 athletes remain in the championship bracket (finals)
  const sfLosers: SimAthlete[] = []

  while (champ.length > 2) {
    const loseList: SimAthlete[] = []
    champ = runPairingRound(
      champ,
      (w) => addChampWin(w),
      (l) => {
        // Determine the round the loser exited at
        l.champ_loss_round = l.champ_wins // e.g. lost with k wins = lost at round k+1
        if (l.champ_wins >= 2) {
          // Lost in SF or later → goes to consolation SF path (3rd/4th)
          sfLosers.push(l)
        } else {
          l.bracket = 'consolation'
          loseList.push(l)
        }
      },
    )
    consol.push(...loseList)
  }

  // Championship finals (1st/2nd place bout)
  if (champ.length === 2) {
    addChampWin(champ[0]) // both get a final win accounted before bout
    addChampWin(champ[1])
    const [a, b] = champ
    const pA = winProbability(a.power, b.power)
    if (rng() < pA) {
      assignPlacement(a, 1)
      assignPlacement(b, 2)
    } else {
      assignPlacement(b, 1)
      assignPlacement(a, 2)
    }
  } else if (champ.length === 1) {
    // Uncontested (should not happen in practice)
    assignPlacement(champ[0], 1)
  }

  // ── 3rd / 4th place bout (SF losers) ──────────────────────────────────────
  if (sfLosers.length >= 2) {
    const [a, b] = sfLosers.slice(0, 2)
    const pA = winProbability(a.power, b.power)
    addConsolWin(a); addConsolWin(b) // one more consolation win each
    if (rng() < pA) {
      assignPlacement(a, 3)
      assignPlacement(b, 4)
    } else {
      assignPlacement(b, 3)
      assignPlacement(a, 4)
    }
    // Any extras (shouldn't happen normally) get 4th
    sfLosers.slice(2).forEach(l => assignPlacement(l, 4))
  } else if (sfLosers.length === 1) {
    addConsolWin(sfLosers[0])
    assignPlacement(sfLosers[0], 3)
  }

  // ── Consolation bracket simulation → 5th–8th places ─────────────────────
  // Run consolation rounds until at most 4 athletes remain for final placements
  while (consol.length > 4) {
    const loseList: SimAthlete[] = []
    consol = runPairingRound(
      consol,
      (w) => addConsolWin(w),
      (l) => {
        l.bracket = 'done'
        loseList.push(l)
      },
    )
    // Eliminated consolation athletes get no placement points (8th+ or DNP)
    for (const l of loseList) {
      if (!result.get(l.athlete_id)!.final_placement) {
        // No placement for early consolation exits (blood-round exits get 7th-8th later)
      }
    }
  }

  // 5th–8th place bouts
  if (consol.length === 4) {
    const sorted = [...consol].sort((a, b) => b.power - a.power)

    // 5th/6th bout
    const [a5, a6] = [sorted[0], sorted[3]]
    const p5 = winProbability(a5.power, a6.power)
    addConsolWin(a5); addConsolWin(a6)
    if (rng() < p5) {
      assignPlacement(a5, 5); assignPlacement(a6, 6)
    } else {
      assignPlacement(a6, 5); assignPlacement(a5, 6)
    }

    // 7th/8th bout
    const [a7, a8] = [sorted[1], sorted[2]]
    const p7 = winProbability(a7.power, a8.power)
    addConsolWin(a7); addConsolWin(a8)
    if (rng() < p7) {
      assignPlacement(a7, 7); assignPlacement(a8, 8)
    } else {
      assignPlacement(a8, 7); assignPlacement(a7, 8)
    }
  } else if (consol.length === 3) {
    const sorted = [...consol].sort((a, b) => b.power - a.power)
    addConsolWin(sorted[0]); addConsolWin(sorted[2])
    const p = winProbability(sorted[0].power, sorted[2].power)
    if (rng() < p) {
      assignPlacement(sorted[0], 5)
      assignPlacement(sorted[2], 6)
    } else {
      assignPlacement(sorted[2], 5)
      assignPlacement(sorted[0], 6)
    }
    assignPlacement(sorted[1], 7)
  } else if (consol.length === 2) {
    const [a, b] = consol
    addConsolWin(a); addConsolWin(b)
    const p = winProbability(a.power, b.power)
    if (rng() < p) {
      assignPlacement(a, 5); assignPlacement(b, 6)
    } else {
      assignPlacement(b, 5); assignPlacement(a, 6)
    }
  } else if (consol.length === 1) {
    addConsolWin(consol[0])
    assignPlacement(consol[0], 5)
  }

  return result
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Compute athlete and team projections.
 *
 * TWO MODES depending on whether pre-tournament model data is provided:
 *
 * ── MODE A: Model data available (mc_p distributions from upload-model CSV) ──
 *   Per-athlete expected_points_remaining is computed analytically via
 *   conditionalExpectedRemaining(), conditioned on the athlete's current
 *   bracket state.  This is faster and more accurate than bracket simulation.
 *
 *   Team win probability uses a Monte Carlo that draws each athlete's final
 *   placement from their conditional mc_p distribution — no bracket structure
 *   needed, just the per-athlete placement PDFs.
 *
 * ── MODE B: No model data (fallback) ──────────────────────────────────────────
 *   Runs the full bracket simulation (original behaviour) using seed-based
 *   Bradley-Terry power ratings.
 *
 * @param athletes       All athletes for the current season with current state.
 * @param teamRosters    Mapping of team_id → athlete_ids.
 * @param seedRatings    Fallback power ratings keyed by seed.
 * @param weightClasses  athlete_id → weight class integer (Mode B only).
 * @param modelData      Optional per-athlete model data from upload-model CSV.
 * @param iterations     Monte Carlo iterations (default 3 000).
 */
export function computeProjections({
  athletes,
  teamRosters,
  seedRatings = DEFAULT_SEED_POWER,
  weightClasses,
  modelData,
  iterations = 3000,
}: {
  athletes: AthleteStateForProjection[]
  teamRosters: TeamRoster[]
  seedRatings?: Record<number, number>
  weightClasses: Record<string, number>
  modelData?: Map<string, AthleteModelData>   // athlete_id → model data
  iterations?: number
}): {
  athleteProjections: Map<string, AthleteProjection>
  teamProjections: Map<string, TeamProjectionResult>
} {
  const athleteById = new Map<string, AthleteStateForProjection>()
  for (const a of athletes) athleteById.set(a.athlete_id, a)

  // ── Per-athlete expected_points_remaining ────────────────────────────────────

  // athleteExpectedRemaining[id] = the final (analytical or averaged) estimate
  const athleteExpectedRemaining = new Map<string, number>()

  if (modelData && modelData.size > 0) {
    // ── MODE A: analytical calculation via mc_p distributions ─────────────────
    for (const a of athletes) {
      const md = modelData.get(a.athlete_id)
      if (md) {
        const epr = conditionalExpectedRemaining(
          md,
          a.bracket_status,
          a.championship_wins,
          a.consolation_wins,
          a.current_points,
        )
        athleteExpectedRemaining.set(a.athlete_id, epr)
      } else {
        // No model data for this athlete — fall back to seed power simulation
        // We run a mini 1-athlete-equivalent estimate using getSeedPower
        // (bracket simulation path handled below for mixed rosters)
        athleteExpectedRemaining.set(a.athlete_id, 0)
      }
    }

    // For athletes without model data, supplement with bracket sim averages
    const noModelAthletes = athletes.filter(a => !modelData.has(a.athlete_id))
    if (noModelAthletes.length > 0) {
      const byWeight = new Map<number, AthleteStateForProjection[]>()
      for (const a of noModelAthletes) {
        const wc = weightClasses[a.athlete_id] ?? 0
        if (!byWeight.has(wc)) byWeight.set(wc, [])
        byWeight.get(wc)!.push(a)
      }
      const fallbackSums = new Map<string, number>()
      for (const a of noModelAthletes) fallbackSums.set(a.athlete_id, 0)

      for (let iter = 0; iter < iterations; iter++) {
        const rng = makePrng(iter * 7919 + 99991)
        for (const [, wcAthletes] of byWeight) {
          const simAthletes: SimAthlete[] = wcAthletes.map(a => ({
            athlete_id: a.athlete_id,
            seed: a.seed,
            power: getSeedPower(a.seed, seedRatings),
            bracket: a.bracket_status === 'championship' ? 'championship'
              : a.bracket_status === 'consolation' ? 'consolation' : 'done',
            champ_loss_round: a.bracket_status === 'consolation' ? a.championship_wins : null,
            champ_wins: a.championship_wins,
            consol_wins: a.consolation_wins,
            final_placement: a.placement,
          }))
          const simResult = simulateWeightClass(simAthletes, rng)
          for (const [id, res] of simResult) {
            fallbackSums.set(id, (fallbackSums.get(id) ?? 0) + res.extra_points)
          }
        }
      }
      for (const a of noModelAthletes) {
        const avg = iterations > 0 ? (fallbackSums.get(a.athlete_id) ?? 0) / iterations : 0
        athleteExpectedRemaining.set(a.athlete_id, avg)
      }
    }
  } else {
    // ── MODE B: full bracket simulation (original behaviour) ──────────────────
    const byWeight = new Map<number, AthleteStateForProjection[]>()
    for (const a of athletes) {
      const wc = weightClasses[a.athlete_id] ?? 0
      if (!byWeight.has(wc)) byWeight.set(wc, [])
      byWeight.get(wc)!.push(a)
    }
    const extraPointsSumB = new Map<string, number>()
    for (const a of athletes) extraPointsSumB.set(a.athlete_id, 0)

    for (let iter = 0; iter < iterations; iter++) {
      const rng = makePrng(iter * 7919 + 12345)
      for (const [, wcAthletes] of byWeight) {
        const simAthletes: SimAthlete[] = wcAthletes.map(a => ({
          athlete_id: a.athlete_id,
          seed: a.seed,
          power: getSeedPower(a.seed, seedRatings),
          bracket: a.bracket_status === 'championship' ? 'championship'
            : a.bracket_status === 'consolation' ? 'consolation' : 'done',
          champ_loss_round: a.bracket_status === 'consolation' ? a.championship_wins : null,
          champ_wins: a.championship_wins,
          consol_wins: a.consolation_wins,
          final_placement: a.placement,
        }))
        const simResult = simulateWeightClass(simAthletes, rng)
        for (const [id, res] of simResult) {
          extraPointsSumB.set(id, (extraPointsSumB.get(id) ?? 0) + res.extra_points)
        }
      }
    }
    for (const a of athletes) {
      const avg = iterations > 0 ? (extraPointsSumB.get(a.athlete_id) ?? 0) / iterations : 0
      athleteExpectedRemaining.set(a.athlete_id, avg)
    }
  }

  // ── Build athleteProjections map ─────────────────────────────────────────────
  const athleteProjections = new Map<string, AthleteProjection>()
  for (const a of athletes) {
    const epr = athleteExpectedRemaining.get(a.athlete_id) ?? 0
    athleteProjections.set(a.athlete_id, {
      athlete_id: a.athlete_id,
      expected_points_remaining: parseFloat(epr.toFixed(2)),
      projected_total: parseFloat((a.current_points + epr).toFixed(2)),
      bracket_status: a.bracket_status,
      championship_round: a.championship_wins,
      consolation_round: a.consolation_wins,
    })
  }

  // ── Team win probability via Monte Carlo ─────────────────────────────────────
  const teamWinCounts = new Map<string, number>()
  const teamTotalSum  = new Map<string, number>()
  for (const t of teamRosters) {
    teamWinCounts.set(t.team_id, 0)
    teamTotalSum.set(t.team_id, 0)
  }

  for (let iter = 0; iter < iterations; iter++) {
    const rng = makePrng(iter * 3571 + 54321)

    // For each athlete, draw a "total points in this simulation"
    const iterTotal = new Map<string, number>()

    for (const a of athletes) {
      const base = a.current_points

      if (modelData && modelData.has(a.athlete_id)) {
        // ── MODE A: draw placement from conditional mc_p distribution ──────────
        const md = modelData.get(a.athlete_id)!
        const achievable = getAchievablePlacements(a.bracket_status, a.championship_wins)

        if (achievable.length === 0 || a.bracket_status === 'placed' || a.bracket_status === 'eliminated') {
          iterTotal.set(a.athlete_id, base)
          continue
        }

        const pArr = mcPArray(md)
        const achievableMass = achievable.reduce((s, p) => s + (pArr[p] ?? 0), 0)

        let drawnPlacement: number | null = null
        if (achievableMass > 0.001) {
          const roll = rng() * achievableMass
          let cumulative = 0
          for (const p of achievable) {
            cumulative += pArr[p] ?? 0
            if (roll <= cumulative) { drawnPlacement = p; break }
          }
          if (!drawnPlacement) drawnPlacement = achievable[achievable.length - 1]
        }
        // else: DNP in this simulation

        // Advancement wins estimate based on drawn placement
        const placePts = drawnPlacement ? (PLACEMENT_POINTS[drawnPlacement] ?? 0) : 0
        // Estimate wins needed to reach that placement from current position
        const winsToPlace = drawnPlacement
          ? Math.max(0, (drawnPlacement <= 2 ? 4 : drawnPlacement <= 4 ? 3 : 2) - a.championship_wins - a.consolation_wins)
          : 0
        const effectiveBonus = md.bonus_rate ?? AVG_BONUS_PER_WIN
        const advPts = winsToPlace * (1 + effectiveBonus)
        iterTotal.set(a.athlete_id, base + Math.max(0, placePts + advPts - base))
      } else {
        // ── MODE B fallback: use analytical average ───────────────────────────
        const epr = athleteExpectedRemaining.get(a.athlete_id) ?? 0
        // Add small noise ±20% for spread in team win probability
        const noise = (rng() - 0.5) * 0.4 * epr
        iterTotal.set(a.athlete_id, base + Math.max(0, epr + noise))
      }
    }

    // Find winning team in this iteration
    let maxTotal = -Infinity
    let winnerId: string | null = null
    for (const t of teamRosters) {
      const total = t.athlete_ids.reduce((s, aid) => s + (iterTotal.get(aid) ?? (athleteById.get(aid)?.current_points ?? 0)), 0)
      teamTotalSum.set(t.team_id, (teamTotalSum.get(t.team_id) ?? 0) + total)
      if (total > maxTotal) { maxTotal = total; winnerId = t.team_id }
    }
    if (winnerId) teamWinCounts.set(winnerId, (teamWinCounts.get(winnerId) ?? 0) + 1)
  }

  // ── Build teamProjections map ────────────────────────────────────────────────
  const teamProjections = new Map<string, TeamProjectionResult>()
  for (const t of teamRosters) {
    const totalSum = teamTotalSum.get(t.team_id) ?? 0
    const winCount = teamWinCounts.get(t.team_id) ?? 0
    teamProjections.set(t.team_id, {
      team_id: t.team_id,
      projected_total: parseFloat((iterations > 0 ? totalSum / iterations : 0).toFixed(2)),
      win_probability: parseFloat((iterations > 0 ? winCount / iterations : 0).toFixed(4)),
    })
  }

  return { athleteProjections, teamProjections }
}

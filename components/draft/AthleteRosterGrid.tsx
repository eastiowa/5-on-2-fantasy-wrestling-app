'use client'

import { Athlete, DraftPick, WEIGHT_CLASSES } from '@/types'
import { cn } from '@/lib/utils'

interface AthleteRosterGridProps {
  athletes: Athlete[]
  picks: Array<DraftPick & { athlete: Athlete }>
  userTeamId: string | null
  isMyTurn: boolean
  picking: boolean
  onPick: (athleteId: string) => void
}

/**
 * Cross-reference grid of all athletes.
 * Columns = weight classes  |  Rows = seed numbers
 *
 * • Drafted athletes are greyed out with a strikethrough
 * • Athletes your team already has at that weight class are dimmed
 * • Clicking an undrafted cell picks the athlete (when it's your turn)
 */
export function AthleteRosterGrid({
  athletes,
  picks,
  userTeamId,
  isMyTurn,
  picking,
  onPick,
}: AthleteRosterGridProps) {
  // Build lookup: athleteMap[weight][seed] = Athlete
  const athleteMap = new Map<number, Map<number, Athlete>>()
  for (const a of athletes) {
    if (!athleteMap.has(a.weight)) athleteMap.set(a.weight, new Map())
    athleteMap.get(a.weight)!.set(a.seed, a)
  }

  // Determine which seeds actually have athletes (avoid empty rows)
  const usedSeeds = Array.from(
    new Set(athletes.map((a) => a.seed))
  ).sort((a, b) => a - b)

  // Teams that have already drafted at each weight
  const draftedWeights = new Set(
    picks.filter((p) => p.team_id === userTeamId).map((p) => p.athlete?.weight)
  )

  if (athletes.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 text-sm">
        No athletes uploaded yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full min-w-[700px]">
        <thead>
          <tr>
            {/* Seed column header */}
            <th className="sticky left-0 bg-gray-950 z-10 px-3 py-2 text-left text-gray-400 font-semibold w-12">
              Seed
            </th>
            {WEIGHT_CLASSES.map((w) => (
              <th
                key={w}
                className={cn(
                  'px-2 py-2 text-center font-semibold whitespace-nowrap',
                  draftedWeights.has(w)
                    ? 'text-gray-600'   // already have someone at this weight
                    : 'text-yellow-400'
                )}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usedSeeds.map((seed) => (
            <tr key={seed} className="border-t border-gray-800/60">
              {/* Seed label */}
              <td className="sticky left-0 bg-gray-950 z-10 px-3 py-1.5 text-gray-500 font-bold">
                #{seed}
              </td>

              {WEIGHT_CLASSES.map((w) => {
                const athlete = athleteMap.get(w)?.get(seed)
                if (!athlete) {
                  return (
                    <td key={w} className="px-2 py-1.5 text-center text-gray-800">
                      —
                    </td>
                  )
                }

                const isDrafted = athlete.is_drafted
                const myWeightTaken = draftedWeights.has(w)
                const canPick = isMyTurn && !isDrafted && !myWeightTaken && !picking

                const draftedBy = isDrafted
                  ? picks.find((p) => p.athlete_id === athlete.id)
                  : undefined
                const isMyDraftedAthlete = draftedBy?.team_id === userTeamId

                return (
                  <td key={w} className="px-1 py-1">
                    <button
                      onClick={() => canPick && onPick(athlete.id)}
                      disabled={!canPick}
                      title={
                        isDrafted
                          ? `Drafted by ${draftedBy?.team?.name ?? 'a team'}`
                          : `${athlete.name} — ${athlete.school}`
                      }
                      className={cn(
                        'w-full text-center rounded px-1 py-1 leading-tight transition-colors',
                        isDrafted
                          ? isMyDraftedAthlete
                            ? 'line-through text-yellow-600/50 bg-yellow-400/5 cursor-default'
                            : 'line-through text-gray-700 cursor-default'
                          : myWeightTaken
                          ? 'text-gray-600 cursor-default'
                          : canPick
                          ? 'text-white bg-green-950/60 hover:bg-green-900/80 cursor-pointer ring-1 ring-green-700'
                          : 'text-gray-300 hover:bg-gray-800 cursor-default'
                      )}
                    >
                      {/* Last name only for compactness */}
                      <span className="block truncate max-w-[72px]">
                        {athlete.name.split(' ').pop()}
                      </span>
                      <span className="block text-[9px] text-gray-500 truncate max-w-[72px]">
                        {athlete.school}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-gray-600">
        Columns = weight class · Rows = seed · Strikethrough = already drafted ·
        Green = pickable now
      </p>
    </div>
  )
}

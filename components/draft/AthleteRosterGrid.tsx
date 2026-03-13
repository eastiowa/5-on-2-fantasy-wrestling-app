'use client'

import { useState } from 'react'
import { Athlete, DraftPick, WEIGHT_CLASSES } from '@/types'
import { cn } from '@/lib/utils'
import { BookmarkPlus, Check, Loader2 } from 'lucide-react'
import { FlagValue, FLAG_META, FLAG_ORDER } from '@/lib/athlete-flags'

interface AthleteRosterGridProps {
  athletes: Athlete[]
  picks: Array<DraftPick & { athlete: Athlete }>
  userTeamId: string | null
  isMyTurn: boolean
  picking: boolean
  onPick: (athleteId: string) => void
  wishlistIds: Set<string>
  onAddToWishlist: (athleteId: string) => Promise<void>
  flags: Map<string, FlagValue>
  onToggleFlag: (athleteId: string, flag: FlagValue) => void
  onRemoveFromWishlist: (athleteId: string) => void
}

/**
 * Cross-reference grid of all athletes.
 * Columns = weight classes  |  Rows = seed numbers
 *
 * • Drafted athletes are greyed out with a strikethrough
 * • Athletes your team already has at that weight class are dimmed
 * • Clicking an undrafted cell picks the athlete (when it's your turn)
 * • Flag color (green/yellow/red) shown as a small dot on each cell
 */
export function AthleteRosterGrid({
  athletes,
  picks,
  userTeamId,
  isMyTurn,
  picking,
  onPick,
  wishlistIds,
  onAddToWishlist,
  flags,
  onToggleFlag,
  onRemoveFromWishlist,
}: AthleteRosterGridProps) {
  const [addingWishlist, setAddingWishlist] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null)

  async function handleWishlist(e: React.MouseEvent, athleteId: string) {
    e.stopPropagation()
    setAddingWishlist(athleteId)
    await onAddToWishlist(athleteId)
    setAddingWishlist(null)
  }

  // Build lookup: athleteMap[weight][seed] = Athlete
  const athleteMap = new Map<number, Map<number, Athlete>>()
  for (const a of athletes) {
    if (!athleteMap.has(a.weight)) athleteMap.set(a.weight, new Map())
    athleteMap.get(a.weight)!.set(a.seed, a)
  }

  const usedSeeds = Array.from(
    new Set(athletes.map((a) => a.seed))
  ).sort((a, b) => a - b)

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
            <th className="sticky left-0 bg-gray-950 z-10 px-3 py-2 text-left text-gray-400 font-semibold w-12">
              Seed
            </th>
            {WEIGHT_CLASSES.map((w) => (
              <th
                key={w}
                className={cn(
                  'px-2 py-2 text-center font-semibold whitespace-nowrap',
                  draftedWeights.has(w) ? 'text-gray-600' : 'text-yellow-400'
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
                    <td key={w} className="px-2 py-1.5 text-center text-gray-800">—</td>
                  )
                }

                const isDrafted = athlete.is_drafted
                const myWeightTaken = draftedWeights.has(w)
                const canPick = isMyTurn && !isDrafted && !myWeightTaken && !picking

                const draftedBy = isDrafted
                  ? picks.find((p) => p.athlete_id === athlete.id)
                  : undefined
                const isMyDraftedAthlete = draftedBy?.team_id === userTeamId

                const inWishlist = wishlistIds.has(athlete.id)
                const isAddingWishlist = addingWishlist === athlete.id

                const flag = flags.get(athlete.id)
                const flagMeta = flag ? FLAG_META[flag] : null
                const isHovered = hoverCell === athlete.id

                return (
                  <td key={w} className="px-1 py-1">
                    <div
                      className="relative group"
                      onMouseEnter={() => !isDrafted && setHoverCell(athlete.id)}
                      onMouseLeave={() => setHoverCell(null)}
                    >
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
                            : flagMeta && !canPick
                            ? cn('cursor-default border', flagMeta.rowBg, flagMeta.rowBorder, 'text-gray-200')
                            : canPick
                            ? 'text-white bg-green-950/60 hover:bg-green-900/80 cursor-pointer ring-1 ring-green-700'
                            : 'text-gray-300 hover:bg-gray-800 cursor-default'
                        )}
                      >
                        {/* Flag dot indicator */}
                        {flagMeta && !isDrafted && (
                          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mb-0.5 mr-0.5', flagMeta.dotColor)} />
                        )}
                        <span className="block truncate max-w-[72px]">
                          {athlete.name.split(' ').pop()}
                        </span>
                        <span className="block text-[9px] text-gray-500 truncate max-w-[72px]">
                          {athlete.school}
                        </span>
                      </button>

                      {/* Flag buttons — show on hover for undrafted athletes */}
                      {!isDrafted && isHovered && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex gap-0.5 z-20 bg-gray-950 border border-gray-700 rounded p-0.5 shadow-lg">
                          {FLAG_ORDER.map((key) => {
                            const m = FLAG_META[key]
                            return (
                              <button
                                key={key}
                                onClick={(e) => { e.stopPropagation(); onToggleFlag(athlete.id, key) }}
                                title={`${flag === key ? 'Remove' : 'Mark as'} ${m.label}`}
                                className={cn(
                                  'w-5 h-5 rounded text-[9px] font-bold transition-all border',
                                  flag === key ? m.activeBtn : m.inactiveBtn
                                )}
                              >
                                {m.abbr}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Wishlist toggle — add or remove */}
                      {!isDrafted && userTeamId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (inWishlist) {
                              onRemoveFromWishlist(athlete.id)
                            } else {
                              handleWishlist(e, athlete.id)
                            }
                          }}
                          disabled={isAddingWishlist}
                          title={inWishlist ? 'Remove from queue' : 'Add to queue'}
                          className={cn(
                            'absolute top-0 right-0 p-0.5 rounded transition-colors',
                            inWishlist
                              ? 'text-yellow-400 opacity-100 hover:text-red-400'
                              : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
                          )}
                        >
                          {isAddingWishlist
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : inWishlist
                            ? <Check className="w-3 h-3" />
                            : <BookmarkPlus className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-gray-600">
        Columns = weight class · Rows = seed · Strikethrough = drafted · Green = pickable · Hover a cell to flag
      </p>
    </div>
  )
}

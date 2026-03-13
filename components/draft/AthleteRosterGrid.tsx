'use client'

import { useState } from 'react'
import { Athlete, DraftPick, WEIGHT_CLASSES } from '@/types'
import { cn } from '@/lib/utils'
import { BookmarkPlus, Check, Loader2 } from 'lucide-react'
import { FlagValue, FLAG_META, FLAG_ORDER } from '@/lib/athlete-flags'

interface AthleteRosterGridProps {
  athletes: Athlete[]
  picks: Array<DraftPick & { athlete: Athlete; team?: { name: string } | null }>
  teams: Array<{ id: string; name: string }>
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
 * Greyed-out conditions (from MY team's perspective):
 *   • Already drafted by any team  → strikethrough + shows team name
 *   • My team already has that weight class → column header dimmed, cell muted
 *   • My team already has that seed → cell muted
 */
export function AthleteRosterGrid({
  athletes,
  picks,
  teams,
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

  // Team name lookup by id (handles missing team join on realtime picks)
  const teamById = new Map(teams.map((t) => [t.id, t.name]))

  const usedSeeds = Array.from(new Set(athletes.map((a) => a.seed))).sort((a, b) => a - b)

  const myPicks = picks.filter((p) => p.team_id === userTeamId)
  const draftedWeights = new Set(myPicks.map((p) => p.athlete?.weight))
  const draftedSeeds   = new Set(myPicks.map((p) => p.athlete?.seed))

  // Quick pick-by-athlete lookup
  const pickByAthleteId = new Map(picks.map((p) => [p.athlete_id, p]))

  if (athletes.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 text-sm">
        No athletes uploaded yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-gray-900 border border-gray-800">
      <table className="text-xs border-collapse w-full min-w-[700px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="sticky left-0 bg-gray-800 z-10 px-3 py-2 text-left text-gray-400 font-semibold w-12">
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
                {draftedWeights.has(w) && (
                  <span className="block text-[8px] font-normal text-gray-700 leading-none">taken</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usedSeeds.map((seed) => {
            const mySeedTaken = draftedSeeds.has(seed)
            return (
              <tr key={seed} className="border-t border-gray-800/60">
                {/* Seed label */}
                <td className={cn(
                  'sticky left-0 bg-gray-900 z-10 px-3 py-1.5 font-bold border-r border-gray-800',
                  mySeedTaken ? 'text-gray-700' : 'text-gray-500'
                )}>
                  #{seed}
                  {mySeedTaken && <span className="block text-[8px] font-normal text-gray-700 leading-none">taken</span>}
                </td>

                {WEIGHT_CLASSES.map((w) => {
                  const athlete = athleteMap.get(w)?.get(seed)
                  if (!athlete) {
                    return <td key={w} className="px-2 py-1.5 text-center text-gray-800">—</td>
                  }

                  const isDrafted      = athlete.is_drafted
                  const myWeightTaken  = draftedWeights.has(w)
                  const canPick        = isMyTurn && !isDrafted && !myWeightTaken && !mySeedTaken && !picking

                  const draftedByPick  = isDrafted ? pickByAthleteId.get(athlete.id) : undefined
                  const draftedByTeam  = draftedByPick
                    ? (teamById.get(draftedByPick.team_id) ?? draftedByPick.team?.name ?? 'a team')
                    : undefined
                  const isMyDraftedAthlete = draftedByPick?.team_id === userTeamId

                  // Short team label for the cell (first ~8 chars)
                  const teamLabel = draftedByTeam
                    ? draftedByTeam.length > 8 ? draftedByTeam.slice(0, 7) + '…' : draftedByTeam
                    : undefined

                  const inWishlist       = wishlistIds.has(athlete.id)
                  const isAddingWishlist = addingWishlist === athlete.id

                  const flag     = flags.get(athlete.id)
                  const flagMeta = flag ? FLAG_META[flag] : null

                  return (
                    <td
                      key={w}
                      className={cn(
                        'px-1 py-1 border border-gray-800/60 transition-colors',
                        isDrafted
                          ? 'bg-gray-900/30'
                          : !isDrafted && flagMeta
                          ? cn(flagMeta.rowBg, flagMeta.rowBorder)
                          : 'bg-gray-900'
                      )}
                    >
                      <div className="relative group">
                        <button
                          onClick={() => canPick && onPick(athlete.id)}
                          disabled={!canPick}
                          title={
                            isDrafted
                              ? `Drafted by ${draftedByTeam ?? 'a team'}`
                              : myWeightTaken
                              ? `${w} lbs already on your roster`
                              : mySeedTaken
                              ? `Seed #${seed} already on your roster`
                              : `${athlete.name} — ${athlete.school}`
                          }
                          className={cn(
                            'w-full text-center rounded px-1 py-1 leading-tight transition-colors',
                            isDrafted
                              ? isMyDraftedAthlete
                                ? 'line-through text-yellow-600/40 bg-yellow-400/5 cursor-default'
                                : 'line-through text-gray-700 bg-gray-800/30 cursor-default'
                              : myWeightTaken || mySeedTaken
                              ? 'text-gray-700 cursor-default bg-gray-900/50'
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

                          {isDrafted ? (
                            <>
                              <span className="block truncate max-w-[72px] text-[9px] leading-tight">
                                {athlete.name.split(' ').pop()}
                              </span>
                              {teamLabel && (
                                <span className={cn(
                                  'block truncate max-w-[72px] text-[8px] font-semibold leading-tight mt-0.5',
                                  isMyDraftedAthlete ? 'text-yellow-700' : 'text-gray-600'
                                )}>
                                  {isMyDraftedAthlete ? '★ Mine' : teamLabel}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="block truncate max-w-[72px]">
                                {athlete.name.split(' ').pop()}
                              </span>
                              <span className="block text-[9px] text-gray-500 truncate max-w-[72px]">
                                {athlete.school}
                              </span>
                            </>
                          )}
                        </button>

                        {/* Flag buttons — CSS group-hover */}
                        {!isDrafted && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-px z-30 hidden group-hover:flex gap-0.5 bg-gray-950 border border-gray-700 rounded p-0.5 shadow-xl">
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

                        {/* Wishlist toggle */}
                        {!isDrafted && userTeamId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (inWishlist) onRemoveFromWishlist(athlete.id)
                              else handleWishlist(e, athlete.id)
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
            )
          })}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-gray-600 px-2 pb-2">
        Columns = weight class · Rows = seed · Strikethrough = drafted (shows team) · Green = pickable · Greyed = ineligible for your roster · Hover to flag
      </p>
    </div>
  )
}

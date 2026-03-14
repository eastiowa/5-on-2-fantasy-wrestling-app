'use client'

import { useState } from 'react'
import { DraftPick, Athlete, DraftStatus, WEIGHT_CLASSES } from '@/types'
import { buildFullDraftOrder, getPickMeta } from '@/lib/draft-logic'
import { cn } from '@/lib/utils'

const ALL_SEEDS = Array.from({ length: 10 }, (_, i) => i + 1)

/** "Easton Kuboushek" → "E. Kuboushek" */
function fmtName(name: string | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

interface DraftBoardProps {
  teams: Array<{ id: string; name: string; draft_position: number | null }>
  picks: Array<DraftPick & { athlete: Athlete }>
  currentPickNumber: number
  status: DraftStatus
  userTeamId: string | null
}

export function DraftBoard({ teams, picks, currentPickNumber, status, userTeamId }: DraftBoardProps) {
  const [needsView, setNeedsView] = useState<'seeds' | 'weights'>('seeds')
  const [needsOpen, setNeedsOpen] = useState(true)

  const orderedTeams = [...teams].sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))

  if (orderedTeams.length < 10) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        Draft board will appear once all 10 teams are configured.
      </div>
    )
  }

  const fullOrder = buildFullDraftOrder(orderedTeams as any)
  const pickMap = new Map(picks.map((p) => [p.pick_number, p]))

  // Compute per-team needs
  const teamNeeds = orderedTeams.map((team) => {
    const teamPicks = picks.filter((p) => p.team_id === team.id)
    const draftedSeeds = new Set(teamPicks.map((p) => p.athlete?.seed).filter((s): s is number => s != null))
    const draftedWeights = new Set(teamPicks.map((p) => p.athlete?.weight).filter((w) => w != null))
    return {
      team,
      neededSeeds: ALL_SEEDS.filter((s) => !draftedSeeds.has(s)),
      neededWeights: WEIGHT_CLASSES.filter((w) => !draftedWeights.has(w)),
      pickCount: teamPicks.length,
    }
  })

  // Group by round
  const ROUNDS = 10
  const TEAM_COUNT = 10

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {picks.length}/100 picks made ·
        {status === 'active' ? ` Pick #${currentPickNumber} active` :
         status === 'complete' ? ' Draft complete' :
         status === 'paused' ? ' Draft paused' : ' Draft not started'}
      </p>

      {/* Scrollable board grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-gray-400 font-medium w-16 sticky left-0 bg-gray-950 z-10">Rd</th>
              {orderedTeams.map((team, i) => (
                <th
                  key={team.id}
                  className={cn(
                    'px-2 py-2 text-center font-medium truncate max-w-[90px]',
                    team.id === userTeamId ? 'text-yellow-400' : 'text-gray-400'
                  )}
                  title={team.name}
                >
                  {team.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROUNDS }, (_, roundIdx) => {
              const round = roundIdx + 1
              const { isOddRound } = getPickMeta(round * TEAM_COUNT)
              // For this round, the order goes forward or backward
              const roundTeams = isOddRound ? orderedTeams : [...orderedTeams].reverse()

              return (
                <tr key={round} className="border-t border-gray-800">
                  <td className={cn(
                    'px-2 py-1.5 font-bold sticky left-0 bg-gray-950 z-10',
                    round % 2 === 0 ? 'text-blue-400' : 'text-gray-400'
                  )}>
                    R{round}
                    <span className="text-gray-600 font-normal ml-1">{isOddRound ? '→' : '←'}</span>
                  </td>
                  {orderedTeams.map((team) => {
                    // Find the pick number for this team in this round
                    const pickEntry = fullOrder.find(
                      (o) => o.round === round && o.teamId === team.id
                    )
                    const pickNum = pickEntry?.pickNumber
                    const pick = pickNum ? pickMap.get(pickNum) : undefined
                    const isCurrent = pickNum === currentPickNumber && status === 'active'

                    return (
                      <td
                        key={team.id}
                        className={cn(
                          'px-2 py-1.5 text-center align-top',
                          team.id === userTeamId ? 'bg-yellow-400/5' : '',
                          isCurrent ? 'ring-2 ring-yellow-400 ring-inset rounded' : ''
                        )}
                      >
                        {pick ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-white leading-tight truncate max-w-[90px]">
                              {fmtName(pick.athlete?.name)}
                            </div>
                            <div className="text-gray-500 text-[10px]">
                              {pick.athlete?.weight} · #{pick.athlete?.seed}
                            </div>
                          </div>
                        ) : isCurrent ? (
                          <div className="text-yellow-400 font-bold animate-pulse">●</div>
                        ) : pickNum && pickNum < currentPickNumber ? (
                          <div className="text-gray-700">—</div>
                        ) : (
                          <div className="text-gray-800 text-[10px]">#{pickNum}</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-yellow-400/5 border border-yellow-400/20 rounded inline-block" />
          Your team column
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-blue-400">R2←</span>
          Snake reversal round
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-yellow-400 font-bold">●</span>
          Current pick
        </span>
      </div>

      {/* Team Needs */}
      <div className="border border-gray-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setNeedsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors flex-1 text-left"
          >
            <span className="text-gray-500">{needsOpen ? '▾' : '▸'}</span>
            Team Needs
          </button>
          {needsOpen && (
            <div className="flex rounded-md overflow-hidden border border-gray-700 shrink-0">
              <button
                onClick={() => setNeedsView('seeds')}
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
                  needsView === 'seeds' ? 'bg-yellow-400 text-gray-900' : 'text-gray-400 hover:text-white'
                )}
              >
                Seeds
              </button>
              <button
                onClick={() => setNeedsView('weights')}
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
                  needsView === 'weights' ? 'bg-yellow-400 text-gray-900' : 'text-gray-400 hover:text-white'
                )}
              >
                Weights
              </button>
            </div>
          )}
        </div>

        {needsOpen && (
          <div className="overflow-x-auto">
            {needsView === 'weights' ? (
              <table className="w-full text-xs border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium w-28 sticky left-0 bg-gray-950 z-10">Team</th>
                    {WEIGHT_CLASSES.map((w) => (
                      <th key={w} className="px-1 py-1.5 text-center text-gray-400 font-medium w-10">{w}</th>
                    ))}
                    <th className="px-2 py-1.5 text-right text-gray-500 font-medium w-12">Picks</th>
                  </tr>
                </thead>
                <tbody>
                  {teamNeeds.map(({ team, neededWeights, pickCount }) => {
                    const isMyTeam = team.id === userTeamId
                    const neededSet = new Set(neededWeights)
                    return (
                      <tr key={team.id} className={cn('border-t border-gray-800/60', isMyTeam ? 'bg-yellow-400/5' : '')}>
                        <td className={cn(
                          'px-2 py-1 font-medium truncate max-w-[112px] sticky left-0 z-10 text-[11px]',
                          isMyTeam ? 'text-yellow-300 bg-yellow-400/5' : 'text-gray-300 bg-gray-950'
                        )}>
                          {team.name}
                        </td>
                        {WEIGHT_CLASSES.map((w) => {
                          const needed = neededSet.has(w)
                          return (
                            <td key={w} className="px-1 py-1 text-center">
                              {needed ? (
                                <span className={cn(
                                  'inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-bold',
                                  isMyTeam
                                    ? 'bg-yellow-400/25 text-yellow-300 border border-yellow-700'
                                    : 'bg-red-950/50 text-red-400 border border-red-900'
                                )}>
                                  ✕
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-bold bg-green-950/40 text-green-500 border border-green-900">
                                  ✓
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1 text-right text-gray-500 text-[10px]">{pickCount}/10</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium w-28 sticky left-0 bg-gray-950 z-10">Team</th>
                    {ALL_SEEDS.map((s) => (
                      <th key={s} className="px-1 py-1.5 text-center text-gray-400 font-medium w-9">#{s}</th>
                    ))}
                    <th className="px-2 py-1.5 text-right text-gray-500 font-medium w-12">Picks</th>
                  </tr>
                </thead>
                <tbody>
                  {teamNeeds.map(({ team, neededSeeds, pickCount }) => {
                    const isMyTeam = team.id === userTeamId
                    const neededSet = new Set(neededSeeds)
                    return (
                      <tr key={team.id} className={cn('border-t border-gray-800/60', isMyTeam ? 'bg-yellow-400/5' : '')}>
                        <td className={cn(
                          'px-2 py-1 font-medium truncate max-w-[112px] sticky left-0 z-10 text-[11px]',
                          isMyTeam ? 'text-yellow-300 bg-yellow-400/5' : 'text-gray-300 bg-gray-950'
                        )}>
                          {team.name}
                        </td>
                        {ALL_SEEDS.map((s) => {
                          const needed = neededSet.has(s)
                          return (
                            <td key={s} className="px-1 py-1 text-center">
                              {needed ? (
                                <span className={cn(
                                  'inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold',
                                  isMyTeam
                                    ? 'bg-yellow-400/25 text-yellow-300 border border-yellow-700'
                                    : 'bg-red-950/50 text-red-400 border border-red-900'
                                )}>
                                  ✕
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold bg-green-950/40 text-green-500 border border-green-900">
                                  ✓
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1 text-right text-gray-500 text-[10px]">{pickCount}/10</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

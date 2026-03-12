'use client'

import { DraftPick, Athlete, DraftStatus } from '@/types'
import { buildFullDraftOrder, getPickMeta } from '@/lib/draft-logic'
import { cn } from '@/lib/utils'

interface DraftBoardProps {
  teams: Array<{ id: string; name: string; draft_position: number | null }>
  picks: Array<DraftPick & { athlete: Athlete }>
  currentPickNumber: number
  status: DraftStatus
  userTeamId: string | null
}

export function DraftBoard({ teams, picks, currentPickNumber, status, userTeamId }: DraftBoardProps) {
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
                  {team.name.split(' ').slice(-1)[0]}
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
                              {(() => {
                                const parts = (pick.athlete?.name ?? '').trim().split(' ')
                                if (parts.length < 2) return parts[0]
                                return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
                              })()}
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
    </div>
  )
}

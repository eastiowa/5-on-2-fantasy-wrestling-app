import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatPoints } from '@/lib/utils'
import { WEIGHT_CLASSES } from '@/types'
import { Trophy, User, Weight } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TeamPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch team
  const { data: team } = await supabase
    .from('teams')
    .select('*, manager:profiles!manager_id(display_name, email)')
    .eq('id', id)
    .single()

  if (!team) notFound()

  // Fetch this team's draft picks with athlete info + scores
  const { data: picks } = await supabase
    .from('draft_picks')
    .select(`
      pick_number, round,
      athlete:athletes(
        id, name, weight, school, seed,
        scores(championship_wins, consolation_wins, bonus_points, placement, placement_points, total_points, event)
      )
    `)
    .eq('team_id', id)
    .order('pick_number')

  const athletes = (picks ?? []).map((p: any) => ({
    ...p.athlete,
    pick_number: p.pick_number,
    round: p.round,
    total_points: (p.athlete?.scores ?? []).reduce(
      (sum: number, s: any) => sum + (s.total_points ?? 0), 0
    ),
  }))

  const teamTotal = athletes.reduce((sum, a) => sum + (a.total_points ?? 0), 0)

  // Build weight class grid
  const weightMap = Object.fromEntries(athletes.map((a) => [a.weight, a]))

  const managerName = (team.manager as any)?.display_name || (team.manager as any)?.email || 'TBD'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{team.name}</h1>
            <div className="flex items-center gap-2 mt-2 text-gray-400">
              <User className="w-4 h-4" />
              <span className="text-sm">Manager: {managerName}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-bold text-yellow-400">{formatPoints(teamTotal)}</div>
            <div className="text-xs text-gray-500 mt-1">total points</div>
          </div>
        </div>
      </div>

      {/* Roster by weight class */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-orange-600/30 flex items-center gap-2">
          <Weight className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Roster</h2>
          <span className="text-sm text-gray-500 ml-1">({athletes.length}/10 athletes)</span>
        </div>

        <div className="divide-y divide-gray-800">
          {WEIGHT_CLASSES.map((weight) => {
            const athlete = weightMap[weight]
            return (
              <div key={weight} className="flex items-center gap-4 px-6 py-4">
                {/* Weight badge */}
                <div className="w-16 text-center">
                  <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-1 rounded-full">
                    {weight}
                  </span>
                </div>

                {athlete ? (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{athlete.name}</div>
                      <div className="text-sm text-gray-500">
                        {athlete.school} · Seed #{athlete.seed}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-yellow-400">{formatPoints(athlete.total_points)}</div>
                      <div className="text-xs text-gray-600">pts</div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 text-gray-600 italic text-sm">— Empty —</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-center">
        <Link href="/" className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors">
          ← Back to Standings
        </Link>
      </div>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatPoints } from '@/lib/utils'
import { WEIGHT_CLASSES } from '@/types'
import { Trophy, TrendingUp, Users, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, team:teams(*, manager:profiles(display_name))')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'commissioner') redirect('/commissioner')
  if (!profile.team_id) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg">You are not assigned to a team yet.</p>
        <p className="text-sm mt-2">Contact your Commissioner.</p>
      </div>
    )
  }

  const team = profile.team as any

  // Fetch this team's picks
  const { data: picks } = await supabase
    .from('draft_picks')
    .select(`
      pick_number, round,
      athlete:athletes(
        id, name, weight, school, seed,
        scores(championship_wins, consolation_wins, bonus_points, placement, placement_points, total_points, event)
      )
    `)
    .eq('team_id', profile.team_id)
    .order('pick_number')

  const athletes = (picks ?? []).map((p: any) => ({
    ...p.athlete,
    pick_number: p.pick_number,
    total_points: (p.athlete?.scores ?? []).reduce(
      (sum: number, s: any) => sum + (s.total_points ?? 0), 0
    ),
  }))

  const teamTotal = athletes.reduce((sum, a) => sum + (a.total_points ?? 0), 0)

  // Get overall standings rank
  const { data: allPicks } = await supabase
    .from('draft_picks')
    .select('team_id, athlete:athletes(scores(total_points))')

  const teamTotals: Record<string, number> = {}
  ;(allPicks ?? []).forEach((p: any) => {
    const pts = (p.athlete?.scores ?? []).reduce((s: number, sc: any) => s + (sc.total_points ?? 0), 0)
    teamTotals[p.team_id] = (teamTotals[p.team_id] ?? 0) + pts
  })

  const allTotals = Object.values(teamTotals).sort((a, b) => b - a)
  const myRank = allTotals.findIndex((t) => t === teamTotals[profile.team_id]) + 1

  // Draft settings
  const { data: draftSettings } = await supabase
    .from('draft_settings')
    .select('status, current_pick_number')
    .single()

  const weightMap = Object.fromEntries(athletes.map((a) => [a.weight, a]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{team.name}</h1>
          <p className="text-gray-400 mt-1">Welcome back, {profile.display_name ?? user.email}</p>
        </div>
        {draftSettings?.status === 'active' && (
          <Link
            href="/draft"
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-300 transition-colors animate-pulse"
          >
            <Clock className="w-4 h-4" />
            Draft Live!
          </Link>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">{formatPoints(teamTotal)}</div>
              <div className="text-sm text-gray-400">Total Points</div>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">
                #{myRank || '—'}
              </div>
              <div className="text-sm text-gray-400">League Rank</div>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">{athletes.length}/10</div>
              <div className="text-sm text-gray-400">Athletes Drafted</div>
            </div>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Roster</h2>
          {draftSettings?.status === 'pending' || draftSettings?.status === 'active' ? (
            <Link href="/draft" className="text-sm text-yellow-400 hover:text-yellow-300">
              Go to Draft Room →
            </Link>
          ) : null}
        </div>

        <div className="divide-y divide-gray-800">
          {WEIGHT_CLASSES.map((weight) => {
            const athlete = weightMap[weight]
            return (
              <div key={weight} className="flex items-center gap-4 px-6 py-4">
                <div className="w-16 text-center shrink-0">
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
                  <div className="flex-1 text-gray-600 italic text-sm">
                    {draftSettings?.status === 'pending'
                      ? 'Draft not started'
                      : draftSettings?.status === 'active'
                      ? 'Not yet drafted'
                      : '— Empty —'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

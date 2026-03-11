import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatPoints } from '@/lib/utils'
import { WEIGHT_CLASSES } from '@/types'
import { Trophy, TrendingUp, Users, Clock, Star, Zap, Award } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get profile (without circular team→manager join)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, team_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  if (profile.role === 'commissioner' && !profile.team_id) redirect('/commissioner')

  if (!profile.team_id) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg">You are not assigned to a team yet.</p>
        <p className="text-sm mt-2">Contact your Commissioner.</p>
      </div>
    )
  }

  // Fetch team separately to avoid circular FK ambiguity
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, draft_position')
    .eq('id', profile.team_id)
    .single()

  if (!team) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg">Team not found. Contact your Commissioner.</p>
      </div>
    )
  }

  // Fetch this team's draft picks with full athlete + score details
  const { data: picks } = await supabase
    .from('draft_picks')
    .select(`
      id, pick_number, round,
      athlete:athletes(
        id, name, weight, school, seed,
        scores(
          id, event,
          championship_wins, consolation_wins,
          bonus_points, placement, placement_points, total_points
        )
      )
    `)
    .eq('team_id', profile.team_id)
    .order('pick_number')

  // Build enriched athlete list with aggregated totals
  const athletes = (picks ?? []).map((p: any) => {
    const scores: any[] = p.athlete?.scores ?? []
    const totalPoints = scores.reduce((sum: number, s: any) => sum + Number(s.total_points ?? 0), 0)
    const champWins = scores.reduce((sum: number, s: any) => sum + (s.championship_wins ?? 0), 0)
    const consolWins = scores.reduce((sum: number, s: any) => sum + (s.consolation_wins ?? 0), 0)
    const bonusPts = scores.reduce((sum: number, s: any) => sum + Number(s.bonus_points ?? 0), 0)
    const placementPts = scores.reduce((sum: number, s: any) => sum + Number(s.placement_points ?? 0), 0)
    const placement = scores.length > 0 ? scores[scores.length - 1].placement : null
    return {
      ...p.athlete,
      pick_number: p.pick_number,
      round: p.round,
      total_points: totalPoints,
      champ_wins: champWins,
      consol_wins: consolWins,
      bonus_points: bonusPts,
      placement_points: placementPts,
      placement,
      scores,
    }
  })

  const teamTotal = athletes.reduce((sum, a) => sum + (a.total_points ?? 0), 0)

  // Standings rank
  const { data: allPicks } = await supabase
    .from('draft_picks')
    .select('team_id, athlete:athletes(scores(total_points))')

  const teamTotals: Record<string, number> = {}
  ;(allPicks ?? []).forEach((p: any) => {
    const pts = (p.athlete?.scores ?? []).reduce(
      (s: number, sc: any) => s + Number(sc.total_points ?? 0), 0
    )
    teamTotals[p.team_id] = (teamTotals[p.team_id] ?? 0) + pts
  })

  const allTotals = Object.values(teamTotals).sort((a, b) => b - a)
  const myRank = allTotals.findIndex((t) => t === teamTotals[profile.team_id]) + 1

  // Draft settings
  const { data: draftSettings } = await supabase
    .from('draft_settings')
    .select('status, current_pick_number')
    .single()

  const weightMap = Object.fromEntries(athletes.map((a: any) => [a.weight, a]))

  const placementLabel = (n: number | null) => {
    if (!n) return null
    const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
    return `${n}${suffixes[n] ?? 'th'}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{team.name}</h1>
          <p className="text-gray-400 mt-1">
            Welcome back, {profile.display_name ?? user.email}
          </p>
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
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">{formatPoints(teamTotal)}</div>
              <div className="text-sm text-gray-400">Total Points</div>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">#{myRank || '—'}</div>
              <div className="text-sm text-gray-400">League Rank</div>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">{athletes.length}/10</div>
              <div className="text-sm text-gray-400">Athletes Drafted</div>
            </div>
          </div>
        </div>
      </div>

      {/* Roster with score breakdown */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-orange-600/30 flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Roster</h2>
          {(draftSettings?.status === 'pending' || draftSettings?.status === 'active') && (
            <Link href="/draft" className="text-sm text-yellow-400 hover:text-yellow-300">
              Go to Draft Room →
            </Link>
          )}
        </div>

        {/* Score legend */}
        {athletes.length > 0 && (
          <div className="px-6 py-2 bg-gray-800/50 flex flex-wrap gap-4 text-xs text-gray-500 border-b border-gray-800">
            <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" /> Champ Wins (1pt ea)</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-orange-400" /> Consol Wins (0.5pt ea)</span>
            <span className="flex items-center gap-1"><Award className="w-3 h-3 text-blue-400" /> Bonus Pts</span>
            <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-green-400" /> Placement Pts</span>
          </div>
        )}

        <div className="divide-y divide-gray-800">
          {WEIGHT_CLASSES.map((weight) => {
            const athlete = weightMap[weight] as any
            return (
              <div key={weight} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  {/* Weight badge */}
                  <div className="w-16 text-center shrink-0 pt-0.5">
                    <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-1 rounded-full">
                      {weight}
                    </span>
                  </div>

                  {athlete ? (
                    <div className="flex-1 min-w-0">
                      {/* Athlete header row */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-white">{athlete.name}</div>
                          <div className="text-sm text-gray-500">
                            {athlete.school} · Seed #{athlete.seed}
                            <span className="ml-2 text-gray-600">· Pick #{athlete.pick_number} (Rd {athlete.round})</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-yellow-400 text-lg">
                            {formatPoints(athlete.total_points)}
                          </div>
                          <div className="text-xs text-gray-600">pts total</div>
                        </div>
                      </div>

                      {/* Score breakdown */}
                      {athlete.total_points > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {athlete.champ_wins > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-yellow-400/10 text-yellow-300 px-2 py-0.5 rounded-full">
                              <Star className="w-3 h-3" />
                              {athlete.champ_wins} champ {athlete.champ_wins === 1 ? 'win' : 'wins'}
                            </span>
                          )}
                          {athlete.consol_wins > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-orange-400/10 text-orange-300 px-2 py-0.5 rounded-full">
                              <Zap className="w-3 h-3" />
                              {athlete.consol_wins} consol {athlete.consol_wins === 1 ? 'win' : 'wins'}
                            </span>
                          )}
                          {athlete.bonus_points > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-blue-400/10 text-blue-300 px-2 py-0.5 rounded-full">
                              <Award className="w-3 h-3" />
                              +{formatPoints(athlete.bonus_points)} bonus
                            </span>
                          )}
                          {athlete.placement_points > 0 && (
                            <span className="flex items-center gap-1 text-xs bg-green-400/10 text-green-300 px-2 py-0.5 rounded-full">
                              <Trophy className="w-3 h-3" />
                              {placementLabel(athlete.placement) && `${placementLabel(athlete.placement)} place · `}
                              +{formatPoints(athlete.placement_points)} placement
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-600 italic">No scores recorded yet</div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 text-gray-600 italic text-sm pt-0.5">
                      {draftSettings?.status === 'pending'
                        ? 'Draft not started'
                        : draftSettings?.status === 'active'
                        ? 'Not yet drafted'
                        : '— Empty —'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

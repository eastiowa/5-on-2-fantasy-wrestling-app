import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatPoints } from '@/lib/utils'
import { WEIGHT_CLASSES } from '@/types'
import {
  Trophy, TrendingUp, Users, Clock, Star, Zap, Award,
  CalendarDays, User, Mail, Crown, History, Medal, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import { TeamNameEditor } from '@/components/shared/TeamNameEditor'
import { DisplayNameEditor } from '@/components/shared/DisplayNameEditor'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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

  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
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

  // ── Current season ──────────────────────────────────────────────────────────
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id, label, status, year')
    .eq('is_current', true)
    .maybeSingle()

  // This team's record in the current season (draft position)
  const { data: currentTeamSeason } = currentSeason
    ? await supabase
        .from('team_seasons')
        .select('draft_position, final_placement, total_points')
        .eq('team_id', profile.team_id)
        .eq('season_id', currentSeason.id)
        .maybeSingle()
    : { data: null }

  // ── Historical seasons (completed) ─────────────────────────────────────────
  const { data: pastSeasons } = await supabase
    .from('team_seasons')
    .select('final_placement, total_points, season:seasons(id, label, year, status)')
    .eq('team_id', profile.team_id)
    .not('final_placement', 'is', null)
    .order('season(year)', { ascending: false })

  // ── Draft picks — ALL teams in one query ───────────────────────────────────
  const allPicksQuery = supabase
    .from('draft_picks')
    .select(`
      id, pick_number, round, team_id,
      athlete:athletes(
        id, name, weight, school, seed,
        scores(
          id, event,
          championship_wins, consolation_wins,
          bonus_points, placement, placement_points, total_points
        )
      )
    `)
    .order('pick_number')

  if (currentSeason) allPicksQuery.eq('season_id', currentSeason.id)

  const { data: allPicksRaw } = await allPicksQuery

  // Group picks by team_id
  const picksByTeam: Record<string, any[]> = {}
  ;(allPicksRaw ?? []).forEach((p: any) => {
    if (!picksByTeam[p.team_id]) picksByTeam[p.team_id] = []
    picksByTeam[p.team_id].push(p)
  })

  function buildAthletes(picks: any[]) {
    return (picks ?? []).map((p: any) => {
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
  }

  const myAthletes = buildAthletes(picksByTeam[profile.team_id] ?? [])
  const teamTotal = myAthletes.reduce((sum, a) => sum + (a.total_points ?? 0), 0)

  // ── All teams (for standings + other teams section) ─────────────────────────
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, manager:profiles!manager_id(display_name, email)')
    .order('name')

  // Compute total points per team
  const teamTotals: Record<string, number> = {}
  ;(allTeams ?? []).forEach((t: any) => {
    const picks = picksByTeam[t.id] ?? []
    teamTotals[t.id] = picks.reduce((sum: number, p: any) => {
      return sum + (p.athlete?.scores ?? []).reduce(
        (s: number, sc: any) => s + Number(sc.total_points ?? 0), 0
      )
    }, 0)
  })

  const allTotals = Object.values(teamTotals).sort((a, b) => b - a)
  const myRank = allTotals.findIndex((t) => t === teamTotals[profile.team_id]) + 1

  // Draft settings
  const { data: draftSettings } = await supabase
    .from('draft_settings')
    .select('status, current_pick_number')
    .maybeSingle()

  const weightMap = Object.fromEntries(myAthletes.map((a: any) => [a.weight, a]))

  const otherTeams = (allTeams ?? []).filter((t: any) => t.id !== profile.team_id)

  const placementLabel = (n: number | null) => {
    if (!n) return null
    const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
    return `${n}${suffixes[n] ?? 'th'}`
  }

  const placementColor = (p: number | null) => {
    if (p === 1) return 'text-yellow-400'
    if (p === 2) return 'text-gray-300'
    if (p === 3) return 'text-orange-400'
    return 'text-gray-400'
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <TeamNameEditor teamId={team.id} initialName={team.name} />
          <DisplayNameEditor userId={user.id} initialName={profile.display_name} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5">
              <div className="flex items-center gap-3">
                <Trophy className="w-7 h-7 text-yellow-400 shrink-0" />
                <div>
                  <div className="text-2xl font-bold text-white">{formatPoints(teamTotal)}</div>
                  <div className="text-xs text-gray-400">Total Points</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-7 h-7 text-yellow-400 shrink-0" />
                <div>
                  <div className="text-2xl font-bold text-white">#{myRank || '—'}</div>
                  <div className="text-xs text-gray-400">League Rank</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5">
              <div className="flex items-center gap-3">
                <Users className="w-7 h-7 text-yellow-400 shrink-0" />
                <div>
                  <div className="text-2xl font-bold text-white">{myAthletes.length}/10</div>
                  <div className="text-xs text-gray-400">Athletes Drafted</div>
                </div>
              </div>
            </div>
          </div>

          {/* Roster */}
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-orange-600/30 flex items-center justify-between">
              <h2 className="text-lg font-semibold">My Roster</h2>
              {(draftSettings?.status === 'pending' || draftSettings?.status === 'active') && (
                <Link href="/draft" className="text-sm text-yellow-400 hover:text-yellow-300">
                  Go to Draft Room →
                </Link>
              )}
            </div>

            {myAthletes.length > 0 && (
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
                      <div className="w-16 text-center shrink-0 pt-0.5">
                        <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-1 rounded-full">
                          {weight}
                        </span>
                      </div>
                      {athlete ? (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-white">{athlete.name}</div>
                              <div className="text-sm text-gray-500">
                                {athlete.school} · Seed #{athlete.seed}
                                <span className="ml-2 text-gray-600">· Pick #{athlete.pick_number} (Rd {athlete.round})</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-bold text-yellow-400 text-lg">{formatPoints(athlete.total_points)}</div>
                              <div className="text-xs text-gray-600">pts total</div>
                            </div>
                          </div>
                          {athlete.total_points > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-3">
                              {athlete.champ_wins > 0 && (
                                <span className="flex items-center gap-1 text-xs bg-yellow-400/10 text-yellow-300 px-2 py-0.5 rounded-full">
                                  <Star className="w-3 h-3" />{athlete.champ_wins} champ {athlete.champ_wins === 1 ? 'win' : 'wins'}
                                </span>
                              )}
                              {athlete.consol_wins > 0 && (
                                <span className="flex items-center gap-1 text-xs bg-orange-400/10 text-orange-300 px-2 py-0.5 rounded-full">
                                  <Zap className="w-3 h-3" />{athlete.consol_wins} consol {athlete.consol_wins === 1 ? 'win' : 'wins'}
                                </span>
                              )}
                              {athlete.bonus_points > 0 && (
                                <span className="flex items-center gap-1 text-xs bg-blue-400/10 text-blue-300 px-2 py-0.5 rounded-full">
                                  <Award className="w-3 h-3" />+{formatPoints(athlete.bonus_points)} bonus
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
                          {draftSettings?.status === 'pending' ? 'Draft not started' :
                           draftSettings?.status === 'active' ? 'Not yet drafted' : '— Empty —'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Other Teams ─────────────────────────────────────────────── */}
          {otherTeams.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-yellow-400" />
                Other Teams
              </h2>

              {otherTeams
                .sort((a: any, b: any) => (teamTotals[b.id] ?? 0) - (teamTotals[a.id] ?? 0))
                .map((otherTeam: any) => {
                  const oAthletes = buildAthletes(picksByTeam[otherTeam.id] ?? [])
                  const oTotal = oAthletes.reduce((s, a) => s + (a.total_points ?? 0), 0)
                  const oWeightMap = Object.fromEntries(oAthletes.map((a: any) => [a.weight, a]))
                  const managerName = otherTeam.manager?.display_name || otherTeam.manager?.email || 'TBD'
                  const rank = allTotals.findIndex((t) => t === teamTotals[otherTeam.id]) + 1

                  return (
                    <details key={otherTeam.id} className="group bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                      <summary className="flex items-center gap-4 px-6 py-4 cursor-pointer list-none hover:bg-gray-800/40 transition-colors select-none">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white">{otherTeam.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {managerName}
                            {rank > 0 && <span className="ml-2 text-gray-600">· Rank #{rank}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-yellow-400">{formatPoints(oTotal)}</div>
                          <div className="text-xs text-gray-500">{oAthletes.length}/10 drafted</div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 transition-transform group-open:rotate-180" />
                      </summary>

                      <div className="border-t border-gray-800 divide-y divide-gray-800/60">
                        {WEIGHT_CLASSES.map((weight) => {
                          const ath = oWeightMap[weight] as any
                          return (
                            <div key={weight} className="flex items-center gap-4 px-6 py-3">
                              <div className="w-14 text-center shrink-0">
                                <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-0.5 rounded-full">
                                  {weight}
                                </span>
                              </div>
                              {ath ? (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate">{ath.name}</div>
                                    <div className="text-xs text-gray-500">{ath.school} · Seed #{ath.seed}</div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-sm font-bold text-yellow-400">{formatPoints(ath.total_points)}</div>
                                    {ath.total_points > 0 && (
                                      <div className="text-xs text-gray-600 flex items-center justify-end gap-1 mt-0.5 flex-wrap">
                                        {ath.champ_wins > 0 && <span className="text-yellow-500">{ath.champ_wins}✦</span>}
                                        {ath.consol_wins > 0 && <span className="text-orange-500">{ath.consol_wins}⚡</span>}
                                        {ath.placement_points > 0 && <span className="text-green-500">+{formatPoints(ath.placement_points)}pl</span>}
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="flex-1 text-gray-700 italic text-xs">— Empty —</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </details>
                  )
                })}
            </div>
          )}

        </div>

        {/* Right column — info sidebar */}
        <div className="space-y-4">

          {/* User info */}
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> My Account
            </h3>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-500">Display Name</div>
                <div className="text-sm font-medium text-white mt-0.5">
                  {profile.display_name ?? <span className="text-gray-500 italic">Not set</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</div>
                <div className="text-sm text-gray-300 mt-0.5 break-all">{profile.email}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Role</div>
                <div className="mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                    profile.role === 'commissioner'
                      ? 'bg-yellow-950 border-yellow-700 text-yellow-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}>
                    {profile.role === 'commissioner' ? '👑 Commissioner' : 'Team Manager'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Current season */}
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5" /> Current Season
            </h3>
            {currentSeason ? (
              <div className="space-y-2">
                <div className="font-semibold text-white text-sm">{currentSeason.label}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${
                    currentSeason.status === 'active'    ? 'bg-green-950 border-green-800 text-green-300' :
                    currentSeason.status === 'drafting'  ? 'bg-purple-950 border-purple-800 text-purple-300' :
                    currentSeason.status === 'complete'  ? 'bg-blue-950 border-blue-800 text-blue-300' :
                                                           'bg-gray-800 border-gray-700 text-gray-300'
                  }`}>
                    {currentSeason.status}
                  </span>
                </div>
                {currentTeamSeason?.draft_position && (
                  <div className="text-xs text-gray-400">
                    Draft position: <span className="text-white font-semibold">#{currentTeamSeason.draft_position}</span>
                  </div>
                )}
                {currentTeamSeason?.final_placement && (
                  <div className="text-xs text-gray-400">
                    Final placement: <span className={`font-semibold ${placementColor(currentTeamSeason.final_placement)}`}>
                      {placementLabel(currentTeamSeason.final_placement)} place
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active season.</p>
            )}
          </div>

          {/* Season history */}
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Season History
            </h3>
            {!pastSeasons || pastSeasons.length === 0 ? (
              <p className="text-sm text-gray-500">No completed seasons yet.</p>
            ) : (
              <div className="space-y-2">
                {pastSeasons.map((ts: any) => {
                  const season = ts.season
                  return (
                    <div key={`${season?.id}-${ts.final_placement}`} className="flex items-center gap-3">
                      <div className={`shrink-0 ${placementColor(ts.final_placement)}`}>
                        {ts.final_placement === 1 ? (
                          <Crown className="w-4 h-4 fill-current" />
                        ) : (
                          <Medal className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white">{season?.label ?? `Season ${season?.year}`}</div>
                        <div className={`text-xs ${placementColor(ts.final_placement)}`}>
                          {placementLabel(ts.final_placement)} place
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-yellow-400 shrink-0">
                        {Number(ts.total_points).toFixed(1)} pts
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

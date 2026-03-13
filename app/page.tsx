import { createClient } from '@/lib/supabase/server'
import { formatPoints, getRankSuffix } from '@/lib/utils'
import { Trophy, Megaphone, TrendingUp, Users, CalendarDays, User, Crown } from 'lucide-react'
import Link from 'next/link'
import { Team, Announcement } from '@/types'
import { DraftCountdown } from '@/components/shared/DraftCountdown'

export const revalidate = 60 // Revalidate standings every 60 seconds

async function getStandings() {
  const supabase = await createClient()

  // Get all teams with their managers
  // Must use explicit FK hint (manager_id) because there are two FKs between teams
  // and profiles (teams.manager_id → profiles and profiles.team_id → teams), which
  // causes PostgREST to return null when the join is ambiguous.
  const { data: teams } = await supabase
    .from('teams')
    .select('*, manager:profiles!manager_id(display_name, email)')
    .order('name')

  // Get all draft picks with athlete scores
  const { data: picks } = await supabase
    .from('draft_picks')
    .select('team_id, athlete:athletes(id, name, weight, seed, school, scores(total_points))')

  // Get announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*, creator:profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(5)

  // Get active quick links
  const { data: quickLinks } = await supabase
    .from('quick_links')
    .select('id, label, url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Calculate team totals
  const teamTotals: Record<string, number> = {}
  const teamAthleteCount: Record<string, number> = {}

  picks?.forEach((pick) => {
    const athletePoints = (pick.athlete as any)?.scores?.reduce(
      (sum: number, s: any) => sum + (s.total_points ?? 0),
      0
    ) ?? 0
    teamTotals[pick.team_id] = (teamTotals[pick.team_id] ?? 0) + athletePoints
    teamAthleteCount[pick.team_id] = (teamAthleteCount[pick.team_id] ?? 0) + 1
  })

  // Sort by total points descending
  const standings = (teams ?? [])
    .map((team) => ({
      team: team as Team & { manager: { display_name: string | null; email: string } },
      total_points: teamTotals[team.id] ?? 0,
      athletes_drafted: teamAthleteCount[team.id] ?? 0,
    }))
    .sort((a, b) => b.total_points - a.total_points)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))

  return {
    standings,
    announcements: (announcements ?? []) as any[],
    quickLinks: (quickLinks ?? []) as { id: string; label: string; url: string }[],
  }
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Do NOT server-redirect unauthenticated users — Supabase invite links redirect
  // here with #type=invite&access_token=... hash params that server redirects strip.
  // The InviteRedirector client component (in layout) detects those and routes to
  // /invite/accept before the user sees anything.  Plain unauthenticated visitors
  // see the sign-in prompt below.
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400 mx-auto" />
          <h1 className="text-2xl sm:text-4xl font-bold text-white">5 on 2 Fantasy Wrestling</h1>
          <p className="text-gray-400 text-base sm:text-lg">NCAA Tournament Fantasy League</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold rounded-xl text-lg transition-colors"
          >
            Sign In to View Standings →
          </Link>
        </div>
      </div>
    )
  }

  // Fetch current season + user profile in parallel with other data
  const { data: currentSeason } = await supabase
    .from('seasons').select('id, label, status, year').eq('is_current', true).maybeSingle()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, team_id, team:teams!profiles_team_id_fkey(name)')
    .eq('id', user.id)
    .single()

  const [{ standings, announcements, quickLinks }, { data: draftSettings }, { data: draftOrderRaw }] = await Promise.all([
    getStandings(),
    supabase.from('draft_settings').select('status, draft_start_date').maybeSingle(),
    currentSeason
      ? supabase
          .from('team_seasons')
          .select('draft_position, team:teams(id, name)')
          .eq('season_id', currentSeason.id)
          .not('draft_position', 'is', null)
          .order('draft_position', { ascending: true })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ])

  // Top 3 teams in draft order
  type DraftSlot = { draft_position: number; team: { id: string; name: string } | null }
  const top3: DraftSlot[] = ((draftOrderRaw ?? []) as unknown as DraftSlot[])
    .filter((r) => r.team)
    .slice(0, 3)

  const showCountdown =
    draftSettings?.status === 'pending' &&
    draftSettings?.draft_start_date &&
    new Date(draftSettings.draft_start_date) > new Date()

  const seasonStatusColor = (s: string | undefined) => {
    if (s === 'active')    return 'bg-green-950 border-green-800 text-green-300'
    if (s === 'drafting')  return 'bg-purple-950 border-purple-800 text-purple-300'
    if (s === 'complete')  return 'bg-blue-950 border-blue-800 text-blue-300'
    return 'bg-gray-800 border-gray-700 text-gray-300'
  }

  const teamName = (profile?.team as any)?.name as string | undefined

  return (
    <div className="space-y-8">
      {/* Info cards — Current Season + User */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Current Season */}
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5" /> Current Season
          </h3>
          {currentSeason ? (
            <div className="space-y-2">
              <div className="font-semibold text-white text-lg">{currentSeason.label}</div>
              <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize border ${seasonStatusColor(currentSeason.status)}`}>
                {currentSeason.status}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active season set.</p>
          )}
        </div>

        {/* User info */}
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> My Account
          </h3>
          <div className="space-y-1.5">
            <div className="font-semibold text-white text-lg">
              {profile?.display_name ?? user.email?.split('@')[0]}
            </div>
            <div className="text-xs text-gray-500">{user.email}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                profile?.role === 'commissioner'
                  ? 'bg-yellow-950 border-yellow-700 text-yellow-300'
                  : 'bg-gray-800 border-gray-700 text-gray-300'
              }`}>
                {profile?.role === 'commissioner' ? <><Crown className="w-3 h-3" /> Commissioner</> : 'Team Manager'}
              </span>
              {teamName && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {teamName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Draft countdown banner */}
      {showCountdown && (
        <div className="bg-gray-900 border border-yellow-400/30 rounded-xl px-6 py-5 space-y-5">
          {/* Top row: title + countdown */}
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400 shrink-0" />
              <div>
                <div className="font-bold text-white text-lg">Draft Coming Up!</div>
                <div className="text-sm text-gray-400">Get your wishlist ready before the draft begins.</div>
              </div>
            </div>
            <DraftCountdown draftStartDate={draftSettings!.draft_start_date!} />
          </div>

          {/* Draft order slots */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-yellow-400/10 pt-4">
              {top3.map((slot, i) => {
                const labels = [
                  { label: 'On the Clock', color: 'text-green-400', border: 'border-green-800', bg: 'bg-green-950/40' },
                  { label: 'Up Next',       color: 'text-yellow-400', border: 'border-yellow-800', bg: 'bg-yellow-950/30' },
                  { label: 'In the Hole',   color: 'text-gray-400',   border: 'border-gray-700',  bg: 'bg-gray-800/40' },
                ]
                const { label, color, border, bg } = labels[i]
                return (
                  <div key={slot.team!.id} className={`flex flex-col gap-1 px-4 py-3 rounded-lg border ${bg} ${border}`}>
                    <span className={`text-xs font-bold uppercase tracking-widest ${color}`}>{label}</span>
                    <span className="font-semibold text-white text-sm">{slot.team!.name}</span>
                    <span className="text-xs text-gray-500">Pick #{slot.draft_position}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Enter Draft button */}
          <div className="border-t border-yellow-400/10 pt-4 flex">
            <Link
              href="/draft"
              className="flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
            >
              <Trophy className="w-4 h-4" />
              Enter Draft Room
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Standings Table */}
        <div className="lg:col-span-2">
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-orange-600/30 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold">League Standings</h2>
            </div>

            {standings.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No teams yet. The Commissioner will set up the league soon.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {standings.map(({ team, total_points, athletes_drafted, rank }) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-800/50 transition-colors group"
                  >
                    {/* Rank */}
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                      ${rank === 1 ? 'bg-yellow-400 text-gray-900' :
                        rank === 2 ? 'bg-gray-300 text-gray-900' :
                        rank === 3 ? 'bg-amber-600 text-white' :
                        'bg-gray-800 text-gray-400'}
                    `}>
                      {rank}
                    </div>

                    {/* Team info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white group-hover:text-yellow-400 transition-colors truncate">
                        {team.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {team.manager?.display_name ?? team.manager?.email ?? 'No manager'}
                        {' · '}
                        {athletes_drafted}/10 athletes drafted
                      </div>
                    </div>

                    {/* Points */}
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-yellow-400">
                        {formatPoints(total_points)}
                      </div>
                      <div className="text-xs text-gray-500">points</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Announcements */}
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-orange-600/30 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold">Announcements</h2>
            </div>

            {announcements.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                No announcements yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {announcements.map((a: Announcement & { creator: any }) => (
                  <div key={a.id} className="px-6 py-4">
                    <div className="font-medium text-white text-sm">{a.title}</div>
                    <div className="text-gray-400 text-sm mt-1 leading-relaxed">{a.body}</div>
                    <div className="text-xs text-gray-600 mt-2">
                      {a.creator?.display_name ?? 'Commissioner'} ·{' '}
                      {new Date(a.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links — managed by Commissioner */}
          {quickLinks.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quick Links</h3>
              {quickLinks.map((ql) => {
                const isExternal = ql.url.startsWith('http')
                return isExternal ? (
                  <a
                    key={ql.id}
                    href={ql.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                  >
                    → {ql.label}
                  </a>
                ) : (
                  <Link
                    key={ql.id}
                    href={ql.url}
                    className="block text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                  >
                    → {ql.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

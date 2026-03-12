import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatPoints, getRankSuffix } from '@/lib/utils'
import { Trophy, Megaphone, TrendingUp, Users } from 'lucide-react'
import Link from 'next/link'
import { Team, Announcement } from '@/types'
import { DraftCountdown } from '@/components/shared/DraftCountdown'

export const revalidate = 60 // Revalidate standings every 60 seconds

async function getStandings() {
  const supabase = await createClient()

  // Get all teams with their managers
  const { data: teams } = await supabase
    .from('teams')
    .select('*, manager:profiles(display_name, email)')
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
  // Require sign-in
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ standings, announcements, quickLinks }, { data: draftSettings }] = await Promise.all([
    getStandings(),
    supabase.from('draft_settings').select('status, draft_start_date').maybeSingle(),
  ])

  const showCountdown =
    draftSettings?.status === 'pending' &&
    draftSettings?.draft_start_date &&
    new Date(draftSettings.draft_start_date) > new Date()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Trophy className="w-10 h-10 text-yellow-400" />
          <h1 className="text-4xl font-bold text-white">5 on 2 Fantasy Wrestling</h1>
        </div>
        <p className="text-gray-400 text-lg">NCAA Tournament Fantasy League — Live Standings</p>
      </div>

      {/* Draft countdown banner */}
      {showCountdown && (
        <div className="bg-gray-900 border border-yellow-400/30 rounded-xl px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-400 shrink-0" />
            <div>
              <div className="font-bold text-white text-lg">Draft Coming Up!</div>
              <div className="text-sm text-gray-400">Get your wishlist ready before the draft begins.</div>
            </div>
          </div>
          <DraftCountdown draftStartDate={draftSettings!.draft_start_date!} />
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

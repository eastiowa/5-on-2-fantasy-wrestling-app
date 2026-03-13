import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Upload, ClipboardList, Megaphone, BarChart3, Shield, Trophy, CalendarDays, UserCog, Link2 } from 'lucide-react'

export default async function CommissionerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') redirect('/dashboard')

  // Get quick stats
  const [
    { count: athleteCount },
    { count: teamCount },
    { data: draftSettings },
    { count: announcementCount },
    { data: currentSeason },
    { count: seasonCount },
    { count: commissionerCount },
    { count: quickLinkCount },
  ] = await Promise.all([
    supabase.from('athletes').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }),
    supabase.from('draft_settings').select('status, current_pick_number').maybeSingle(),
    supabase.from('announcements').select('*', { count: 'exact', head: true }),
    supabase.from('seasons').select('id, label, status, year').eq('is_current', true).maybeSingle(),
    supabase.from('seasons').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'commissioner'),
    supabase.from('quick_links').select('*', { count: 'exact', head: true }),
  ])

  const tools = [
    {
      href: '/commissioner/seasons',
      icon: CalendarDays,
      label: 'Seasons',
      description: 'Create annual seasons, set current year, track history',
      count: currentSeason
        ? `${currentSeason.label} · ${currentSeason.status}`
        : `${seasonCount ?? 0} season${seasonCount !== 1 ? 's' : ''}`,
    },
    {
      href: '/commissioner/seasons/results',
      icon: Trophy,
      label: 'Historical Results',
      description: 'Import past-season final standings from team names + scores',
      count: 'Upload history',
    },
    {
      href: '/commissioner/athletes',
      icon: Upload,
      label: 'Wrestlers',
      description: 'Upload athlete list via CSV, view or remove athletes',
      count: `${athleteCount ?? 0} athletes`,
    },
    {
      href: '/commissioner/teams',
      icon: Users,
      label: 'Teams',
      description: 'Create teams and assign verified users as managers',
      count: `${teamCount ?? 0}/10 teams`,
    },
    {
      href: '/commissioner/draft',
      icon: ClipboardList,
      label: 'Draft Controls',
      description: 'Draft order, start/pause/override, timer & rules',
      count: draftSettings
        ? `${draftSettings.status.charAt(0).toUpperCase() + draftSettings.status.slice(1)} — Pick #${draftSettings.current_pick_number}`
        : 'Not started',
    },
    {
      href: '/commissioner/scores',
      icon: BarChart3,
      label: 'Scores',
      description: 'Upload CSV scores or sync from Google Sheets',
      count: 'Update scores',
    },
    {
      href: '/commissioner/announcements',
      icon: Megaphone,
      label: 'Announcements',
      description: 'Post league-wide announcements to the home page',
      count: `${announcementCount ?? 0} posted`,
    },
    {
      href: '/commissioner/users',
      icon: UserCog,
      label: 'Users',
      description: 'Create accounts, manage roles, assign teams',
      count: `${commissionerCount ?? 0} commissioner${commissionerCount !== 1 ? 's' : ''}`,
    },
    {
      href: '/commissioner/quick-links',
      icon: Link2,
      label: 'Quick Links',
      description: 'Manage links shown on the standings home page',
      count: `${quickLinkCount ?? 0} link${quickLinkCount !== 1 ? 's' : ''}`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-3xl font-bold text-white">Commissioner Dashboard</h1>

        </div>
      </div>

      {/* Current season banner */}
      {currentSeason ? (
        <div className="bg-gray-900 border border-yellow-400/30 rounded-xl px-6 py-4 flex items-center gap-3 flex-wrap">
          <CalendarDays className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-white">{currentSeason.label}</span>
            <span className={`ml-3 px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize
              ${currentSeason.status === 'active'    ? 'bg-green-950 border-green-800 text-green-300' :
                currentSeason.status === 'drafting'  ? 'bg-purple-950 border-purple-800 text-purple-300' :
                currentSeason.status === 'complete'  ? 'bg-blue-950 border-blue-800 text-blue-300' :
                                                       'bg-gray-800 border-gray-700 text-gray-300'}`}>
              {currentSeason.status}
            </span>
          </div>
          <Link
            href="/commissioner/seasons"
            className="shrink-0 text-sm text-yellow-400 hover:underline font-medium"
          >
            Manage Seasons →
          </Link>
        </div>
      ) : (
        <div className="bg-yellow-950/40 border border-yellow-600/40 rounded-xl px-6 py-4 flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-yellow-500 shrink-0" />
          <span className="text-yellow-300 text-sm font-medium flex-1">No active season set.</span>
          <Link
            href="/commissioner/seasons"
            className="shrink-0 px-4 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors"
          >
            Create Season →
          </Link>
        </div>
      )}

      {/* Draft status banner */}
      {draftSettings && (
        <div className={`
          rounded-xl border px-6 py-4 flex items-center gap-3
          ${draftSettings.status === 'active'
            ? 'bg-green-950 border-green-800 text-green-300'
            : draftSettings.status === 'paused'
            ? 'bg-yellow-950 border-yellow-800 text-yellow-300'
            : draftSettings.status === 'complete'
            ? 'bg-blue-950 border-blue-800 text-blue-300'
            : 'bg-gray-900 border-gray-800 text-gray-400'}
        `}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            draftSettings.status === 'active' ? 'bg-green-400 animate-pulse' :
            draftSettings.status === 'paused' ? 'bg-yellow-400' :
            draftSettings.status === 'complete' ? 'bg-blue-400' : 'bg-gray-600'
          }`} />
          <span className="font-medium capitalize">Draft {draftSettings.status}</span>
          {draftSettings.status === 'active' && (
            <span className="text-sm">· Currently on pick #{draftSettings.current_pick_number}</span>
          )}
          {draftSettings.status === 'active' && (
            <Link href="/commissioner/draft" className="ml-auto text-sm font-medium underline hover:no-underline">
              Manage Draft →
            </Link>
          )}
        </div>
      )}

      {/* Tool grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(({ href, icon: Icon, label, description, count }) => (
          <Link
            key={href}
            href={href}
            className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 hover:border-orange-500/60 hover:bg-gray-800/50 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-yellow-400/10 transition-colors">
                <Icon className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white group-hover:text-yellow-400 transition-colors">
                  {label}
                </div>
                <div className="text-sm text-gray-500 mt-1">{description}</div>
                <div className="text-xs text-yellow-400/70 mt-2 font-medium">{count}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* My Team shortcut — shown when commissioner has claimed a team */}
      {profile?.team_id && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <p className="font-semibold text-white text-sm">You are managing a team</p>
              <p className="text-xs text-gray-400 mt-0.5">
                View your team&apos;s roster, scores, and draft picks.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors"
          >
            My Team Dashboard →
          </Link>
        </div>
      )}
    </div>
  )
}

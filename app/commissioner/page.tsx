import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Upload, ClipboardList, Settings, Megaphone, BarChart3, Shield } from 'lucide-react'

export default async function CommissionerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') redirect('/dashboard')

  // Get quick stats
  const [
    { count: athleteCount },
    { count: teamCount },
    { data: draftSettings },
    { count: announcementCount },
  ] = await Promise.all([
    supabase.from('athletes').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }),
    supabase.from('draft_settings').select('status, current_pick_number').single(),
    supabase.from('announcements').select('*', { count: 'exact', head: true }),
  ])

  const tools = [
    {
      href: '/commissioner/athletes',
      icon: Upload,
      label: 'Manage Athletes',
      description: 'Upload athlete list via CSV, view or remove athletes',
      count: `${athleteCount ?? 0} athletes`,
    },
    {
      href: '/commissioner/teams',
      icon: Users,
      label: 'Manage Teams',
      description: 'Create teams, assign managers, send invite links',
      count: `${teamCount ?? 0}/10 teams`,
    },
    {
      href: '/commissioner/draft',
      icon: ClipboardList,
      label: 'Draft Control',
      description: 'Set draft order, start/pause/override the draft',
      count: draftSettings
        ? `${draftSettings.status.charAt(0).toUpperCase() + draftSettings.status.slice(1)} — Pick #${draftSettings.current_pick_number}`
        : 'Not started',
    },
    {
      href: '/commissioner/scores',
      icon: BarChart3,
      label: 'Score Management',
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
      href: '/commissioner/settings',
      icon: Settings,
      label: 'Draft Settings',
      description: 'Pick timer, auto-skip, snake draft rules',
      count: 'Configure',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-3xl font-bold text-white">Commissioner Dashboard</h1>
          <p className="text-gray-400 mt-1">5 on 2 Fantasy Wrestling League</p>
        </div>
      </div>

      {/* Status banner */}
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
            className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-yellow-400/50 hover:bg-gray-800/50 transition-all group"
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
    </div>
  )
}

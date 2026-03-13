import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClipboardList, ListOrdered, Settings } from 'lucide-react'
import { DraftControlPanel } from '@/components/commissioner/DraftControlPanel'
import { DraftOrderEditor } from '@/components/commissioner/DraftOrderEditor'
import { DraftSettingsForm } from '@/components/commissioner/DraftSettingsForm'

export default async function CommissionerDraftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  const [
    { data: settings },
    { data: teamsRaw },
    { data: picks },
    { data: currentSeason },
  ] = await Promise.all([
    supabase.from('draft_settings').select('*').maybeSingle(),
    supabase.from('teams').select('*, manager:profiles!manager_id(display_name, email)').order('name', { ascending: true }),
    supabase.from('draft_picks').select('*, team:teams(name), athlete:athletes(name, weight, seed, school)').order('pick_number'),
    supabase.from('seasons').select('id, label, status').eq('is_current', true).maybeSingle(),
  ])

  // Merge draft_position from team_seasons for the current season
  let teams = (teamsRaw ?? []).map((t: any) => ({ ...t, draft_position: null as number | null }))
  if (currentSeason) {
    const { data: teamSeasons } = await supabase
      .from('team_seasons')
      .select('team_id, draft_position')
      .eq('season_id', currentSeason.id)
    const posMap: Record<string, number | null> = {}
    teamSeasons?.forEach((ts: any) => { posMap[ts.team_id] = ts.draft_position })
    teams = teams
      .map((t: any) => ({ ...t, draft_position: posMap[t.id] ?? null }))
      .sort((a: any, b: any) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
  }

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <ClipboardList className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Draft Controls</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control the draft, set order, and configure rules — all in one place.</p>
        </div>
      </div>

      {/* ── Section 1: Draft Control (start / pause / skip / reset + pick log) ── */}
      <DraftControlPanel
        initialSettings={settings as any}
        teams={teams as any}
        picks={(picks ?? []) as any}
      />

      {/* ── Section 2: Draft Order ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-orange-600/20">
          <ListOrdered className="w-4 h-4 text-yellow-400" />
          <h2 className="font-semibold text-white">Draft Order</h2>
          {currentSeason ? (
            <span className="ml-2 text-sm text-gray-400">— {currentSeason.label}</span>
          ) : (
            <span className="ml-2 text-sm text-yellow-600">No active season set</span>
          )}
          {currentSeason?.status === 'complete' && (
            <span className="ml-auto text-xs text-gray-500">(read-only — season complete)</span>
          )}
        </div>

        <div className="p-6">
          {currentSeason ? (
            <DraftOrderEditor
              seasonId={currentSeason.id}
              seasonLabel={currentSeason.label}
              readOnly={currentSeason.status === 'complete'}
            />
          ) : (
            <p className="text-gray-500 text-sm">
              Create and activate a season in{' '}
              <a href="/commissioner/seasons" className="text-yellow-400 hover:underline">Season Management</a>
              {' '}to set the draft order.
            </p>
          )}
        </div>
      </div>

      {/* ── Section 3: Draft Settings (timer, snake, overnight pause) ─────────── */}
      <DraftSettingsForm />

    </div>
  )
}

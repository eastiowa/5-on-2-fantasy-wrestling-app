import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DraftControlPanel } from '@/components/commissioner/DraftControlPanel'
import { ClipboardList } from 'lucide-react'

export default async function CommissionerDraftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  const [{ data: settings }, { data: teamsRaw }, { data: picks }, { data: currentSeason }] = await Promise.all([
    supabase.from('draft_settings').select('*').maybeSingle(),
    supabase.from('teams').select('*, manager:profiles!manager_id(display_name, email)').order('name', { ascending: true }),
    supabase.from('draft_picks').select('*, team:teams(name), athlete:athletes(name, weight, seed, school)').order('pick_number'),
    supabase.from('seasons').select('id').eq('is_current', true).maybeSingle(),
  ])

  // Merge draft_position from team_seasons
  let teams = (teamsRaw ?? []).map((t: any) => ({ ...t, draft_position: null as number | null }))
  if (currentSeason) {
    const { data: teamSeasons } = await supabase
      .from('team_seasons').select('team_id, draft_position').eq('season_id', currentSeason.id)
    const posMap: Record<string, number | null> = {}
    teamSeasons?.forEach((ts: any) => { posMap[ts.team_id] = ts.draft_position })
    teams = teams
      .map((t: any) => ({ ...t, draft_position: posMap[t.id] ?? null }))
      .sort((a: any, b: any) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Draft Control</h1>

        </div>
      </div>
      <DraftControlPanel
        initialSettings={settings as any}
        teams={teams as any}
        picks={(picks ?? []) as any}
      />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DraftRoom } from '@/components/draft/DraftRoom'

export default async function DraftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id, display_name, email')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const [
    { data: settings },
    { data: teamsRaw },
    { data: athletes },
    { data: picks },
    { data: messages },
    { data: wishlist },
    { data: currentSeason },
  ] = await Promise.all([
    supabase.from('draft_settings').select('*').maybeSingle(),
    supabase.from('teams').select('id, name, manager_id').order('name', { ascending: true }),
    supabase.from('athletes').select('*').order('weight').order('seed'),
    supabase.from('draft_picks').select('*, athlete:athletes(id, name, weight, seed, school)').order('pick_number'),
    supabase.from('draft_chat_messages').select('*').order('created_at', { ascending: true }).limit(200),
    profile.team_id
      ? supabase.from('draft_wishlist').select('*, athlete:athletes(id, name, weight, seed, school, is_drafted)').eq('team_id', profile.team_id).order('rank')
      : { data: [] },
    supabase.from('seasons').select('id').eq('is_current', true).maybeSingle(),
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
    <DraftRoom
      initialSettings={settings as any}
      teams={teams as any}
      initialAthletes={(athletes ?? []) as any}
      initialPicks={(picks ?? []) as any}
      initialMessages={(messages ?? []) as any}
      initialWishlist={(wishlist ?? []) as any}
      userId={user.id}
      userRole={profile.role as any}
      userTeamId={profile.team_id}
      userName={profile.display_name ?? profile.email ?? 'Unknown'}
    />
  )
}

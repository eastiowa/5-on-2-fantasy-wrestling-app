import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Fetch teams (no draft_position — it lives in team_seasons now)
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*, manager:profiles!manager_id(id, display_name, email)')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Merge draft_position from the current season's team_seasons
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()

  if (currentSeason) {
    const { data: teamSeasons } = await supabase
      .from('team_seasons')
      .select('team_id, draft_position')
      .eq('season_id', currentSeason.id)

    const posMap: Record<string, number | null> = {}
    teamSeasons?.forEach((ts) => { posMap[ts.team_id] = ts.draft_position })

    const merged = (teams ?? [])
      .map((t) => ({ ...t, draft_position: posMap[t.id] ?? null }))
      .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))

    return NextResponse.json(merged)
  }

  // No current season — return teams without draft_position
  return NextResponse.json((teams ?? []).map((t) => ({ ...t, draft_position: null })))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Team name is required' }, { status: 400 })

  const { count } = await supabase.from('teams').select('*', { count: 'exact', head: true })
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum of 10 teams allowed' }, { status: 400 })
  }

  // draft_position is now in team_seasons, not on teams
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  // Save draft order — writes to team_seasons for the current season
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { order }: { order: { id: string; draft_position: number }[] } = await req.json()
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order array required' }, { status: 400 })

  // Get current season
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()

  if (!currentSeason) {
    return NextResponse.json(
      { error: 'No active season set. Create a season before saving draft order.' },
      { status: 400 }
    )
  }

  // Upsert into team_seasons
  const upserts = order.map(({ id, draft_position }) => ({
    team_id: id,
    season_id: currentSeason.id,
    draft_position,
  }))

  const { error } = await supabase
    .from('team_seasons')
    .upsert(upserts, { onConflict: 'team_id,season_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

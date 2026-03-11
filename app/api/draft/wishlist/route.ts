import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const teamId = profile.role === 'commissioner'
    ? (new URL('http://x?' + (new URLSearchParams({})).toString())).searchParams.get('team_id')
    : profile.team_id

  if (!teamId) return NextResponse.json([])

  const { data, error } = await supabase
    .from('draft_wishlist')
    .select('*, athlete:athletes(id, name, weight, school, seed, is_drafted)')
    .eq('team_id', teamId)
    .order('rank', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()
  const { athlete_id, team_id: overrideTeamId } = await req.json()

  const teamId = profile?.role === 'commissioner' ? overrideTeamId : profile?.team_id
  if (!teamId) return NextResponse.json({ error: 'No team assigned' }, { status: 400 })

  // Find the next rank
  const { data: existing } = await supabase
    .from('draft_wishlist')
    .select('rank')
    .eq('team_id', teamId)
    .order('rank', { ascending: false })
    .limit(1)

  const nextRank = (existing?.[0]?.rank ?? 0) + 1

  const { data, error } = await supabase
    .from('draft_wishlist')
    .upsert({ team_id: teamId, athlete_id, rank: nextRank }, { onConflict: 'team_id,athlete_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  // Reorder wishlist
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()
  const { items, team_id: overrideTeamId }: { items: { id: string; rank: number }[]; team_id?: string } = await req.json()

  const teamId = profile?.role === 'commissioner' ? overrideTeamId : profile?.team_id
  if (!teamId) return NextResponse.json({ error: 'No team' }, { status: 400 })

  await Promise.all(
    items.map(({ id, rank }) =>
      supabase.from('draft_wishlist').update({ rank }).eq('id', id).eq('team_id', teamId)
    )
  )

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()
  const { id, team_id: overrideTeamId } = await req.json()

  const teamId = profile?.role === 'commissioner' ? overrideTeamId : profile?.team_id
  if (!teamId) return NextResponse.json({ error: 'No team' }, { status: 400 })

  const { error } = await supabase.from('draft_wishlist').delete().eq('id', id).eq('team_id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

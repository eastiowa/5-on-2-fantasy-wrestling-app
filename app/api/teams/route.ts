import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('*, manager:profiles!manager_id(id, display_name, email)')
    .order('draft_position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, draft_position } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Team name is required' }, { status: 400 })

  const { data: existing } = await supabase.from('teams').select('id', { count: 'exact', head: true })
  const { count } = await supabase.from('teams').select('*', { count: 'exact', head: true })
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Maximum of 10 teams allowed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({ name: name.trim(), draft_position: draft_position ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: Request) {
  // Update draft order for all teams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { order }: { order: { id: string; draft_position: number }[] } = await req.json()
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order array required' }, { status: 400 })

  const updates = order.map(({ id, draft_position }) =>
    supabase.from('teams').update({ draft_position }).eq('id', id)
  )
  await Promise.all(updates)

  return NextResponse.json({ success: true })
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const allowed = ['pick_timer_seconds', 'auto_skip_on_timeout', 'snake_enabled']
  const update = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: settings } = await supabase.from('draft_settings').select('id').single()
  if (!settings) return NextResponse.json({ error: 'Draft settings not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('draft_settings')
    .update(update)
    .eq('id', settings.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

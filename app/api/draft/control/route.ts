import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action } = await req.json()
  // action: 'start' | 'pause' | 'resume' | 'reset'

  const { data: settings } = await supabase.from('draft_settings').select('*').single()
  if (!settings) return NextResponse.json({ error: 'Draft settings not found' }, { status: 404 })

  let update: Record<string, unknown> = {}

  switch (action) {
    case 'start':
      if (settings.status !== 'pending') {
        return NextResponse.json({ error: 'Draft is not in pending state' }, { status: 400 })
      }
      update = {
        status: 'active',
        current_pick_number: 1,
        pick_started_at: settings.pick_timer_seconds > 0 ? new Date().toISOString() : null,
      }
      // Post system message
      await supabase.from('draft_chat_messages').insert({
        sender_name: 'Draft Bot',
        sender_role: 'system',
        is_system: true,
        message: '🏆 The draft has started! Good luck to all teams.',
      })
      break

    case 'pause':
      if (settings.status !== 'active') {
        return NextResponse.json({ error: 'Draft is not active' }, { status: 400 })
      }
      update = { status: 'paused', pick_started_at: null }
      await supabase.from('draft_chat_messages').insert({
        sender_name: 'Draft Bot',
        sender_role: 'system',
        is_system: true,
        message: '⏸️ The draft has been paused by the Commissioner.',
      })
      break

    case 'resume':
      if (settings.status !== 'paused') {
        return NextResponse.json({ error: 'Draft is not paused' }, { status: 400 })
      }
      update = {
        status: 'active',
        pick_started_at: settings.pick_timer_seconds > 0 ? new Date().toISOString() : null,
      }
      await supabase.from('draft_chat_messages').insert({
        sender_name: 'Draft Bot',
        sender_role: 'system',
        is_system: true,
        message: '▶️ The draft has resumed.',
      })
      break

    case 'reset':
      // Full reset — delete all picks, un-draft all athletes
      await supabase.from('draft_picks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('athletes').update({ is_drafted: false }).neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('draft_chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('draft_wishlist').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      update = {
        status: 'pending',
        current_pick_number: 1,
        pick_started_at: null,
      }
      break

    case 'skip':
      // Skip the current pick (commissioner only)
      if (settings.status !== 'active') {
        return NextResponse.json({ error: 'Draft is not active' }, { status: 400 })
      }
      const nextPick = settings.current_pick_number + 1
      const isDone = nextPick > 100
      update = {
        current_pick_number: isDone ? settings.current_pick_number : nextPick,
        status: isDone ? 'complete' : 'active',
        pick_started_at: isDone ? null : (settings.pick_timer_seconds > 0 ? new Date().toISOString() : null),
      }
      await supabase.from('draft_chat_messages').insert({
        sender_name: 'Draft Bot',
        sender_role: 'system',
        is_system: true,
        message: `⏭️ Pick #${settings.current_pick_number} was skipped by the Commissioner.`,
      })
      break

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  const { error } = await supabase.from('draft_settings').update(update).eq('id', settings.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, action })
}

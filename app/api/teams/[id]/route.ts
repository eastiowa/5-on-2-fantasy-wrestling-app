import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check if draft has started — don't allow deleting teams mid-draft
  const { data: settings } = await supabase.from('draft_settings').select('status').single()
  if (settings?.status === 'active' || settings?.status === 'complete') {
    return NextResponse.json({ error: 'Cannot delete teams after draft has started.' }, { status: 400 })
  }

  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const isCommissioner = profile?.role === 'commissioner'

  if (!isCommissioner) {
    // Non-commissioners can only rename their OWN team
    const { data: teamCheck } = await supabase
      .from('teams').select('manager_id').eq('id', id).single()
    if (!teamCheck || teamCheck.manager_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()

  // Managers may change name and auto_draft; commissioner can also change manager_id
  const allowed = isCommissioner ? ['name', 'manager_id', 'auto_draft'] : ['name', 'auto_draft']
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase.from('teams').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

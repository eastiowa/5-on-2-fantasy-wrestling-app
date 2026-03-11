import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireCommissioner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') {
    return { supabase, error: NextResponse.json({ error: 'Commissioner only' }, { status: 403 }) }
  }

  return { supabase, error: null }
}

// PATCH /api/quick-links/[id]
// Body: { label?, url?, sort_order?, is_active? }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, error } = await requireCommissioner()
  if (error) return error

  const { id } = await params
  const body = await req.json()

  const allowed = ['label', 'url', 'sort_order', 'is_active']
  const update = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Trim string fields
  if (update.label) update.label = String(update.label).trim()
  if (update.url)   update.url   = String(update.url).trim()

  const { data, error: dbErr } = await supabase
    .from('quick_links')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/quick-links/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, error } = await requireCommissioner()
  if (error) return error

  const { id } = await params

  const { error: dbErr } = await supabase
    .from('quick_links')
    .delete()
    .eq('id', id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

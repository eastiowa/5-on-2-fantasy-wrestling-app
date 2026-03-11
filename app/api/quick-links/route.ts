import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/quick-links — public, returns all active links ordered by sort_order
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quick_links')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/quick-links — commissioner creates a new link
// Body: { label: string, url: string, sort_order?: number, is_active?: boolean }
export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  const body = await req.json()
  const { label, url, sort_order = 0, is_active = true } = body

  if (!label?.trim() || !url?.trim()) {
    return NextResponse.json({ error: 'label and url are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('quick_links')
    .insert({ label: label.trim(), url: url.trim(), sort_order, is_active })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

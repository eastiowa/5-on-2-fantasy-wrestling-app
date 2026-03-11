import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/seasons — list all seasons ordered by year desc
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/seasons — create a new season
// Body: { year: number, label: string, set_current?: boolean }
export async function POST(req: Request) {
  const supabase = await createClient()

  // Auth check — commissioner only
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
  const { year, label, set_current = false } = body

  if (!year || !label) {
    return NextResponse.json({ error: 'year and label are required' }, { status: 400 })
  }

  if (typeof year !== 'number' || year < 2020) {
    return NextResponse.json({ error: 'year must be a number >= 2020' }, { status: 400 })
  }

  // If set_current, clear existing current flag first
  if (set_current) {
    await supabase
      .from('seasons')
      .update({ is_current: false })
      .eq('is_current', true)
  }

  const { data, error } = await supabase
    .from('seasons')
    .insert({ year, label, status: 'setup', is_current: set_current })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A season for year ${year} already exists` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

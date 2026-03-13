import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/draft/flags
 * Returns all athlete flags for the current user.
 * Response: [{ athlete_id: string, flag: 'stud'|'ok'|'pud' }]
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('athlete_flags')
    .select('athlete_id, flag')
    .eq('user_id', user.id)

  if (error) {
    console.error('[draft/flags GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

/**
 * POST /api/draft/flags
 * Upsert or remove an athlete flag for the current user.
 * Body: { athlete_id: string, flag: 'stud'|'ok'|'pud'|null }
 *   flag = null  → removes the flag
 *   flag = value → upserts the flag
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { athlete_id, flag } = body

  if (!athlete_id) {
    return NextResponse.json({ error: 'athlete_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (!flag) {
    // Remove flag
    const { error } = await admin
      .from('athlete_flags')
      .delete()
      .eq('user_id', user.id)
      .eq('athlete_id', athlete_id)

    if (error) {
      console.error('[draft/flags DELETE]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, removed: true })
  }

  // Validate flag value
  if (!['stud', 'ok', 'pud'].includes(flag)) {
    return NextResponse.json({ error: 'flag must be stud, ok, or pud' }, { status: 400 })
  }

  // Upsert flag
  const { error } = await admin
    .from('athlete_flags')
    .upsert(
      { user_id: user.id, athlete_id, flag },
      { onConflict: 'user_id,athlete_id' }
    )

  if (error) {
    console.error('[draft/flags UPSERT]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, athlete_id, flag })
}

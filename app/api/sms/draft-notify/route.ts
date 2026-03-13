import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'

/**
 * POST /api/sms/draft-notify
 *
 * Sends a "you're on the clock" SMS to the manager of the team
 * whose turn it currently is in the draft.
 *
 * Called internally by POST /api/draft/pick after each pick is recorded.
 * Body: { next_team_id: string, pick_number: number }
 *
 * The manager must have:
 *   profiles.phone     — E.164 phone number
 *   profiles.sms_opt_in = true
 *
 * Only looks at the manager whose team owns the NEXT pick.
 * Silently no-ops if credentials are missing or the manager hasn't opted in.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // Lightweight auth — must be a signed-in commissioner or the pick route
  // calling this internally (we accept any authenticated caller)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { next_team_id, pick_number } = body

  if (!next_team_id || !pick_number) {
    return NextResponse.json(
      { error: 'next_team_id and pick_number are required' },
      { status: 400 }
    )
  }

  // Look up the team's manager with SMS details
  const admin = createAdminClient()
  const { data: team } = await admin
    .from('teams')
    .select('id, name, manager_id')
    .eq('id', next_team_id)
    .single()

  if (!team?.manager_id) {
    // No manager assigned — silently skip
    return NextResponse.json({ success: true, skipped: 'no_manager' })
  }

  const { data: manager } = await admin
    .from('profiles')
    .select('display_name, phone, sms_opt_in')
    .eq('id', team.manager_id)
    .single()

  if (!manager?.phone || !manager.sms_opt_in) {
    return NextResponse.json({ success: true, skipped: 'no_phone_or_not_opted_in' })
  }

  const name = manager.display_name ?? 'Manager'
  const message =
    `🤼 ${name}, you're on the clock! ` +
    `It's ${team.name}'s pick #${pick_number} in the 5 on 2 Fantasy Wrestling Draft. ` +
    `https://5on2fantasywrestling.com/draft`

  const result = await sendSms(manager.phone, message)

  if (!result.success) {
    console.error('[sms/draft-notify] Failed to send SMS:', result.error)
    // Don't fail the request — draft still succeeded
    return NextResponse.json({ success: false, error: result.error })
  }

  return NextResponse.json({ success: true, sid: result.sid })
}

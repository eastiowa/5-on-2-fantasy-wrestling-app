import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/invite-token/[token]/use
 *
 * Called by the join page after the user has successfully signed up.
 * Requires the user to be authenticated (session from their just-completed signUp).
 *
 * Body: { display_name: string }
 *
 * This route:
 *   1. Re-validates the token (still unused + not expired)
 *   2. Updates the user's profile  (role, team_id, display_name)
 *   3. Sets teams.manager_id to the new user
 *   4. Marks the token as used
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // User must be authenticated (they just signed up)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized — please sign up first' }, { status: 401 })

  const { display_name } = await req.json()

  const admin = createAdminClient()

  // Re-validate token
  const { data: invite } = await admin
    .from('invite_tokens')
    .select('id, team_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'Invite link not found.' }, { status: 404 })
  }
  if (invite.used_at) {
    return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 409 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite link has expired.' }, { status: 410 })
  }

  const { team_id } = invite

  // Upsert profile — assign team + role + display name
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email ?? '',
      role: 'team_manager',
      team_id,
      display_name: display_name?.trim() || null,
    }, { onConflict: 'id' })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // Assign team manager
  const { error: teamError } = await admin
    .from('teams')
    .update({ manager_id: user.id })
    .eq('id', team_id)

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 })
  }

  // Mark token as consumed
  await admin
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString(), used_by_email: user.email })
    .eq('token', token)

  return NextResponse.json({ success: true })
}

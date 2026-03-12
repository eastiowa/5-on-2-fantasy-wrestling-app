import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/users
// Returns all profiles joined with their team name.
// Accessible by any authenticated user.
// Also returns is_bootstrap = true when zero commissioners exist
// (so the UI can show the first-time "Claim Commissioner" prompt).

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use the explicit FK name to disambiguate the two profiles↔teams relationships
  // (profiles.team_id → teams  vs  teams.manager_id → profiles)
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, team_id, team:teams!profiles_team_id_fkey(name)')
    .order('role', { ascending: true })   // commissioners first
    .order('email', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const commissionerCount = (users ?? []).filter((u) => u.role === 'commissioner').length

  return NextResponse.json({
    users,
    current_user_id: user.id,
    is_bootstrap: commissionerCount === 0,
  })
}

// POST /api/users
// Commissioner creates a new user via Supabase invite.
// Body: { email, display_name?, team_id?, send_email?: boolean }
//   send_email = true  → sends an invite email (default)
//   send_email = false → returns a one-time invite link, no email sent
// On success: { success, message, link? }

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { email, display_name, team_id, send_email = true } = body

  if (!email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Build redirect URL — prefer an explicit production URL, fall back to request origin
  const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const isLocalEnvUrl = !envUrl || /localhost|127\.0\.0\.1/.test(envUrl)
  const appUrl = isLocalEnvUrl ? requestOrigin : envUrl

  const redirectTo = `${appUrl}/invite/accept`
  const userData: Record<string, unknown> = { role: 'team_manager' }
  if (team_id) userData.team_id = team_id

  // Helper — upsert profile after Supabase creates/returns the auth user
  async function upsertProfile(userId: string) {
    const row: Record<string, unknown> = { id: userId, email: email.trim(), role: 'team_manager' }
    if (display_name?.trim()) row.display_name = display_name.trim()
    if (team_id) row.team_id = team_id
    await admin.from('profiles').upsert(row, { onConflict: 'id' })
    if (team_id) await admin.from('teams').update({ manager_id: userId }).eq('id', team_id)
  }

  // ── Send invite email ────────────────────────────────────────────────────────
  if (send_email) {
    let { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email.trim(),
      { redirectTo, data: userData }
    )

    // Retry without redirectTo if Supabase rejects the URL (not whitelisted)
    if (inviteError && /redirect/i.test(inviteError.message)) {
      const retry = await admin.auth.admin.inviteUserByEmail(email.trim(), { data: userData })
      inviteData = retry.data
      inviteError = retry.error
    }

    if (inviteError) {
      console.error('[POST /api/users] inviteUserByEmail error:', inviteError.message)

      // If email delivery failed (rate limit, SMTP, etc.) try to fall back to a link
      const isEmailDeliveryFailure = /rate.?limit|too many|sending|smtp|mail|email/i.test(inviteError.message)
      if (isEmailDeliveryFailure) {
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: 'invite',
          email: email.trim(),
          options: { redirectTo, data: userData },
        })
        const actionLink = linkData?.properties?.action_link
        if (actionLink) {
          const userId = linkData?.user?.id
          if (userId) await upsertProfile(userId)
          return NextResponse.json({
            success: true,
            email_failed: true,
            link: actionLink,
            message: `Email sending failed (${inviteError.message}). Share this link instead:`,
          })
        }
      }

      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    const invitedUserId = inviteData?.user?.id
    if (invitedUserId) await upsertProfile(invitedUserId)

    return NextResponse.json({ success: true, message: `Invite email sent to ${email.trim()}` })
  }

  // ── Generate link only (no email) ───────────────────────────────────────────
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: email.trim(),
    options: { redirectTo, data: userData },
  })

  // Retry without redirectTo if URL not whitelisted
  if (linkError && /redirect/i.test(linkError.message)) {
    const retry = await admin.auth.admin.generateLink({
      type: 'invite',
      email: email.trim(),
      options: { data: userData },
    })
    linkData = retry.data
    linkError = retry.error
  }

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  const actionLink = linkData?.properties?.action_link
  if (!actionLink) {
    return NextResponse.json(
      { error: 'Supabase did not return an invite link. The account may already exist — try "Send Email" instead.' },
      { status: 500 }
    )
  }

  const invitedUserId = linkData?.user?.id
  if (invitedUserId) await upsertProfile(invitedUserId)

  return NextResponse.json({
    success: true,
    link: actionLink,
    message: `Invite link generated for ${email.trim()}`,
  })
}

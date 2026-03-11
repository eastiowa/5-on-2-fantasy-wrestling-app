import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, team_id, generate_link_only = false } = await req.json()

  if (!email?.trim() || !team_id) {
    return NextResponse.json({ error: 'email and team_id are required' }, { status: 400 })
  }

  // Verify the team exists
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', team_id)
    .single()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const admin = createAdminClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/invite/callback`
  const userData = { team_id, role: 'team_manager' }

  // ── Generate link without sending email ────────────────────────────────────
  if (generate_link_only) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: email.trim(),
      options: { redirectTo, data: userData },
    })

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const invitedUserId = linkData.user?.id
    if (invitedUserId) {
      await admin.from('profiles').upsert({
        id: invitedUserId,
        email: email.trim(),
        role: 'team_manager',
        team_id,
      }, { onConflict: 'id' })

      await admin.from('teams').update({ manager_id: invitedUserId }).eq('id', team_id)
    }

    return NextResponse.json({
      success: true,
      link: linkData.properties?.action_link,
      message: `Invite link generated for "${team.name}"`,
    })
  }

  // ── Send invite email ──────────────────────────────────────────────────────
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email.trim(),
    { redirectTo, data: userData }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const invitedUserId = inviteData.user?.id
  if (invitedUserId) {
    await admin.from('profiles').upsert({
      id: invitedUserId,
      email: email.trim(),
      role: 'team_manager',
      team_id,
    }, { onConflict: 'id' })

    await admin.from('teams').update({ manager_id: invitedUserId }).eq('id', team_id)
  }

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${email} for team "${team.name}"`,
  })
}

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ token: string }> }

/**
 * GET /api/invite-token/[token]
 * Public — validate a token and return team info for the join page.
 * Uses the admin client to bypass RLS (no user auth required).
 */
export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: invite } = await admin
    .from('invite_tokens')
    .select('team_id, expires_at, used_at, team:teams(name)')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ valid: false, reason: 'Invite link not found.' })
  }
  if (invite.used_at) {
    return NextResponse.json({ valid: false, reason: 'This invite link has already been used.' })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'This invite link has expired.' })
  }

  return NextResponse.json({
    valid: true,
    team_id: invite.team_id,
    team_name: (invite.team as unknown as { name: string } | null)?.name ?? 'Unknown Team',
    expires_at: invite.expires_at,
  })
}

/**
 * POST /api/invite-token/[token]/use  — handled in /[token]/use/route.ts
 *
 * DELETE /api/invite-token/[token]
 * Commissioner revokes (deletes) an unused token.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { token } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('invite_tokens')
    .delete()
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

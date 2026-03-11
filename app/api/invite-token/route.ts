import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/invite-token
 * Commissioner creates a shareable invite token for a team.
 * No manager email required — the manager supplies their own email
 * when they open the /join/[token] page.
 *
 * Body:  { team_id: string }
 * Returns: { token, url, expires_at, team_name }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { team_id } = await req.json()
  if (!team_id) return NextResponse.json({ error: 'team_id is required' }, { status: 400 })

  // Verify team exists
  const { data: team } = await supabase
    .from('teams').select('id, name').eq('id', team_id).single()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const admin = createAdminClient()

  // Insert — Supabase generates the token via DEFAULT encode(gen_random_bytes(32),'hex')
  const { data: invite, error } = await admin
    .from('invite_tokens')
    .insert({ team_id, created_by: user.id })
    .select('token, expires_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`

  return NextResponse.json({
    token: invite.token,
    url: `${appUrl}/join/${invite.token}`,
    expires_at: invite.expires_at,
    team_name: team.name,
  }, { status: 201 })
}

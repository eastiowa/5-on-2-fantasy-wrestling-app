import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, team_id } = await req.json()
  if (!email?.trim() || !team_id) {
    return NextResponse.json({ error: 'email and team_id are required' }, { status: 400 })
  }

  // Verify the team exists
  const { data: team } = await supabase.from('teams').select('id, name').eq('id', team_id).single()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Use Supabase Admin API to send an invite email
  // The service role key is required for this
  const supabaseAdmin = createAdminClient()
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email.trim(),
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/invite/callback`,
      data: { team_id, role: 'team_manager' },
    }
  )

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  // Create or update the profile with team assignment
  // (will be finalized when user accepts invite)
  const invitedUserId = inviteData.user?.id
  if (invitedUserId) {
    await supabaseAdmin.from('profiles').upsert({
      id: invitedUserId,
      email: email.trim(),
      role: 'team_manager',
      team_id,
    }, { onConflict: 'id' })

    // Link team to manager
    await supabaseAdmin.from('teams').update({ manager_id: invitedUserId }).eq('id', team_id)
  }

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${email} for team "${team.name}"`,
  })
}

function createAdminClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

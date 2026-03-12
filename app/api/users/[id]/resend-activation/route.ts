import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// POST /api/users/[id]/resend-activation
// Resends the confirmation / activation email for a user who hasn't verified yet.
// Commissioner-only.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: targetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  // Look up the target user's email
  const admin = createAdminClient()
  const { data: targetUser, error: lookupErr } = await admin.auth.admin.getUserById(targetId)
  if (lookupErr || !targetUser?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const email = targetUser.user.email
  if (!email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 400 })
  }

  // Resend the signup / invite confirmation email
  const { error: resendErr } = await admin.auth.resend({
    type: 'signup',
    email,
  })

  if (resendErr) {
    return NextResponse.json(
      { error: `Failed to resend activation: ${resendErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, email })
}

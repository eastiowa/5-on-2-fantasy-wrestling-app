import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// POST /api/users/[id]/resend-activation
// Resends the confirmation / activation email for a user who hasn't verified yet.
// Commissioner-only.
//
// Response shape:
//   { success: true, email, already_confirmed: false, message_id: string | null }
//   { success: true, email, already_confirmed: true }   ← user is already confirmed
//   { error: string }  on failure

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

  // Look up the target user's full auth record so we know their email and
  // whether their email is already confirmed.
  const admin = createAdminClient()
  const { data: targetData, error: lookupErr } = await admin.auth.admin.getUserById(targetId)
  if (lookupErr || !targetData?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const authUser = targetData.user
  const email = authUser.email
  if (!email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 400 })
  }

  // If the user already has a confirmed email, tell the caller rather than
  // sending a pointless (and confusing) email.
  const alreadyConfirmed = !!authUser.email_confirmed_at
  if (alreadyConfirmed) {
    return NextResponse.json({
      success: true,
      email,
      already_confirmed: true,
    })
  }

  // Resend the signup confirmation email via the admin client.
  // The response includes `messageId` which is non-null when the email
  // provider actually queued the message.
  const { data: resendData, error: resendErr } = await admin.auth.resend({
    type: 'signup',
    email,
  })

  if (resendErr) {
    return NextResponse.json(
      { error: `Failed to resend activation: ${resendErr.message}` },
      { status: 500 }
    )
  }

  // `messageId` is present when the underlying email provider queued the send.
  // A null messageId usually means Supabase's built-in SMTP is disabled or
  // the provider silently dropped it.
  const messageId = (resendData as { messageId?: string | null })?.messageId ?? null

  return NextResponse.json({
    success: true,
    email,
    already_confirmed: false,
    message_id: messageId,
    // Convenience flag: true = provider confirmed the send
    email_queued: !!messageId,
  })
}

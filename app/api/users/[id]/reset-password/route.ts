import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/users/[id]/reset-password
// Commissioner triggers a password-reset email for any user.
// Uses the project's configured email provider (same as self-service reset).
//
// Response: { success: true, email, message }  |  { error: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: targetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  // Fetch the target user's email from Auth
  const admin = createAdminClient()
  const { data: targetData, error: lookupErr } = await admin.auth.admin.getUserById(targetId)
  if (lookupErr || !targetData?.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const email = targetData.user.email

  // Build redirect URL — use request origin in production (same logic as invite routes)
  const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const isLocalEnvUrl = !envUrl || /localhost|127\.0\.0\.1/.test(envUrl)
  const appUrl = isLocalEnvUrl ? requestOrigin : envUrl
  const redirectTo = `${appUrl}/auth/reset-password`

  // Trigger the password reset email via Supabase
  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (resetErr) {
    return NextResponse.json(
      { error: `Failed to send reset email: ${resetErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    email,
    message: `Password reset email sent to ${email}`,
  })
}

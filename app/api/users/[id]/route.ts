import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// PATCH /api/users/[id]
// Body: { role: 'commissioner' | 'team_manager' }
//
// Authorization rules:
//   • If ZERO commissioners exist (bootstrap mode): any authenticated user may
//     promote themselves (only themselves) to commissioner.
//   • Otherwise: only an existing commissioner may change any user's role.
//
// Safety: prevents the last commissioner from demoting themselves.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: targetId } = await params

  // ── Auth ────────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body once ─────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const { role } = body

  if (!['commissioner', 'team_manager'].includes(role)) {
    return NextResponse.json(
      { error: 'role must be "commissioner" or "team_manager"' },
      { status: 400 }
    )
  }

  // ── Caller profile + commissioner count ─────────────────────────────────────
  const [{ data: callerProfile }, { count: commissionerCount }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'commissioner'),
  ])

  const isCommissioner = callerProfile?.role === 'commissioner'
  const isBootstrap = (commissionerCount ?? 0) === 0

  // ── Authorization ───────────────────────────────────────────────────────────
  if (!isCommissioner) {
    if (!isBootstrap) {
      return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
    }
    // Bootstrap: only self-promotion to commissioner is allowed
    if (targetId !== user.id) {
      return NextResponse.json(
        { error: 'In bootstrap mode you can only promote yourself' },
        { status: 403 }
      )
    }
    if (role !== 'commissioner') {
      return NextResponse.json(
        { error: 'Bootstrap mode only allows promoting to commissioner' },
        { status: 400 }
      )
    }
  }

  // ── Safety: last-commissioner guard ────────────────────────────────────────
  if (role === 'team_manager' && targetId === user.id && (commissionerCount ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'Cannot demote yourself — you are the last commissioner' },
      { status: 409 }
    )
  }

  // ── Apply change (use admin client to bypass RLS) ───────────────────────────
  // The session client can't update other users' profiles due to the RLS policy
  // "Users can update their own profile". The admin client (service role key)
  // bypasses RLS — authorization is already enforced above.
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('profiles')
    .update({ role })
    .eq('id', targetId)
    .select('id, email, display_name, role')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

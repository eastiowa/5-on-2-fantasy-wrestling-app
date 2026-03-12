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
  const { role, team_id, display_name, email } = body

  const hasRole = role !== undefined
  const hasTeamId = team_id !== undefined
  const hasDisplayName = display_name !== undefined
  const hasEmail = email !== undefined

  if (!hasRole && !hasTeamId && !hasDisplayName && !hasEmail) {
    return NextResponse.json(
      { error: 'Provide at least one of: role, team_id, display_name, email' },
      { status: 400 }
    )
  }

  if (hasRole && !['commissioner', 'team_manager'].includes(role)) {
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
  const admin = createAdminClient()

  // ── Update Supabase Auth email (requires admin) ───────────────────────────
  if (hasEmail && email?.trim()) {
    const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
      email: email.trim(),
    })
    if (authErr) {
      return NextResponse.json({ error: `Email update failed: ${authErr.message}` }, { status: 500 })
    }
  }

  // ── Build profile update payload ──────────────────────────────────────────
  const profileUpdate: Record<string, unknown> = {}
  if (hasRole) profileUpdate.role = role
  if (hasTeamId) profileUpdate.team_id = team_id ?? null
  if (hasDisplayName) profileUpdate.display_name = display_name?.trim() || null
  if (hasEmail && email?.trim()) profileUpdate.email = email.trim()

  const { data, error } = await admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', targetId)
    .select('id, email, display_name, role, team_id')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Sync teams.manager_id ──────────────────────────────────────────────────
  if (hasTeamId) {
    await admin.from('teams').update({ manager_id: null }).eq('manager_id', targetId)
    if (team_id) {
      await admin.from('teams').update({ manager_id: targetId }).eq('id', team_id)
    }
  }

  return NextResponse.json(data)
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/teams/[id]/claim
 * Commissioner self-assigns as the manager of a team.
 * - Sets teams.manager_id = commissioner's user id
 * - Sets profiles.team_id = team id for the commissioner
 * - Clears manager_id on any previously claimed team
 *
 * DELETE /api/teams/[id]/claim
 * Commissioner releases their team assignment.
 */

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // If commissioner already manages a different team, release it first
  if (profile.team_id && profile.team_id !== teamId) {
    await supabase
      .from('teams')
      .update({ manager_id: null })
      .eq('id', profile.team_id)
  }

  // Assign commissioner as manager of the target team
  const { error: teamErr } = await supabase
    .from('teams')
    .update({ manager_id: user.id })
    .eq('id', teamId)

  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 })

  // Update commissioner profile's team_id
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ team_id: teamId })
    .eq('id', user.id)

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Remove commissioner from the team
  const { error: teamErr } = await supabase
    .from('teams')
    .update({ manager_id: null })
    .eq('id', teamId)

  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 })

  // Clear commissioner's team_id
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ team_id: null })
    .eq('id', user.id)

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

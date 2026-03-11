import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/users
// Returns all profiles joined with their team name.
// Accessible by any authenticated user.
// Also returns is_bootstrap = true when zero commissioners exist
// (so the UI can show the first-time "Claim Commissioner" prompt).

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use the explicit FK name to disambiguate the two profiles↔teams relationships
  // (profiles.team_id → teams  vs  teams.manager_id → profiles)
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, team_id, team:teams!profiles_team_id_fkey(name)')
    .order('role', { ascending: true })   // commissioners first
    .order('email', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const commissionerCount = (users ?? []).filter((u) => u.role === 'commissioner').length

  return NextResponse.json({
    users,
    current_user_id: user.id,
    is_bootstrap: commissionerCount === 0,
  })
}

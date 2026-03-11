import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamsManager } from '@/components/commissioner/TeamsManager'

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  const { data: teams } = await supabase
    .from('teams')
    .select('*, manager:profiles(id, display_name, email)')
    .order('draft_position', { ascending: true, nullsFirst: false })

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Manage Teams</h1>
        <p className="text-gray-400 mt-1">
          Create up to 10 teams, assign managers, and set the snake draft order.
        </p>
      </div>
      <TeamsManager initialTeams={(teams ?? []) as any} />
    </div>
  )
}

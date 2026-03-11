import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DraftControlPanel } from '@/components/commissioner/DraftControlPanel'

export default async function CommissionerDraftPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  const [{ data: settings }, { data: teams }, { data: picks }] = await Promise.all([
    supabase.from('draft_settings').select('*').single(),
    supabase.from('teams').select('*, manager:profiles(display_name, email)').order('draft_position', { ascending: true }),
    supabase.from('draft_picks').select('*, team:teams(name), athlete:athletes(name, weight, seed, school)').order('pick_number'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Draft Control</h1>
        <p className="text-gray-400 mt-1">Start, pause, or override the live snake draft.</p>
      </div>
      <DraftControlPanel
        initialSettings={settings as any}
        teams={(teams ?? []) as any}
        picks={(picks ?? []) as any}
      />
    </div>
  )
}

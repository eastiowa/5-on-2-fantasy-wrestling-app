import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DraftControlPanel } from '@/components/commissioner/DraftControlPanel'
import { ClipboardList } from 'lucide-react'

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
      <div className="flex items-center gap-3">
        <ClipboardList className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Draft Control</h1>

        </div>
      </div>
      <DraftControlPanel
        initialSettings={settings as any}
        teams={(teams ?? []) as any}
        picks={(picks ?? []) as any}
      />
    </div>
  )
}

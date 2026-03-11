import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamsManager } from '@/components/commissioner/TeamsManager'
import { Users } from 'lucide-react'

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Manage Teams</h1>

        </div>
      </div>
      <TeamsManager commissionerId={user.id} />
    </div>
  )
}

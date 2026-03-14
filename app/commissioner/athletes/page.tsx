import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AthleteUploadForm } from '@/components/commissioner/AthleteUploadForm'
import { DeleteAthleteButton } from '@/components/commissioner/DeleteAthleteButton'
import { Upload, Users, CalendarDays } from 'lucide-react'
import Link from 'next/link'

export default async function AthletesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  // Fetch current season
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id, label, status')
    .eq('is_current', true)
    .maybeSingle()

  // Fetch athletes scoped to current season
  const { data: athletes } = currentSeason
    ? await supabase
        .from('athletes')
        .select('*')
        .eq('season_id', currentSeason.id)
        .order('weight', { ascending: true })
        .order('seed', { ascending: true })
    : { data: [] }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Upload className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Manage Athletes</h1>
        </div>
      </div>

      {/* Current season context */}
      {currentSeason ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl text-sm">
          <CalendarDays className="w-4 h-4 text-yellow-400 shrink-0" />
          <span className="text-yellow-400 font-medium">{currentSeason.label}</span>
          <span className="text-gray-400">— athletes uploaded here will be assigned to this season</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-950/50 border border-yellow-600/40 rounded-xl text-sm">
          <CalendarDays className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-yellow-300 flex-1">
            No active season set. Athletes cannot be uploaded without a current season.
          </span>
          <Link
            href="/commissioner/seasons"
            className="shrink-0 px-3 py-1 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-xs rounded-lg transition-colors"
          >
            Set Season →
          </Link>
        </div>
      )}

      {/* Upload form — only when a season is active */}
      {currentSeason && <AthleteUploadForm />}

      {/* CSV format reference */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
        <h3 className="font-semibold text-white mb-3">Required CSV Format</h3>
        <div className="bg-gray-950 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
          <div className="text-yellow-400">name,weight,school,seed</div>
          <div>{`"John Smith",125,"Iowa",1`}</div>
          <div>{`"Mike Jones",133,"Penn State",3`}</div>
          <div>{`"Alex Brown",141,"Ohio State",7`}</div>
        </div>
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <p>• <strong className="text-gray-400">weight</strong>: must be one of 125, 133, 141, 149, 157, 165, 174, 184, 197, 285</p>
          <p>• <strong className="text-gray-400">seed</strong>: national seed number (positive integer)</p>
          <p>• Multiple athletes per weight class are allowed (managers pick one per weight)</p>
        </div>
      </div>

      {/* Current athletes table */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-orange-600/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-yellow-400" />
            <h2 className="font-semibold text-white">
              {currentSeason ? `${currentSeason.label} Athletes` : 'Athletes'}
            </h2>
          </div>
          <span className="text-sm text-gray-500">{athletes?.length ?? 0} total</span>
        </div>

        {!athletes || athletes.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            {currentSeason
              ? 'No athletes uploaded for this season yet. Use the form above to add athletes.'
              : 'Set a current season to view and upload athletes.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Name</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Weight</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">School</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Seed</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Flo Ranking</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left px-6 py-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {athletes.map((athlete) => (
                  <tr key={athlete.id} className="hover:bg-gray-800/30">
                    <td className="px-6 py-3 font-medium text-white">{athlete.name}</td>
                    <td className="px-6 py-3 text-gray-300">
                      <span className="bg-gray-800 text-yellow-400 text-xs font-bold px-2 py-1 rounded-full">
                        {athlete.weight}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">{athlete.school}</td>
                    <td className="px-6 py-3 text-gray-300">#{athlete.seed}</td>
                    <td className="px-6 py-3">
                      {athlete.flo_ranking != null ? (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                          #{athlete.flo_ranking}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {athlete.is_drafted ? (
                        <span className="text-xs bg-blue-950 text-blue-400 border border-blue-800 px-2 py-1 rounded-full">
                          Drafted
                        </span>
                      ) : (
                        <span className="text-xs bg-green-950 text-green-400 border border-green-800 px-2 py-1 rounded-full">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {!athlete.is_drafted && (
                        <DeleteAthleteButton athleteId={athlete.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}



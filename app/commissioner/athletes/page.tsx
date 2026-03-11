import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AthleteUploadForm } from '@/components/commissioner/AthleteUploadForm'
import { Upload, Users } from 'lucide-react'

export default async function AthletesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') redirect('/dashboard')

  const { data: athletes } = await supabase
    .from('athletes')
    .select('*')
    .order('weight', { ascending: true })
    .order('seed', { ascending: true })

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Upload className="w-6 h-6 text-yellow-400" />
          Manage Athletes
        </h1>
        <p className="text-gray-400 mt-1">
          Upload a CSV file to populate the athlete pool. Existing athletes will be preserved unless deleted.
        </p>
      </div>

      {/* Upload form */}
      <AthleteUploadForm />

      {/* CSV format reference */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-yellow-400" />
            <h2 className="font-semibold text-white">Current Athletes</h2>
          </div>
          <span className="text-sm text-gray-500">{athletes?.length ?? 0} total</span>
        </div>

        {!athletes || athletes.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No athletes uploaded yet. Use the form above to add athletes.
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

// Small inline client component for delete
function DeleteAthleteButton({ athleteId }: { athleteId: string }) {
  return (
    <form action={`/api/athletes/${athleteId}`} method="POST">
      <input type="hidden" name="_method" value="DELETE" />
      <button
        type="submit"
        className="text-xs text-red-400 hover:text-red-300 transition-colors"
        onClick={async (e) => {
          e.preventDefault()
          if (!confirm('Remove this athlete?')) return
          const res = await fetch(`/api/athletes/${athleteId}`, { method: 'DELETE' })
          if (res.ok) window.location.reload()
        }}
      >
        Remove
      </button>
    </form>
  )
}

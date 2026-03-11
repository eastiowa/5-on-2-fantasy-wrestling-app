import { createClient } from '@/lib/supabase/server'
import { Trophy, CalendarDays, Medal } from 'lucide-react'

export const revalidate = 60 // revalidate every minute

export default async function PastSeasonsPage() {
  const supabase = await createClient()

  // Fetch all completed seasons ordered by year desc
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year, label, status')
    .eq('status', 'complete')
    .order('year', { ascending: false })

  // Fetch team_seasons for all completed seasons, joined with team name
  const seasonIds = (seasons ?? []).map((s) => s.id)

  const { data: standings } = seasonIds.length
    ? await supabase
        .from('team_seasons')
        .select('season_id, final_placement, total_points, team:teams(id, name)')
        .in('season_id', seasonIds)
        .not('final_placement', 'is', null)
        .order('final_placement', { ascending: true })
    : { data: [] }

  type StandingRow = NonNullable<typeof standings>[number]

  // Group standings by season_id
  const bySeasonId = (standings ?? []).reduce<Record<string, StandingRow[]>>((acc, row) => {
    if (!acc[row.season_id]) acc[row.season_id] = []
    acc[row.season_id]!.push(row)
    return acc
  }, {})

  const placementColor = (p: number | null) => {
    if (p === 1) return 'text-yellow-400'
    if (p === 2) return 'text-gray-300'
    if (p === 3) return 'text-orange-400'
    return 'text-gray-500'
  }

  const placementBg = (p: number | null) => {
    if (p === 1) return 'bg-yellow-400/10 border-yellow-400/30'
    if (p === 2) return 'bg-gray-700/30 border-gray-600/30'
    if (p === 3) return 'bg-orange-400/10 border-orange-400/20'
    return 'bg-gray-900 border-orange-600/20'
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="w-8 h-8 text-yellow-400 shrink-0" />
        <h1 className="text-3xl font-bold text-white">Past Seasons</h1>
      </div>

      {!seasons || seasons.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No completed seasons yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {seasons.map((season) => {
            const rows = (bySeasonId[season.id] ?? []).sort(
              (a, b) => (a.final_placement ?? 99) - (b.final_placement ?? 99)
            )

            return (
              <div key={season.id} className="bg-gray-900 border border-orange-600/20 rounded-xl overflow-hidden">
                {/* Season header */}
                <div className="px-6 py-4 border-b border-orange-600/20 flex items-center gap-3">
                  <CalendarDays className="w-5 h-5 text-yellow-400 shrink-0" />
                  <h2 className="text-xl font-bold text-white">{season.label}</h2>
                  <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-blue-950 border border-blue-800 text-blue-300 font-semibold">
                    Complete
                  </span>
                </div>

                {/* Standings */}
                {rows.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">
                    Final standings not recorded for this season.
                  </div>
                ) : (
                  <div className="divide-y divide-orange-600/10">
                    {rows.map((ts) => {
                      const teamName = (ts.team as { name?: string } | null)?.name ?? 'Unknown Team'
                      const p = ts.final_placement

                      return (
                        <div
                          key={`${ts.season_id}-${ts.final_placement}`}
                          className={`flex items-center gap-4 px-6 py-4 border-l-4 ${placementBg(p)}`}
                        >
                          {/* Placement */}
                          <div className={`w-10 text-center shrink-0`}>
                            {p === 1 ? (
                              <Medal className="w-6 h-6 text-yellow-400 mx-auto" />
                            ) : p === 2 ? (
                              <Medal className="w-6 h-6 text-gray-300 mx-auto" />
                            ) : p === 3 ? (
                              <Medal className="w-6 h-6 text-orange-400 mx-auto" />
                            ) : (
                              <span className={`text-lg font-bold ${placementColor(p)}`}>
                                #{p}
                              </span>
                            )}
                          </div>

                          {/* Team name */}
                          <div className="flex-1">
                            <span className={`font-semibold ${p && p <= 3 ? 'text-white' : 'text-gray-300'}`}>
                              {teamName}
                            </span>
                            {p === 1 && (
                              <span className="ml-2 text-xs text-yellow-400 font-medium">🏆 Champion</span>
                            )}
                          </div>

                          {/* Points */}
                          <div className="text-right shrink-0">
                            <span className={`text-lg font-bold ${placementColor(p)}`}>
                              {Number(ts.total_points).toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-500 ml-1">pts</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

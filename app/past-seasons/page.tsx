import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Trophy, CalendarDays, Medal, ChevronDown } from 'lucide-react'

export const revalidate = 60

export default async function PastSeasonsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all completed seasons ordered by year desc
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year, label, status')
    .eq('status', 'complete')
    .order('year', { ascending: false })

  const seasonIds = (seasons ?? []).map((s) => s.id)

  // Fetch all standings for completed seasons
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

  // ── Top 3 Finishes by Team — aggregate across all seasons ─────────────────
  type MedalTally = { teamId: string; teamName: string; gold: number; silver: number; bronze: number }
  const medalMap = new Map<string, MedalTally>()

  for (const row of standings ?? []) {
    const p = row.final_placement
    if (!p || p > 3) continue
    const teamId = (row.team as { id?: string } | null)?.id ?? ''
    const teamName = (row.team as { name?: string } | null)?.name ?? 'Unknown Team'
    if (!teamId) continue

    if (!medalMap.has(teamId)) {
      medalMap.set(teamId, { teamId, teamName, gold: 0, silver: 0, bronze: 0 })
    }
    const t = medalMap.get(teamId)!
    if (p === 1) t.gold++
    else if (p === 2) t.silver++
    else if (p === 3) t.bronze++
  }

  // Sort: gold desc → silver desc → bronze desc
  const medalTally = Array.from(medalMap.values()).sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
  )

  // ── Helpers ────────────────────────────────────────────────────────────────
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
    return 'bg-gray-900 border-orange-600/10'
  }

  const MedalIcon = ({ placement }: { placement: number }) => {
    if (placement === 1) return <Medal className="w-5 h-5 text-yellow-400 mx-auto" />
    if (placement === 2) return <Medal className="w-5 h-5 text-gray-300 mx-auto" />
    if (placement === 3) return <Medal className="w-5 h-5 text-orange-400 mx-auto" />
    return <span className={`text-base font-bold ${placementColor(placement)}`}>#{placement}</span>
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="w-8 h-8 text-yellow-400 shrink-0" />
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Past Seasons</h1>
      </div>

      {!seasons || seasons.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No completed seasons yet.</p>
        </div>
      ) : (
        <>
          {/* ── All-Time Medal Tally ─────────────────────────────────────────── */}
          {medalTally.length > 0 && (
            <div className="bg-gray-900 border border-yellow-400/20 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-yellow-400/10 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
                <h2 className="text-lg font-bold text-white">All-Time Top 3 Finishes</h2>
                <span className="ml-auto text-xs text-gray-500">{seasons.length} season{seasons.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="divide-y divide-gray-800">
                {medalTally.map((t, idx) => (
                  <div key={t.teamId} className="flex items-center gap-4 px-6 py-3.5">
                    {/* Overall rank */}
                    <span className={`w-6 text-center text-sm font-bold shrink-0 ${
                      idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-600'
                    }`}>
                      #{idx + 1}
                    </span>

                    {/* Team name */}
                    <span className="flex-1 font-semibold text-white text-sm">{t.teamName}</span>

                    {/* Medal counts */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">🥇</span>
                        <span className={`font-bold ${t.gold > 0 ? 'text-yellow-400' : 'text-gray-700'}`}>{t.gold}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">🥈</span>
                        <span className={`font-bold ${t.silver > 0 ? 'text-gray-300' : 'text-gray-700'}`}>{t.silver}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">🥉</span>
                        <span className={`font-bold ${t.bronze > 0 ? 'text-orange-400' : 'text-gray-700'}`}>{t.bronze}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Season cards ─────────────────────────────────────────────────── */}
          <div className="space-y-6">
            {seasons.map((season) => {
              const rows = (bySeasonId[season.id] ?? []).sort(
                (a, b) => (a.final_placement ?? 99) - (b.final_placement ?? 99)
              )
              const top4 = rows.slice(0, 4)
              const rest = rows.slice(4)

              const PlacementRow = ({ ts }: { ts: StandingRow }) => {
                const teamName = (ts.team as { name?: string } | null)?.name ?? 'Unknown Team'
                const p = ts.final_placement
                return (
                  <div className={`flex items-center gap-4 px-6 py-3.5 border-l-4 ${placementBg(p)}`}>
                    <div className="w-8 text-center shrink-0">
                      <MedalIcon placement={p ?? 99} />
                    </div>
                    <div className="flex-1">
                      <span className={`font-semibold ${p && p <= 3 ? 'text-white' : 'text-gray-300'}`}>
                        {teamName}
                      </span>
                      {p === 1 && <span className="ml-2 text-xs text-yellow-400 font-medium">🏆 Champion</span>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-base font-bold ${placementColor(p)}`}>
                        {Number(ts.total_points).toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">pts</span>
                    </div>
                  </div>
                )
              }

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

                  {rows.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-500 text-sm">
                      Final standings not recorded for this season.
                    </div>
                  ) : (
                    <div className="divide-y divide-orange-600/10">
                      {/* Always show top 4 */}
                      {top4.map((ts) => (
                        <PlacementRow
                          key={`${ts.season_id}-${ts.final_placement}`}
                          ts={ts}
                        />
                      ))}

                      {/* Expand for remaining rows */}
                      {rest.length > 0 && (
                        <details className="group">
                          <summary className="flex items-center gap-2 px-6 py-3 cursor-pointer select-none text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors list-none">
                            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                            Show {rest.length} more
                          </summary>
                          <div className="divide-y divide-orange-600/10">
                            {rest.map((ts) => (
                              <PlacementRow
                                key={`${ts.season_id}-${ts.final_placement}`}
                                ts={ts}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WEIGHT_CLASSES } from '@/types'
import { TrendingUp, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n * 100).toFixed(1) + '%'
}

/** Color-grade expected points (rough scale for NCAA wrestling) */
function epColor(pts: number): string {
  if (pts >= 16) return 'text-green-400'
  if (pts >= 10) return 'text-yellow-400'
  if (pts >= 5)  return 'text-orange-400'
  return 'text-gray-400'
}

/** Color-grade top-8 probability */
function top8Color(p: number): string {
  if (p >= 0.7) return 'text-green-400'
  if (p >= 0.45) return 'text-yellow-400'
  if (p >= 0.2) return 'text-orange-400'
  return 'text-gray-500'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProjectionsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Current season
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle()

  // Fetch all model rows for this season, joined to athletes for name/school
  const { data: rawRows } = currentSeason
    ? await (supabase as any)
        .from('athlete_model_data')
        .select(`
          athlete_id, csv_name, csv_school, weight, seed, salary,
          mc_expected_points, mc_top8,
          mc_p1, mc_p2, mc_p3, mc_p4, mc_p5, mc_p6, mc_p7, mc_p8,
          anchored_score_if_place_1, anchored_score_if_place_2,
          anchored_score_if_place_3, anchored_score_if_place_4,
          anchored_score_if_place_5, anchored_score_if_place_6,
          anchored_score_if_place_7, anchored_score_if_place_8,
          anchored_expected_points,
          ws_elo, win_rate, bonus_rate, model_score,
          athlete:athletes(name, school)
        `)
        .eq('season_id', currentSeason.id)
        .not('athlete_id', 'is', null)
        .order('weight', { ascending: true })
        .order('mc_expected_points', { ascending: false })
    : { data: null }

  type ModelRow = {
    athlete_id: string
    csv_name: string
    csv_school: string | null
    weight: number
    seed: number | null
    salary: number | null
    mc_expected_points: number | null
    mc_top8: number | null
    mc_p1: number | null
    mc_p2: number | null
    mc_p3: number | null
    mc_p4: number | null
    mc_p5: number | null
    mc_p6: number | null
    mc_p7: number | null
    mc_p8: number | null
    anchored_score_if_place_1: number | null
    anchored_score_if_place_2: number | null
    anchored_score_if_place_3: number | null
    anchored_score_if_place_4: number | null
    anchored_score_if_place_5: number | null
    anchored_score_if_place_6: number | null
    anchored_score_if_place_7: number | null
    anchored_score_if_place_8: number | null
    anchored_expected_points: number | null
    ws_elo: number | null
    win_rate: number | null
    bonus_rate: number | null
    model_score: number | null
    athlete: { name: string; school: string } | null
  }

  const rows: ModelRow[] = (rawRows ?? []) as ModelRow[]

  // Group by weight class
  const byWeight = new Map<number, ModelRow[]>()
  for (const r of rows) {
    const w = r.weight
    if (!byWeight.has(w)) byWeight.set(w, [])
    byWeight.get(w)!.push(r)
  }

  const hasData = rows.length > 0
  const hasAnchored = rows.some(r => r.anchored_score_if_place_1 != null)

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <TrendingUp className="w-9 h-9 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <h1 className="text-3xl font-bold text-white">Wrestler Projections</h1>
          {currentSeason && (
            <p className="text-sm text-gray-400 mt-1">{currentSeason.label} · Monte Carlo model — 100k simulations</p>
          )}
        </div>
      </div>

      {!currentSeason && (
        <div className="text-center py-16 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No active season found.</p>
        </div>
      )}

      {currentSeason && !hasData && (
        <div className="text-center py-16 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No projection data uploaded yet.</p>
          <p className="text-sm mt-2">
            Ask your commissioner to upload the model CSV via the Scores page.
          </p>
        </div>
      )}

      {hasData && WEIGHT_CLASSES.map((wt) => {
        const weightRows = byWeight.get(wt)
        if (!weightRows?.length) return null

        return (
          <section key={wt} className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
            {/* Weight class header */}
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-800/60 border-b border-gray-800">
              <span className="text-lg font-bold text-yellow-400">{wt} lbs</span>
              <span className="text-xs text-gray-500">{weightRows.length} wrestlers</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Seed</th>
                    <th className="text-left px-4 py-2.5 font-medium">Wrestler</th>
                    <th className="text-left px-4 py-2.5 font-medium">School</th>
                    <th className="text-right px-4 py-2.5 font-medium">Proj Pts</th>
                    <th className="text-right px-4 py-2.5 font-medium">Top-8%</th>
                    <th className="text-right px-4 py-2.5 font-medium">Champ%</th>
                    {hasAnchored && (
                      <>
                        <th className="text-right px-3 py-2.5 font-medium">1st</th>
                        <th className="text-right px-3 py-2.5 font-medium">2nd</th>
                        <th className="text-right px-3 py-2.5 font-medium">3rd</th>
                        <th className="text-right px-3 py-2.5 font-medium">4th</th>
                        <th className="text-right px-3 py-2.5 font-medium">5th</th>
                        <th className="text-right px-3 py-2.5 font-medium">6th</th>
                        <th className="text-right px-3 py-2.5 font-medium">7th</th>
                        <th className="text-right px-3 py-2.5 font-medium">8th</th>
                      </>
                    )}
                    {!hasAnchored && (
                      <>
                        <th className="text-right px-3 py-2.5 font-medium">P(1st)</th>
                        <th className="text-right px-3 py-2.5 font-medium">P(2nd)</th>
                        <th className="text-right px-3 py-2.5 font-medium">P(3rd)</th>
                        <th className="text-right px-3 py-2.5 font-medium">P(4th)</th>
                        <th className="text-right px-3 py-2.5 font-medium">P(5-8)</th>
                      </>
                    )}

                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {weightRows.map((r, idx) => {
                    const displayName = r.athlete?.name ?? r.csv_name
                    const displaySchool = r.athlete?.school ?? r.csv_school ?? '—'
                    const ep = r.mc_expected_points ?? 0
                    const top8 = r.mc_top8 ?? 0
                    const p1 = r.mc_p1 ?? 0

                    return (
                      <tr
                        key={r.athlete_id}
                        className={cn(
                          'hover:bg-gray-800/40 transition-colors',
                          idx === 0 ? 'bg-yellow-950/10' : ''
                        )}
                      >
                        {/* Seed */}
                        <td className="px-4 py-2.5 text-center">
                          <span className={cn(
                            'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
                            (r.seed ?? 99) <= 4
                              ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40'
                              : (r.seed ?? 99) <= 8
                              ? 'bg-orange-400/10 text-orange-300 border border-orange-400/20'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                          )}>
                            {r.seed ?? '—'}
                          </span>
                        </td>

                        {/* Name */}
                        <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">
                          {displayName}
                        </td>

                        {/* School */}
                        <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                          {displaySchool}
                        </td>

                        {/* Expected points */}
                        <td className={cn('px-4 py-2.5 text-right font-bold tabular-nums', epColor(ep))}>
                          {fmt(ep)}
                        </td>

                        {/* Top-8 % */}
                        <td className={cn('px-4 py-2.5 text-right tabular-nums', top8Color(top8))}>
                          {pct(top8)}
                        </td>

                        {/* Champ % */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                          {pct(p1)}
                        </td>

                        {/* Anchored scenario scores or placement probabilities */}
                        {hasAnchored ? (
                          <>
                            {([
                              r.anchored_score_if_place_1,
                              r.anchored_score_if_place_2,
                              r.anchored_score_if_place_3,
                              r.anchored_score_if_place_4,
                              r.anchored_score_if_place_5,
                              r.anchored_score_if_place_6,
                              r.anchored_score_if_place_7,
                              r.anchored_score_if_place_8,
                            ] as (number | null)[]).map((v, i) => (
                              <td key={i} className="px-3 py-2.5 text-right tabular-nums text-gray-400 text-xs">
                                {fmt(v)}
                              </td>
                            ))}
                          </>
                        ) : (
                          <>
                            {([r.mc_p1, r.mc_p2, r.mc_p3, r.mc_p4] as (number | null)[]).map((v, i) => (
                              <td key={i} className="px-3 py-2.5 text-right tabular-nums text-gray-400 text-xs">
                                {pct(v)}
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-400 text-xs">
                              {pct(
                                (r.mc_p5 ?? 0) + (r.mc_p6 ?? 0) + (r.mc_p7 ?? 0) + (r.mc_p8 ?? 0)
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend bar */}
            <div className="px-5 py-2.5 border-t border-gray-800 flex flex-wrap gap-4 text-[10px] text-gray-600">
              <span><span className="text-green-400 font-bold">Green</span> = ≥16 proj pts</span>
              <span><span className="text-yellow-400 font-bold">Yellow</span> = 10–15 pts</span>
              <span><span className="text-orange-400 font-bold">Orange</span> = 5–9 pts</span>
              {hasAnchored && (
                <span className="ml-auto text-gray-600">
                  Scenario columns = fantasy pts if wrestler finishes at that place
                </span>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

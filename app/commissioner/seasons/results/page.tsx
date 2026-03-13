'use client'

import { useState, useEffect } from 'react'
import { History, Loader2, CheckCircle, AlertCircle, Trophy, Upload } from 'lucide-react'
import Link from 'next/link'

interface Season {
  id: string
  year: number
  label: string
  status: string
}

interface PlacementPreview {
  rank: number
  team: string
  points: number
}

export default function HistoricalResultsPage() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [csvText, setCsvText] = useState('')
  const [markComplete, setMarkComplete] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ placements: PlacementPreview[]; not_found: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/seasons')
      .then((r) => r.json())
      .then((data: Season[]) => {
        if (Array.isArray(data)) setSeasons(data)
      })
      .catch(() => {})
  }, [])

  /**
   * Parse the raw CSV/text into rows.
   * Accepts formats:
   *   team_name, total_points
   *   team_name: total_points
   *   team_name  total_points   (tab-separated)
   */
  function parseRows(): { team_name: string; total_points: number }[] | null {
    const lines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith('team'))

    const rows: { team_name: string; total_points: number }[] = []

    for (const line of lines) {
      // Split on comma, colon, or tab
      const parts = line.split(/[,:\t]+/).map((p) => p.trim())
      if (parts.length < 2) continue

      const pts = Number(parts[parts.length - 1])
      if (isNaN(pts)) continue

      const name = parts.slice(0, parts.length - 1).join(' ')
      if (!name) continue

      rows.push({ team_name: name, total_points: pts })
    }

    return rows.length > 0 ? rows : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!selectedSeasonId) {
      setError('Select a season first.')
      return
    }

    const rows = parseRows()
    if (!rows) {
      setError('Could not parse any rows. Use format: "Team Name, Points" — one per line.')
      return
    }

    setLoading(true)
    const res = await fetch(`/api/seasons/${selectedSeasonId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, mark_complete: markComplete }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to save results')
    } else {
      setResult(data)
    }
  }

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId)

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <History className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Upload Historical Results</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Import past-season final standings when you only have team names and scores.
          </p>
        </div>
      </div>

      {/* Success */}
      {result && (
        <div className="bg-green-950 border border-green-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <CheckCircle className="w-5 h-5" />
            Results saved — {result.placements.length} teams recorded
            {markComplete && (
              <span className="text-xs font-normal text-green-600 ml-1">· Season marked complete</span>
            )}
          </div>

          {/* Preview table */}
          <div className="divide-y divide-green-900">
            {result.placements.map((p) => (
              <div key={p.rank} className="flex items-center gap-3 py-2">
                <span className={`w-8 text-center text-sm font-bold shrink-0 ${
                  p.rank === 1 ? 'text-yellow-400' :
                  p.rank === 2 ? 'text-gray-300' :
                  p.rank === 3 ? 'text-orange-400' : 'text-gray-500'
                }`}>#{p.rank}</span>
                <span className="flex-1 text-sm text-white">{p.team}</span>
                <span className="text-sm font-semibold text-yellow-400">{p.points.toFixed(1)} pts</span>
              </div>
            ))}
          </div>

          {result.not_found.length > 0 && (
            <div className="text-sm text-yellow-400">
              ⚠️ Teams not matched: {result.not_found.join(', ')}
            </div>
          )}

          <Link
            href="/past-seasons"
            className="inline-flex items-center gap-1.5 text-sm text-green-300 hover:text-green-200 underline"
          >
            <Trophy className="w-3.5 h-3.5" />
            View Past Seasons →
          </Link>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Season selector */}
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-3">
          <label className="block text-sm font-semibold text-white">Season</label>
          <p className="text-xs text-gray-500">
            Select the season these results belong to. Create the season first in{' '}
            <Link href="/commissioner/seasons" className="text-yellow-400 hover:underline">
              Season Management
            </Link>{' '}
            if it doesn&apos;t exist yet.
          </p>
          <select
            value={selectedSeasonId}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            required
          >
            <option value="">— Select a season —</option>
            {[...seasons].sort((a, b) => b.year - a.year).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.status})
              </option>
            ))}
          </select>
        </div>

        {/* CSV input */}
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-3">
          <label className="block text-sm font-semibold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-yellow-400" />
            Paste Results
          </label>

          <div className="bg-gray-950 rounded-lg px-4 py-3 text-xs font-mono text-gray-400 space-y-0.5">
            <div className="text-gray-600">Format (one team per line):</div>
            <div>Team Name, Total Points</div>
            <div className="text-gray-600 mt-1">Examples:</div>
            <div>Thunder Chickens, 48.5</div>
            <div>The Grapplers, 42</div>
            <div>Mat Warriors, 35.0</div>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            placeholder={"Team Name, Points\nThunder Chickens, 48.5\nThe Grapplers, 42\n..."}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            required
          />
          <p className="text-xs text-gray-500">
            Team names are matched case-insensitively against teams already in the app.
            Placements are calculated automatically (highest points = 1st place).
          </p>
        </div>

        {/* Options */}
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setMarkComplete((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${markComplete ? 'bg-yellow-400' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${markComplete ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <div>
              <div className="text-sm font-medium text-white">Mark season as Complete</div>
              <div className="text-xs text-gray-500">
                Locks the season so it appears in Past Seasons.
                {selectedSeason && selectedSeason.status === 'complete' && (
                  <span className="text-yellow-600 ml-1">(already complete)</span>
                )}
              </div>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !selectedSeasonId || !csvText.trim()}
          className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : <><History className="w-4 h-4" />Save Historical Results</>}
        </button>
      </form>
    </div>
  )
}

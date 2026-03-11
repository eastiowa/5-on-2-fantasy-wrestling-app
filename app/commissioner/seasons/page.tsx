'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CalendarDays, Plus, CheckCircle, AlertCircle, Loader2,
  ChevronRight, Star, Trash2, Trophy, Clock
} from 'lucide-react'
import type { Season, TeamSeason } from '@/types'

// ── helpers ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Season['status'][] = ['setup', 'drafting', 'active', 'complete']

const STATUS_STYLES: Record<Season['status'], string> = {
  setup:     'bg-gray-800 text-gray-300 border-gray-700',
  drafting:  'bg-purple-950 text-purple-300 border-purple-800',
  active:    'bg-green-950 text-green-300 border-green-800',
  complete:  'bg-blue-950 text-blue-300 border-blue-800',
}

const STATUS_LABELS: Record<Season['status'], string> = {
  setup:    'Setup',
  drafting: 'Drafting',
  active:   'Active',
  complete: 'Complete',
}

function nextStatus(s: Season['status']): Season['status'] | null {
  const i = STATUS_ORDER.indexOf(s)
  return i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null
}

// ── component ────────────────────────────────────────────────────────────────

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)   // id of row being mutated
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // history panel
  const [historySeasonId, setHistorySeasonId] = useState<string | null>(null)
  const [history, setHistory] = useState<TeamSeason[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // create form
  const [showCreate, setShowCreate] = useState(false)
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear())
  const [setCurrent, setSetCurrent] = useState(true)
  const [creating, setCreating] = useState(false)

  // Auto-derive label from year (e.g. 2025 → "2024-25 Season")
  // User can still override it
  const defaultLabel = (y: number) => `${y - 1}-${String(y).slice(-2)} Season`
  const [newLabel, setNewLabel] = useState(() => defaultLabel(new Date().getFullYear()))

  // Keep label in sync when year changes, unless the user has manually edited it
  const [labelEdited, setLabelEdited] = useState(false)
  useEffect(() => {
    if (!labelEdited) setNewLabel(defaultLabel(newYear))
  }, [newYear, labelEdited])

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seasons')
      const data = await res.json()
      if (!res.ok) {
        flash('error', data.error ?? 'Failed to load seasons')
        setSeasons([])
      } else {
        setSeasons(Array.isArray(data) ? data : [])
      }
    } catch {
      flash('error', 'Network error loading seasons')
      setSeasons([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── create season ──────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const res = await fetch('/api/seasons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: newYear, label: newLabel, set_current: setCurrent }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { flash('error', data.error ?? 'Failed to create season'); return }
    flash('success', `Season "${data.label}" created`)
    setShowCreate(false)
    setLabelEdited(false)
    setNewYear(new Date().getFullYear())
    load()
  }

  // ── set as current ─────────────────────────────────────────────────────────
  async function handleSetCurrent(id: string) {
    setBusy(id)
    const res = await fetch(`/api/seasons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_current' }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { flash('error', data.error); return }
    flash('success', `"${data.label}" is now the active season`)
    load()
  }

  // ── advance status ─────────────────────────────────────────────────────────
  async function handleAdvance(id: string, status: Season['status']) {
    setBusy(id)
    const res = await fetch(`/api/seasons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_status', status }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { flash('error', data.error); return }
    flash('success', `Status updated to "${status}"`)
    load()
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return
    setBusy(id)
    const res = await fetch(`/api/seasons/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (!res.ok) {
      const d = await res.json()
      flash('error', d.error)
      return
    }
    flash('success', `"${label}" deleted`)
    load()
  }

  // ── load history ───────────────────────────────────────────────────────────
  async function loadHistory(seasonId: string) {
    if (historySeasonId === seasonId) { setHistorySeasonId(null); return }
    setHistorySeasonId(seasonId)
    setHistoryLoading(true)
    const res = await fetch(`/api/seasons/${seasonId}/standings`)
    if (res.ok) {
      const data = await res.json()
      setHistory(data)
    }
    setHistoryLoading(false)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const currentSeason = seasons.find(s => s.is_current)

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-8 h-8 text-yellow-400 shrink-0" />
          <div>
            <h1 className="text-3xl font-bold text-white">Season Management</h1>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Season
        </button>
      </div>

      {/* Toast message */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          message.type === 'success'
            ? 'bg-green-950 border-green-800 text-green-400'
            : 'bg-red-950 border-red-800 text-red-400'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Current season banner */}
      {currentSeason && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 flex items-center gap-3">
          <Star className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <span className="font-semibold text-yellow-400">{currentSeason.label}</span>
            <span className="text-gray-400 text-sm ml-2">is the current season</span>
          </div>
          <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[currentSeason.status]}`}>
            {STATUS_LABELS[currentSeason.status]}
          </span>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-900 border border-orange-600/30 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-white">Create New Season</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Year</label>
              <input
                type="number"
                min={2020}
                max={2099}
                value={newYear}
                onChange={e => setNewYear(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Label
                {labelEdited && (
                  <button
                    type="button"
                    onClick={() => { setLabelEdited(false); setNewLabel(defaultLabel(newYear)) }}
                    className="ml-2 text-xs text-yellow-400 hover:underline"
                  >
                    reset
                  </button>
                )}
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setLabelEdited(true) }}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSetCurrent(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${setCurrent ? 'bg-yellow-400' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${setCurrent ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-white">Set as current season</span>
              <p className="text-xs text-gray-500">All app activity (draft, scores, standings) will use this season</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Season
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Season list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
        </div>
      ) : seasons.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No seasons yet. Create the first one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(season => {
            const next = nextStatus(season.status)
            const isBusy = busy === season.id
            const isHistoryOpen = historySeasonId === season.id

            return (
              <div key={season.id} className="bg-gray-900 border border-orange-600/20 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="p-5 flex items-center gap-4 flex-wrap">
                  {/* Star (current) */}
                  <div className="w-6 shrink-0">
                    {season.is_current && (
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{season.label}</span>
                      <span className="text-xs text-gray-500">({season.year})</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[season.status]}`}>
                        {STATUS_LABELS[season.status]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Created {new Date(season.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Set current */}
                    {!season.is_current && (
                      <button
                        onClick={() => handleSetCurrent(season.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                        Set Current
                      </button>
                    )}

                    {/* Advance status */}
                    {next && (
                      <button
                        onClick={() => handleAdvance(season.id, next)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                        → {STATUS_LABELS[next]}
                      </button>
                    )}

                    {/* View history (completed seasons) */}
                    {season.status === 'complete' && (
                      <button
                        onClick={() => loadHistory(season.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Trophy className="w-3 h-3" />
                        {isHistoryOpen ? 'Hide' : 'History'}
                      </button>
                    )}

                    {/* Delete (setup only, non-current) */}
                    {season.status === 'setup' && !season.is_current && (
                      <button
                        onClick={() => handleDelete(season.id, season.label)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-950 text-red-400 border border-red-900/50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Historical standings panel */}
                {isHistoryOpen && (
                  <div className="border-t border-orange-600/20 bg-gray-950 px-5 py-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      Final Standings — {season.label}
                    </h3>
                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading…
                      </div>
                    ) : history.length === 0 ? (
                      <p className="text-gray-500 text-sm">No standings recorded for this season.</p>
                    ) : (
                      <div className="space-y-1">
                        {history
                          .sort((a, b) => (a.final_placement ?? 99) - (b.final_placement ?? 99))
                          .map(ts => (
                            <div key={ts.id} className="flex items-center gap-3 py-1.5">
                              <span className={`w-6 text-center text-sm font-bold shrink-0 ${
                                ts.final_placement === 1 ? 'text-yellow-400' :
                                ts.final_placement === 2 ? 'text-gray-300' :
                                ts.final_placement === 3 ? 'text-orange-400' : 'text-gray-500'
                              }`}>
                                #{ts.final_placement}
                              </span>
                              <span className="text-sm text-white flex-1">
                                {(ts.team as { name?: string })?.name ?? ts.team_id}
                              </span>
                              <span className="text-sm font-semibold text-yellow-400">
                                {ts.total_points.toFixed(1)} pts
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Season lifecycle guide */}
      <div className="bg-gray-900 border border-orange-600/10 rounded-xl p-5 text-sm text-gray-400 space-y-2">
        <p className="text-white font-semibold text-xs uppercase tracking-wider mb-3">Season Lifecycle</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUS_ORDER.map((s, i) => (
            <div key={s} className="flex flex-col gap-1">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border self-start ${STATUS_STYLES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
              <span className="text-xs text-gray-500 leading-snug">
                {s === 'setup'    && 'Configure teams, draft order, upload athletes'}
                {s === 'drafting' && 'Draft is open — teams are making picks'}
                {s === 'active'   && 'Tournament live — entering scores'}
                {s === 'complete' && 'Season archived — standings locked'}
              </span>
              {i < STATUS_ORDER.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-700 mt-1 hidden sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

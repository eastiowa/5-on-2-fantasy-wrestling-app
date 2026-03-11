'use client'

import { useState } from 'react'
import { DraftSettings, DraftPick } from '@/types'
import { buildFullDraftOrder } from '@/lib/draft-logic'
import { Play, Pause, RotateCcw, SkipForward, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraftControlPanelProps {
  initialSettings: DraftSettings
  teams: Array<{ id: string; name: string; draft_position: number | null; manager: { display_name: string | null; email: string } | null }>
  picks: Array<DraftPick & { team: { name: string }; athlete: { name: string; weight: number; seed: number; school: string } }>
}

export function DraftControlPanel({ initialSettings, teams, picks }: DraftControlPanelProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const orderedTeams = [...teams].sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
  const fullOrder = orderedTeams.length === 10 ? buildFullDraftOrder(orderedTeams as any) : []

  async function doAction(action: string) {
    if (action === 'reset' && !confirm('Reset the entire draft? This will delete ALL picks and cannot be undone.')) return
    setLoading(true)
    setMessage(null)

    const res = await fetch('/api/draft/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else {
      setMessage({ type: 'success', text: `Draft ${action} successful` })
      // Refresh settings
      const r2 = await fetch('/api/draft/state')
      if (r2.ok) setSettings(await r2.json())
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-gray-800 text-gray-400',
    active: 'bg-green-950 text-green-400 border-green-800',
    paused: 'bg-yellow-950 text-yellow-400 border-yellow-800',
    complete: 'bg-blue-950 text-blue-400 border-blue-800',
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={cn('rounded-xl border p-6 flex items-center gap-4', statusColor[settings.status] ?? statusColor.pending)}>
        <div className={cn('w-3 h-3 rounded-full shrink-0', {
          'bg-gray-500': settings.status === 'pending',
          'bg-green-400 animate-pulse': settings.status === 'active',
          'bg-yellow-400': settings.status === 'paused',
          'bg-blue-400': settings.status === 'complete',
        })} />
        <div>
          <div className="font-bold text-lg capitalize">Draft {settings.status}</div>
          {settings.status !== 'pending' && (
            <div className="text-sm opacity-75">
              {settings.status === 'complete'
                ? 'All 100 picks completed'
                : `Pick #${settings.current_pick_number} of 100`}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="ml-auto flex items-center gap-2">
          {settings.status === 'pending' && (
            <button
              onClick={() => doAction('start')}
              disabled={loading || orderedTeams.length < 10}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-600/40 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Draft
            </button>
          )}
          {settings.status === 'active' && (
            <>
              <button
                onClick={() => doAction('skip')}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
              >
                <SkipForward className="w-4 h-4" />
                Skip Pick
              </button>
              <button
                onClick={() => doAction('pause')}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                Pause
              </button>
            </>
          )}
          {settings.status === 'paused' && (
            <button
              onClick={() => doAction('resume')}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Resume
            </button>
          )}
          {settings.status !== 'pending' && (
            <button
              onClick={() => doAction('reset')}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 font-medium rounded-lg transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </div>

      {orderedTeams.length < 10 && settings.status === 'pending' && (
        <div className="p-4 bg-yellow-950 border border-yellow-800 rounded-lg text-yellow-400 text-sm">
          ⚠️ Need 10 teams before starting the draft. Currently have {orderedTeams.length}/10 teams.
        </div>
      )}

      {message && (
        <div className={cn('flex items-center gap-2 p-4 rounded-lg border text-sm', {
          'bg-green-950 border-green-800 text-green-400': message.type === 'success',
          'bg-red-950 border-red-800 text-red-400': message.type === 'error',
        })}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Draft board */}
      {picks.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-orange-600/30">
            <h3 className="font-semibold text-white">Pick History ({picks.length} picks made)</h3>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400">Pick</th>
                  <th className="text-left px-4 py-3 text-gray-400">Team</th>
                  <th className="text-left px-4 py-3 text-gray-400">Athlete</th>
                  <th className="text-left px-4 py-3 text-gray-400">Weight</th>
                  <th className="text-left px-4 py-3 text-gray-400">Seed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {picks.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-mono text-yellow-400">#{p.pick_number}</td>
                    <td className="px-4 py-3 text-white">{p.team?.name}</td>
                    <td className="px-4 py-3 text-white">{p.athlete?.name}</td>
                    <td className="px-4 py-3 text-gray-400">{p.athlete?.weight} lbs</td>
                    <td className="px-4 py-3 text-gray-400">#{p.athlete?.seed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft order preview */}
      {fullOrder.length > 0 && picks.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-orange-600/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-orange-600/30">
            <h3 className="font-semibold text-white">Draft Order Preview (100 picks)</h3>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 p-4">
              {fullOrder.slice(0, 30).map((p) => (
                <div key={p.pickNumber} className="text-center p-2 bg-gray-800 rounded text-xs">
                  <div className="text-yellow-400 font-bold">#{p.pickNumber}</div>
                  <div className="text-gray-400 truncate" title={p.teamName}>{p.teamName.split(' ')[0]}</div>
                </div>
              ))}
            </div>
            {fullOrder.length > 30 && (
              <p className="text-center text-gray-600 text-xs pb-3">…and {fullOrder.length - 30} more picks</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

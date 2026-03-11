'use client'

import { useState, useEffect } from 'react'
import { Settings, Loader2, CheckCircle, AlertCircle, Moon } from 'lucide-react'
import { formatHour, isInOvernightPause } from '@/lib/draft-logic'

interface DraftSettingsState {
  pick_timer_seconds: number
  auto_skip_on_timeout: boolean
  snake_enabled: boolean
  overnight_pause_enabled: boolean
  pause_start_hour: number   // 0-23 America/Chicago
  pause_end_hour: number     // 0-23 America/Chicago
}

const DEFAULT: DraftSettingsState = {
  pick_timer_seconds: 1800, // 30 min default
  auto_skip_on_timeout: true,
  snake_enabled: true,
  overnight_pause_enabled: false,
  pause_start_hour: 22,     // 10 PM CT
  pause_end_hour: 8,        // 8 AM CT
}

/** Converts seconds → whole minutes (rounded). */
const toMins = (s: number) => Math.round(s / 60)
/** Converts minutes → seconds. */
const toSecs = (m: number) => m * 60

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
        value ? 'bg-yellow-400' : 'bg-gray-700'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<DraftSettingsState>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  // true once migration 003 has been applied and overnight_pause columns exist
  const [hasPauseColumns, setHasPauseColumns] = useState(false)

  useEffect(() => {
    fetch('/api/draft/state')
      .then((r) => r.json())
      .then((data) => {
        if (data.pick_timer_seconds !== undefined) {
          const pauseColumnsExist = data.overnight_pause_enabled !== undefined
          setHasPauseColumns(pauseColumnsExist)
          setSettings({
            pick_timer_seconds:      data.pick_timer_seconds      ?? DEFAULT.pick_timer_seconds,
            auto_skip_on_timeout:    data.auto_skip_on_timeout    ?? DEFAULT.auto_skip_on_timeout,
            snake_enabled:           data.snake_enabled            ?? DEFAULT.snake_enabled,
            overnight_pause_enabled: pauseColumnsExist ? (data.overnight_pause_enabled ?? DEFAULT.overnight_pause_enabled) : DEFAULT.overnight_pause_enabled,
            pause_start_hour:        pauseColumnsExist ? (data.pause_start_hour        ?? DEFAULT.pause_start_hour)        : DEFAULT.pause_start_hour,
            pause_end_hour:          pauseColumnsExist ? (data.pause_end_hour          ?? DEFAULT.pause_end_hour)          : DEFAULT.pause_end_hour,
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function set<K extends keyof DraftSettingsState>(key: K, value: DraftSettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/draft/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed to save' })
    } else {
      setMessage({ type: 'success', text: 'Settings saved!' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
      </div>
    )
  }

  const timerMinutes = toMins(settings.pick_timer_seconds)

  // Live preview of overnight pause status
  const currentlyPaused = isInOvernightPause(
    settings.overnight_pause_enabled,
    settings.pause_start_hour,
    settings.pause_end_hour
  )

  const hourOptions = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-8 h-8 text-yellow-400 shrink-0" />
        <h1 className="text-3xl font-bold text-white">Draft Settings</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-px">

        {/* ── Pick Timer ────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border border-orange-600/20 rounded-t-xl p-6 space-y-4">
          <div className="text-sm font-semibold text-white">Pick Timer</div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={120}
              step={1}
              value={timerMinutes}
              onChange={(e) => set('pick_timer_seconds', toSecs(Number(e.target.value)))}
              className="flex-1 accent-yellow-400"
            />
            <div className="w-28 text-right shrink-0">
              {timerMinutes === 0 ? (
                <span className="text-xl font-bold text-gray-500">Off</span>
              ) : (
                <>
                  <span className="text-xl font-bold text-yellow-400">{timerMinutes}</span>
                  <span className="text-sm text-gray-400 ml-1">min</span>
                </>
              )}
            </div>
          </div>

          {/* Tick marks */}
          <div className="flex justify-between text-xs text-gray-600 -mt-2">
            <span>Off</span>
            <span>15 min</span>
            <span>30 min</span>
            <span>1 hr</span>
            <span>2 hr</span>
          </div>

          {/* Quick-set buttons */}
          <div className="flex gap-2 flex-wrap">
            {[0, 5, 15, 30, 60, 120].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('pick_timer_seconds', toSecs(m))}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  timerMinutes === m
                    ? 'bg-yellow-400 text-gray-900 border-yellow-400'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-yellow-400/50'
                }`}
              >
                {m === 0 ? 'Off' : m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>

          {timerMinutes === 0 && (
            <p className="text-xs text-yellow-600">⚠️ Timer disabled — picks will not auto-expire</p>
          )}
        </div>

        {/* ── Auto-skip ─────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border-x border-b border-orange-600/20 p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Auto-skip on Timeout</div>
            <div className="text-xs text-gray-500 mt-0.5">
              When the pick timer expires, automatically advance to the next team.
            </div>
          </div>
          <Toggle value={settings.auto_skip_on_timeout} onChange={(v) => set('auto_skip_on_timeout', v)} />
        </div>

        {/* ── Snake draft ───────────────────────────────────────────────── */}
        <div className="bg-gray-900 border-x border-b border-orange-600/20 p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Snake Draft</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Draft order reverses each round. If disabled, same order every round.
            </div>
          </div>
          <Toggle value={settings.snake_enabled} onChange={(v) => set('snake_enabled', v)} />
        </div>

        {/* ── Overnight Pause ───────────────────────────────────────────── */}
        <div className="bg-gray-900 border-x border-b border-orange-600/20 rounded-b-xl p-6 space-y-5">
          {/* Toggle row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">Overnight Pause</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Automatically suspend the pick timer during overnight hours (Central Time).
                </div>
              </div>
            </div>
            <Toggle
              value={hasPauseColumns ? settings.overnight_pause_enabled : false}
              onChange={(v) => hasPauseColumns && set('overnight_pause_enabled', v)}
            />
          </div>

          {/* Migration required banner */}
          {!hasPauseColumns && (
            <div className="bg-yellow-950/40 border border-yellow-700/40 rounded-lg p-3 text-xs text-yellow-300 space-y-1">
              <p className="font-semibold">Database migration required to enable overnight pause.</p>
              <p className="text-yellow-500">Run <code className="bg-gray-900 px-1 py-0.5 rounded">003_overnight_pause.sql</code> in your Supabase SQL Editor, then reload this page.</p>
            </div>
          )}

          {/* Time window controls */}
          {hasPauseColumns && settings.overnight_pause_enabled && (
            <div className="space-y-4 pl-6 border-l-2 border-blue-500/30">
              <div className="grid grid-cols-2 gap-4">
                {/* Pause start */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Pause begins (CT)
                  </label>
                  <select
                    value={settings.pause_start_hour}
                    onChange={(e) => set('pause_start_hour', Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>

                {/* Pause end */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Draft resumes (CT)
                  </label>
                  <select
                    value={settings.pause_end_hour}
                    onChange={(e) => set('pause_end_hour', Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>{formatHour(h)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary + live status */}
              <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                currentlyPaused
                  ? 'bg-blue-950 border-blue-800 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
                <Moon className="w-4 h-4 shrink-0" />
                <span>
                  Pause window: <strong className="text-white">
                    {formatHour(settings.pause_start_hour)} → {formatHour(settings.pause_end_hour)}
                  </strong> Central Time
                  {currentlyPaused
                    ? ' · 🌙 Currently in pause window'
                    : ' · Draft active right now'}
                </span>
              </div>

              {settings.pause_start_hour === settings.pause_end_hour && (
                <p className="text-xs text-yellow-600">
                  ⚠️ Start and end hour are the same — the pause window would cover the full 24 hours.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Message + Save ─────────────────────────────────────────────── */}
        <div className="pt-4 space-y-3">
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
              message.type === 'success'
                ? 'bg-green-950 border-green-800 text-green-400'
                : 'bg-red-950 border-red-800 text-red-400'
            }`}>
              {message.type === 'success'
                ? <CheckCircle className="w-4 h-4" />
                : <AlertCircle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Settings, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface DraftSettingsState {
  pick_timer_seconds: number
  auto_skip_on_timeout: boolean
  snake_enabled: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<DraftSettingsState>({
    pick_timer_seconds: 90,
    auto_skip_on_timeout: true,
    snake_enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/draft/state')
      .then((r) => r.json())
      .then((data) => {
        if (data.pick_timer_seconds !== undefined) {
          setSettings({
            pick_timer_seconds: data.pick_timer_seconds,
            auto_skip_on_timeout: data.auto_skip_on_timeout,
            snake_enabled: data.snake_enabled,
          })
        }
        setLoading(false)
      })
  }, [])

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

    if (!res.ok) setMessage({ type: 'error', text: data.error })
    else setMessage({ type: 'success', text: 'Settings saved!' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-yellow-400" />
          Draft Settings
        </h1>
        <p className="text-gray-400 mt-1">Configure draft rules. Changes take effect on the next draft start.</p>
      </div>

      <form onSubmit={handleSave} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        {/* Pick Timer */}
        <div>
          <label className="block text-sm font-semibold text-white mb-1">
            Pick Timer (seconds)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            How long each team has to make a pick. Set to 0 to disable the timer.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={300}
              step={10}
              value={settings.pick_timer_seconds}
              onChange={(e) => setSettings({ ...settings, pick_timer_seconds: Number(e.target.value) })}
              className="flex-1 accent-yellow-400"
            />
            <div className="w-20 text-center">
              <span className="text-xl font-bold text-yellow-400">{settings.pick_timer_seconds}</span>
              <span className="text-xs text-gray-500 ml-1">sec</span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>Off</span>
            <span>1 min</span>
            <span>2 min</span>
            <span>3 min</span>
            <span>5 min</span>
          </div>
          {settings.pick_timer_seconds === 0 && (
            <p className="text-xs text-yellow-600 mt-2">⚠️ Timer disabled — picks will not auto-expire</p>
          )}
        </div>

        <div className="border-t border-gray-800" />

        {/* Auto-skip */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Auto-skip on Timeout</div>
            <div className="text-xs text-gray-500 mt-0.5">
              When the pick timer expires, automatically advance to the next team.
              If disabled, the Commissioner must manually skip.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, auto_skip_on_timeout: !settings.auto_skip_on_timeout })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.auto_skip_on_timeout ? 'bg-yellow-400' : 'bg-gray-700'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.auto_skip_on_timeout ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <div className="border-t border-gray-800" />

        {/* Snake draft */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Snake Draft</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Draft order reverses each round (recommended). If disabled, same order every round.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, snake_enabled: !settings.snake_enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.snake_enabled ? 'bg-yellow-400' : 'bg-gray-700'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.snake_enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {message && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-950 border-green-800 text-green-400'
              : 'bg-red-950 border-red-800 text-red-400'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
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
      </form>
    </div>
  )
}

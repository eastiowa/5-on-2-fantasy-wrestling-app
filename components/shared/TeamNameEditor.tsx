'use client'

import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'

/**
 * Inline team-name editor.
 * Renders the team name as a heading with a pencil icon.
 * On click → switches to an input; saves via PATCH /api/teams/[teamId].
 *
 * Props:
 *   teamId      – the team's UUID
 *   initialName – the name fetched server-side (used as the starting value)
 *   className   – optional extra classes on the h1
 */
export function TeamNameEditor({
  teamId,
  initialName,
  className = 'text-2xl sm:text-3xl font-bold text-white',
}: {
  teamId: string
  initialName: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancel() {
    setEditing(false)
    setName(name) // keep whatever was last saved
    setError(null)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { cancel(); return }
    // No-op if unchanged
    if (trimmed === name && !editing) { cancel(); return }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to save team name')
    } else {
      setName(trimmed)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          className="text-2xl sm:text-3xl font-bold bg-gray-800 border border-yellow-400/60 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 w-full max-w-xs"
        />
        <button
          onClick={save}
          disabled={saving}
          title="Save team name"
          className="p-1.5 text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        </button>
        <button
          onClick={cancel}
          title="Cancel"
          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {error && <span className="text-xs text-red-400 w-full">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className={className}>{name}</h1>
      <button
        onClick={() => setEditing(true)}
        title="Rename your team"
        className="p-1.5 text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}

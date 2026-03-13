'use client'

import { useState } from 'react'
import { Pencil, Check, X, Loader2, User } from 'lucide-react'

/**
 * Inline display-name editor.
 * Shows the manager's display name with a pencil icon.
 * On click → switches to an input; saves via PATCH /api/users/[userId].
 *
 * Any authenticated user may update their own display_name.
 */
export function DisplayNameEditor({
  userId,
  initialName,
}: {
  userId: string
  initialName: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancel() {
    setEditing(false)
    setName(name)
    setError(null)
  }

  async function save() {
    const trimmed = name.trim()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: trimmed || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to save name')
    } else {
      setName(trimmed)
      setEditing(false)
    }
  }

  const displayValue = name.trim() || 'Set your name'
  const isPlaceholder = !name.trim()

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-gray-400 text-sm shrink-0">
          <User className="w-3.5 h-3.5" />
          Manager:
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          placeholder="Your display name"
          className="bg-gray-800 border border-yellow-400/60 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 w-48"
        />
        <button
          onClick={save}
          disabled={saving}
          title="Save name"
          className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button
          onClick={cancel}
          title="Cancel"
          className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {error && <p className="w-full text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Edit your display name"
      className="flex items-center gap-1.5 group text-sm text-gray-400 hover:text-gray-200 transition-colors"
    >
      <User className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">Manager:</span>
      <span className={isPlaceholder ? 'italic text-gray-600' : 'text-gray-300'}>
        {displayValue}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity ml-0.5" />
    </button>
  )
}

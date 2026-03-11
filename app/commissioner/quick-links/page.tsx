'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Link2, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  Eye, EyeOff, GripVertical, ExternalLink
} from 'lucide-react'

interface QuickLink {
  id: string
  label: string
  url: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export default function QuickLinksPage() {
  const [links, setLinks] = useState<QuickLink[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [creating, setCreating] = useState(false)

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quick-links')
      const data = await res.json()
      setLinks(Array.isArray(data) ? data : [])
    } catch {
      flash('error', 'Failed to load quick links')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const nextOrder = links.length > 0 ? Math.max(...links.map(l => l.sort_order)) + 1 : 1
    const res = await fetch('/api/quick-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel, url: newUrl, sort_order: nextOrder }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { flash('error', data.error ?? 'Failed to create'); return }
    flash('success', `"${data.label}" added`)
    setNewLabel(''); setNewUrl(''); setShowCreate(false)
    load()
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function handleToggle(link: QuickLink) {
    setBusy(link.id)
    const res = await fetch(`/api/quick-links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !link.is_active }),
    })
    setBusy(null)
    if (!res.ok) { flash('error', 'Failed to update'); return }
    load()
  }

  // ── Save inline edit ───────────────────────────────────────────────────────
  async function handleSaveEdit(id: string) {
    setBusy(id)
    const res = await fetch(`/api/quick-links/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel, url: editUrl }),
    })
    setBusy(null)
    if (!res.ok) { flash('error', 'Failed to save'); return }
    flash('success', 'Link updated')
    setEditId(null)
    load()
  }

  // ── Move (reorder) ─────────────────────────────────────────────────────────
  async function handleMove(link: QuickLink, direction: 'up' | 'down') {
    const sorted = [...links].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((l) => l.id === link.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const swap = sorted[swapIdx]
    setBusy(link.id)
    await Promise.all([
      fetch(`/api/quick-links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: swap.sort_order }),
      }),
      fetch(`/api/quick-links/${swap.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: link.sort_order }),
      }),
    ])
    setBusy(null)
    load()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"?`)) return
    setBusy(id)
    await fetch(`/api/quick-links/${id}`, { method: 'DELETE' })
    setBusy(null)
    flash('success', `"${label}" deleted`)
    load()
  }

  const sorted = [...links].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link2 className="w-8 h-8 text-yellow-400 shrink-0" />
          <h1 className="text-3xl font-bold text-white">Quick Links</h1>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Link
        </button>
      </div>

      {/* Toast */}
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

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-orange-600/30 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">New Quick Link</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Label</label>
              <input
                type="text"
                placeholder="NCAA Tournament Bracket"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">URL</label>
              <input
                type="text"
                placeholder="https://ncaa.com/brackets or /login"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg text-sm transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Links list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No quick links yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((link, idx) => (
            <div
              key={link.id}
              className={`bg-gray-900 border rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap transition-colors ${
                link.is_active ? 'border-orange-600/20' : 'border-gray-800 opacity-60'
              }`}
            >
              {/* Drag handle / order arrows */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => handleMove(link, 'up')}
                  disabled={idx === 0 || busy === link.id}
                  className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs leading-none"
                >▲</button>
                <GripVertical className="w-4 h-4 text-gray-700" />
                <button
                  onClick={() => handleMove(link, 'down')}
                  disabled={idx === sorted.length - 1 || busy === link.id}
                  className="text-gray-600 hover:text-gray-300 disabled:opacity-20 transition-colors text-xs leading-none"
                >▼</button>
              </div>

              {/* Content / inline edit */}
              {editId === link.id ? (
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-yellow-400 w-44"
                  />
                  <input
                    value={editUrl}
                    onChange={e => setEditUrl(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-yellow-400 flex-1 min-w-32"
                  />
                  <button
                    onClick={() => handleSaveEdit(link.id)}
                    disabled={busy === link.id}
                    className="px-3 py-1 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold rounded-lg text-xs transition-colors"
                  >
                    {busy === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => { setEditId(link.id); setEditLabel(link.label); setEditUrl(link.url) }}
                    className="text-sm font-medium text-white hover:text-yellow-400 transition-colors text-left"
                  >
                    {link.label}
                  </button>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <span className="truncate max-w-xs">{link.url}</span>
                    {link.url !== '#' && !link.url.startsWith('/') && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3 text-gray-600 hover:text-gray-400" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle active */}
                <button
                  onClick={() => handleToggle(link)}
                  disabled={busy === link.id}
                  title={link.is_active ? 'Hide from standings page' : 'Show on standings page'}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  {link.is_active
                    ? <Eye className="w-4 h-4 text-green-400" />
                    : <EyeOff className="w-4 h-4" />}
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(link.id, link.label)}
                  disabled={busy === link.id}
                  className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">
        Click a link label to edit it inline. Use ▲▼ to reorder. 
        The eye icon shows/hides a link on the standings page without deleting it.
      </p>
    </div>
  )
}

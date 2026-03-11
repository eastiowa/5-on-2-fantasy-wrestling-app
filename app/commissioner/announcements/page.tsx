'use client'

import { useState, useEffect } from 'react'
import { Megaphone, Plus, Trash2, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { Announcement } from '@/types'
import { formatDate } from '@/lib/utils'

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/announcements')
      .then((r) => r.json())
      .then((data) => { setAnnouncements(data ?? []); setLoading(false) })
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else {
      setMessage({ type: 'success', text: 'Announcement posted!' })
      setAnnouncements([data, ...announcements])
      setTitle('')
      setBody('')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    const res = await fetch('/api/announcements', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setAnnouncements(announcements.filter((a) => a.id !== id))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-yellow-400" />
          Announcements
        </h1>
        <p className="text-gray-400 mt-1">Post league-wide announcements visible on the home page.</p>
      </div>

      {/* Create form */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-yellow-400" />
          New Announcement
        </h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Draft starts Saturday at 7pm!"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Type your announcement here…"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
            />
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
            disabled={saving || !title.trim() || !body.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Post Announcement
          </button>
        </form>
      </div>

      {/* Existing announcements */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">Posted Announcements</h3>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">No announcements yet.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {announcements.map((a) => (
              <div key={a.id} className="px-6 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{a.title}</div>
                  <div className="text-gray-400 text-sm mt-1 leading-relaxed">{a.body}</div>
                  <div className="text-xs text-gray-600 mt-2">{formatDate(a.created_at)}</div>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

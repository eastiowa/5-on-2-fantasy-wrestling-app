'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Mail, Trash2, GripVertical, Loader2, AlertCircle, CheckCircle, User, Pencil, Check, X, RefreshCw, ShieldCheck, ShieldOff, Link2, Copy
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TeamWithManager {
  id: string
  name: string
  manager_id: string | null
  draft_position: number | null   // injected from team_seasons by the API
  created_at: string
  manager: { id: string; display_name: string | null; email: string } | null
}

function SortableTeamRow({
  team,
  index,
  onDelete,
  onInvite,
  onRename,
  commissionerId,
  onClaim,
  onRelease,
}: {
  team: TeamWithManager
  index: number
  onDelete: (id: string) => void
  onInvite: (teamId: string, teamName: string) => void
  onRename: (id: string, newName: string) => Promise<void>
  commissionerId: string
  onClaim: (id: string) => Promise<void>
  onRelease: (id: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id })

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(team.name)
  const [saving, setSaving] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const isOwnedByCommissioner = team.manager?.id === commissionerId

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  async function commitRename() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === team.name) {
      setEditing(false)
      setEditName(team.name)
      return
    }
    setSaving(true)
    await onRename(team.id, trimmed)
    setSaving(false)
    setEditing(false)
  }

  function cancelEdit() {
    setEditing(false)
    setEditName(team.name)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg border border-orange-600/20"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Position */}
      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-yellow-400 shrink-0">
        {index + 1}
      </div>

      {/* Team info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') cancelEdit()
              }}
              className="flex-1 px-2 py-1 bg-gray-700 border border-yellow-400/60 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
            />
            <button
              onClick={commitRename}
              disabled={saving}
              className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
              title="Save"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={cancelEdit}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <div className="font-semibold text-white">{team.name}</div>
            <button
              onClick={() => { setEditName(team.name); setEditing(true) }}
              className="p-0.5 text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-all"
              title="Rename team"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <User className="w-3 h-3" />
          {team.manager
            ? (team.manager.display_name ?? team.manager.email)
            : <span className="text-yellow-600">No manager assigned</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Commissioner claim / release */}
        {isOwnedByCommissioner ? (
          <button
            disabled={claiming}
            onClick={async () => {
              setClaiming(true)
              await onRelease(team.id)
              setClaiming(false)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-yellow-950 text-yellow-400 border border-yellow-800 rounded-lg hover:bg-yellow-900 transition-colors disabled:opacity-50"
            title="Release — stop managing this team"
          >
            {claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
            My Team
          </button>
        ) : (
          <button
            disabled={claiming}
            onClick={async () => {
              setClaiming(true)
              await onClaim(team.id)
              setClaiming(false)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-yellow-400 transition-colors disabled:opacity-50"
            title="Claim this team as your own"
          >
            {claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Claim
          </button>
        )}

        <button
          onClick={() => onInvite(team.id, team.name)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-950 text-blue-400 border border-blue-800 rounded-lg hover:bg-blue-900 transition-colors"
        >
          <Mail className="w-3 h-3" />
          {team.manager && !isOwnedByCommissioner ? 'Re-invite' : 'Invite Manager'}
        </button>
        <button
          onClick={() => onDelete(team.id)}
          className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
          title="Delete team"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function TeamsManager({ commissionerId }: { commissionerId: string }) {
  const [teams, setTeams] = useState<TeamWithManager[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteTeamName, setInviteTeamName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/teams')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFetchError(data.error ?? `Failed to load teams (${res.status})`)
      } else {
        const data: TeamWithManager[] = await res.json()
        setTeams(data)
      }
    } catch (err) {
      setFetchError('Network error — could not load teams.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = teams.findIndex((t) => t.id === active.id)
    const newIndex = teams.findIndex((t) => t.id === over.id)
    setTeams(arrayMove(teams, oldIndex, newIndex))
  }

  async function handleCreate() {
    if (!newTeamName.trim() || teams.length >= 10) return
    setCreating(true)
    setMessage(null)

    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeamName.trim() }),
    })
    const data = await res.json()
    setCreating(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else {
      setTeams([...teams, { ...data, manager: null }])
      setNewTeamName('')
    }
  }

  async function handleSaveOrder() {
    setSaving(true)
    setMessage(null)

    const order = teams.map((t, i) => ({ id: t.id, draft_position: i + 1 }))
    const res = await fetch('/api/teams', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })

    setSaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'Draft order saved!' })
    } else {
      const data = await res.json()
      setMessage({ type: 'error', text: data.error })
    }
  }

  async function handleDelete(teamId: string) {
    if (!confirm('Delete this team? This cannot be undone.')) return
    const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
    if (res.ok) {
      setTeams(teams.filter((t) => t.id !== teamId))
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to delete team.' })
    }
  }

  async function handleClaim(teamId: string) {
    const res = await fetch(`/api/teams/${teamId}/claim`, { method: 'POST' })
    if (res.ok) {
      // Refresh so manager info reflects the commissioner
      await fetchTeams()
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to claim team.' })
    }
  }

  async function handleRelease(teamId: string) {
    const res = await fetch(`/api/teams/${teamId}/claim`, { method: 'DELETE' })
    if (res.ok) {
      await fetchTeams()
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to release team.' })
    }
  }

  async function handleRename(teamId: string, newName: string) {
    const res = await fetch(`/api/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (res.ok) {
      setTeams(teams.map((t) => t.id === teamId ? { ...t, name: newName } : t))
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to rename team.' })
    }
  }

  function openInvite(teamId: string, teamName: string) {
    setInviteTeamId(teamId)
    setInviteTeamName(teamName)
    setInviteEmail('')
    setGeneratedLink(null)
    setLinkCopied(false)
    setMessage(null)
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteTeamId) return
    setInviting(true)
    setMessage(null)

    const res = await fetch('/api/teams/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), team_id: inviteTeamId }),
    })
    const data = await res.json()
    setInviting(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else {
      setMessage({ type: 'success', text: data.message })
      setInviteTeamId(null)
      setInviteEmail('')
    }
  }

  async function handleGetLink() {
    if (!inviteEmail.trim() || !inviteTeamId) return
    setGeneratingLink(true)
    setGeneratedLink(null)
    setMessage(null)

    const res = await fetch('/api/teams/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        team_id: inviteTeamId,
        generate_link_only: true,
      }),
    })
    const data = await res.json()
    setGeneratingLink(false)

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error })
    } else if (data.link) {
      setGeneratedLink(data.link)
    } else {
      setMessage({ type: 'error', text: 'No link returned from server' })
    }
  }

  function copyLink() {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2500)
    })
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mr-2" />
        <span className="text-gray-400">Loading teams…</span>
      </div>
    )
  }

  // Fetch error state
  if (fetchError) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-red-300 font-semibold">Failed to load teams</p>
          <p className="text-red-400 text-sm mt-1">{fetchError}</p>
        </div>
        <button
          onClick={fetchTeams}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg transition-colors shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg border text-sm ${
          message.type === 'success'
            ? 'bg-green-950 border-green-800 text-green-400'
            : 'bg-red-950 border-red-800 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Create team */}
      {teams.length < 10 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-3">Add Team</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Team name (e.g. Team Hawk)"
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTeamName.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">{teams.length}/10 teams created</p>
        </div>
      )}

      {/* Invite modal */}
      {inviteTeamId && (
        <div className="bg-gray-900 rounded-xl border border-yellow-400/30 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold text-white">
              Invite Manager — <span className="text-yellow-400">{inviteTeamName}</span>
            </h3>
            <button
              onClick={() => { setInviteTeamId(null); setGeneratedLink(null) }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Email input + action buttons */}
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setGeneratedLink(null) }}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="manager@example.com"
              className="flex-1 min-w-48 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || generatingLink || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-semibold rounded-lg transition-colors text-sm"
              title="Send an invite email directly to the manager"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Email
            </button>
            <button
              onClick={handleGetLink}
              disabled={inviting || generatingLink || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/40 text-white font-semibold rounded-lg transition-colors text-sm"
              title="Generate a link you can share manually (no email sent)"
            >
              {generatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Get Link
            </button>
          </div>

          <p className="text-xs text-gray-500">
            <strong className="text-gray-400">Send Email</strong> — Supabase sends the invite directly. &nbsp;
            <strong className="text-gray-400">Get Link</strong> — Generates a link you can share via text, Slack, etc.
          </p>

          {/* Generated link display */}
          {generatedLink && (
            <div className="space-y-2">
              <p className="text-xs text-green-400 font-medium">✓ Invite link generated — share this with the manager:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-green-800 rounded-lg text-xs text-gray-300 focus:outline-none select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={copyLink}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    linkCopied
                      ? 'bg-green-700 text-green-200'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-yellow-600">⚠️ This link expires after one use and is valid for 24 hours.</p>
            </div>
          )}
        </div>
      )}

      {/* Teams list with drag-and-drop */}
      {teams.length > 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              Teams <span className="text-gray-500 font-normal text-sm">({teams.length}/10)</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchTeams}
                className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg"
                title="Refresh teams"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleSaveOrder}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Save Order
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">Drag teams to set the snake draft order (position 1 picks first). Hover a team name to rename it.</p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={teams.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {teams.map((team, i) => (
                  <SortableTeamRow
                    key={team.id}
                    team={team}
                    index={i}
                    onDelete={handleDelete}
                    onInvite={openInvite}
                    onRename={handleRename}
                    commissionerId={commissionerId}
                    onClaim={handleClaim}
                    onRelease={handleRelease}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center">
          <p className="text-gray-500 text-sm">No teams yet. Add your first team above.</p>
        </div>
      )}
    </div>
  )
}

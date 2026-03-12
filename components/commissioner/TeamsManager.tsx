'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Loader2, AlertCircle, CheckCircle, User,
  Pencil, Check, X, RefreshCw, ShieldCheck, ShieldOff,
  ListOrdered, UserCheck, UserX, ExternalLink, UserPlus,
} from 'lucide-react'

interface TeamWithManager {
  id: string
  name: string
  manager_id: string | null
  draft_position: number | null
  created_at: string
  manager: { id: string; display_name: string | null; email: string } | null
}

interface UserOption {
  id: string
  email: string
  display_name: string | null
  team_id: string | null
}

// ── TeamRow ──────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  users,
  onDelete,
  onRename,
  commissionerId,
  onClaim,
  onRelease,
  onAssignUser,
}: {
  team: TeamWithManager
  users: UserOption[]
  onDelete: (id: string) => void
  onRename: (id: string, newName: string) => Promise<void>
  commissionerId: string
  onClaim: (id: string) => Promise<void>
  onRelease: (id: string) => Promise<void>
  onAssignUser: (teamId: string, userId: string | null) => Promise<void>
}) {
  const [claiming, setClaiming] = useState(false)
  const isOwnedByCommissioner = team.manager?.id === commissionerId

  // ── Inline rename state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(team.name)
  const [saving, setSaving] = useState(false)

  // Keep local state in sync if parent reloads
  useEffect(() => {
    if (!editing) setEditName(team.name)
  }, [team.name, editing])

  async function commitRename() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === team.name) { setEditing(false); setEditName(team.name); return }
    setSaving(true)
    await onRename(team.id, trimmed)
    setSaving(false)
    setEditing(false)
  }

  // ── Assign user panel state ──────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Reset selection when panel opens
  function openAssign() {
    setSelectedUserId(team.manager_id ?? '')
    setAssignOpen(true)
  }

  async function handleSaveAssignment() {
    setAssigning(true)
    // If same as current, just close
    if (selectedUserId === (team.manager_id ?? '')) {
      setAssigning(false)
      setAssignOpen(false)
      return
    }
    await onAssignUser(team.id, selectedUserId || null)
    setAssigning(false)
    setAssignOpen(false)
  }

  async function handleRemoveAssignment() {
    setAssigning(true)
    await onAssignUser(team.id, null)
    setAssigning(false)
    setAssignOpen(false)
  }

  // Build user options for the dropdown
  // Show all users; mark ones already assigned to a different team
  const userOptions = users.map((u) => ({
    ...u,
    label: u.display_name ? `${u.display_name} (${u.email})` : u.email,
    takenByOther: u.team_id !== null && u.team_id !== team.id,
  }))

  return (
    <div className="bg-gray-800/50 rounded-lg border border-orange-600/20 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Draft position badge */}
        <div
          className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-yellow-400 shrink-0"
          title={team.draft_position ? `Draft position ${team.draft_position}` : 'No draft position set'}
        >
          {team.draft_position ?? '—'}
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
                  if (e.key === 'Escape') { setEditing(false); setEditName(team.name) }
                }}
                className="flex-1 px-2 py-1 bg-gray-700 border border-yellow-400/60 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
              <button onClick={commitRename} disabled={saving} className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => { setEditing(false); setEditName(team.name) }} className="p-1 text-gray-500 hover:text-gray-300">
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
          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {team.manager
                ? (team.manager.display_name ?? team.manager.email)
                : <span className="text-yellow-600">No manager assigned</span>}
            </span>
            {/* Registration status badge */}
            {team.manager && !isOwnedByCommissioner ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-950 border border-green-700 text-green-400">
                <UserCheck className="w-2.5 h-2.5" />
                Registered
              </span>
            ) : !team.manager ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 border border-gray-700 text-gray-500">
                <UserX className="w-2.5 h-2.5" />
                Not Assigned
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Assign user */}
          <button
            onClick={() => assignOpen ? setAssignOpen(false) : openAssign()}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
              assignOpen
                ? 'bg-orange-950 text-orange-300 border-orange-800'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
            }`}
            title="Assign a user to manage this team"
          >
            <UserPlus className="w-3 h-3" />
            Assign User
          </button>

          {/* Commissioner claim / release */}
          {isOwnedByCommissioner ? (
            <button
              disabled={claiming}
              onClick={async () => { setClaiming(true); await onRelease(team.id); setClaiming(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-yellow-950 text-yellow-400 border border-yellow-800 rounded-lg hover:bg-yellow-900 transition-colors disabled:opacity-50"
            >
              {claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldOff className="w-3 h-3" />}
              My Team
            </button>
          ) : (
            <button
              disabled={claiming}
              onClick={async () => { setClaiming(true); await onClaim(team.id); setClaiming(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-yellow-400 transition-colors disabled:opacity-50"
            >
              {claiming ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              Claim
            </button>
          )}

          <button
            onClick={() => onDelete(team.id)}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
            title="Delete team"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Assign user panel */}
      {assignOpen && (
        <div className="border-t border-orange-600/20 bg-gray-900/60 px-5 py-4 space-y-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Assign Manager</p>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={assigning}
              className="flex-1 max-w-sm px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-400 disabled:opacity-50"
            >
              <option value="">— No manager —</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}{u.takenByOther ? ' ⚠ assigned to another team' : ''}
                </option>
              ))}
            </select>

            <button
              onClick={handleSaveAssignment}
              disabled={assigning}
              className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg text-sm transition-colors"
            >
              {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>

            {team.manager_id && (
              <button
                onClick={handleRemoveAssignment}
                disabled={assigning}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 border border-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            )}

            <button
              onClick={() => setAssignOpen(false)}
              className="px-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>

          {users.length === 0 && (
            <p className="text-xs text-yellow-600">
              No registered users yet.{' '}
              <a href="/commissioner/users" className="underline hover:text-yellow-400">
                Go to User Management
              </a>{' '}
              to create accounts first.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── TeamsManager ─────────────────────────────────────────────────────────────

export function TeamsManager({ commissionerId }: { commissionerId: string }) {
  const [teams, setTeams] = useState<TeamWithManager[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [teamsRes, usersRes] = await Promise.all([
        fetch('/api/teams'),
        fetch('/api/users'),
      ])

      if (!teamsRes.ok) {
        const data = await teamsRes.json().catch(() => ({}))
        setFetchError(data.error ?? `Failed to load teams (${teamsRes.status})`)
      } else {
        setTeams(await teamsRes.json())
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json()
        const userList: UserOption[] = Array.isArray(usersData.users) ? usersData.users : []
        setUsers(userList)
      }
    } catch {
      setFetchError('Network error — could not load data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
    if (res.ok) { await fetchAll() }
    else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to claim team.' })
    }
  }

  async function handleRelease(teamId: string) {
    const res = await fetch(`/api/teams/${teamId}/claim`, { method: 'DELETE' })
    if (res.ok) { await fetchAll() }
    else {
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

  // Assign or remove a user from a team via PATCH /api/users/[userId]
  async function handleAssignUser(teamId: string, userId: string | null) {
    if (userId) {
      // Assign this user to the team (clears any previous team they had)
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Manager assigned successfully.' })
        await fetchAll()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error ?? 'Failed to assign manager.' })
      }
    } else {
      // Remove — find who currently manages this team and clear their team_id
      const team = teams.find((t) => t.id === teamId)
      if (!team?.manager_id) return
      const res = await fetch(`/api/users/${team.manager_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: null }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Manager removed from team.' })
        await fetchAll()
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error ?? 'Failed to remove manager.' })
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mr-2" />
        <span className="text-gray-400">Loading teams…</span>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-red-300 font-semibold">Failed to load teams</p>
          <p className="text-red-400 text-sm mt-1">{fetchError}</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg transition-colors shrink-0">
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

      {/* Users page callout */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-950/40 rounded-lg border border-blue-700/30 text-xs text-blue-300">
        <User className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
        <span>
          To create or invite user accounts, go to{' '}
          <a href="/commissioner/users" className="underline font-medium text-blue-400 inline-flex items-center gap-0.5 hover:text-blue-300">
            User Management <ExternalLink className="w-3 h-3" />
          </a>
          . Once a user is registered, use the <strong className="text-blue-300">Assign User</strong> button on each team below to link them.
        </span>
      </div>

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

      {/* Teams list */}
      {teams.length > 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              Teams <span className="text-gray-500 font-normal text-sm">({teams.length}/10)</span>
            </h3>
            <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg" title="Refresh teams">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-orange-600/20 text-xs text-gray-400">
            <ListOrdered className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
            <span>
              The number badge shows each team&apos;s draft position for the current season.
              To set or change draft order, go to <strong className="text-gray-300">Season Management → Draft Order</strong>.
              Use <strong className="text-gray-300">Assign User</strong> to link a registered user as the team&apos;s manager.
            </span>
          </div>

          <div className="space-y-2">
            {teams.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                users={users}
                onDelete={handleDelete}
                onRename={handleRename}
                commissionerId={commissionerId}
                onClaim={handleClaim}
                onRelease={handleRelease}
                onAssignUser={handleAssignUser}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center">
          <p className="text-gray-500 text-sm">No teams yet. Add your first team above.</p>
        </div>
      )}
    </div>
  )
}

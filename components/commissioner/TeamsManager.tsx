'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Mail, Trash2, Loader2, AlertCircle, CheckCircle, User,
  Pencil, Check, X, RefreshCw, ShieldCheck, ShieldOff, Link2, Copy,
  ListOrdered, ChevronDown, Save
} from 'lucide-react'

interface TeamWithManager {
  id: string
  name: string
  manager_id: string | null
  draft_position: number | null
  created_at: string
  manager: { id: string; display_name: string | null; email: string } | null
}

// ── TeamRow ──────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  index,
  onDelete,
  onInvite,
  onRename,
  commissionerId,
  onClaim,
  onRelease,
  onSaveManagerInfo,
}: {
  team: TeamWithManager
  index: number
  onDelete: (id: string) => void
  onInvite: (teamId: string, teamName: string) => void
  onRename: (id: string, newName: string) => Promise<void>
  commissionerId: string
  onClaim: (id: string) => Promise<void>
  onRelease: (id: string) => Promise<void>
  onSaveManagerInfo: (teamId: string, managerId: string, patch: { display_name?: string; email?: string; team_name?: string }) => Promise<void>
}) {
  const [claiming, setClaiming] = useState(false)
  const isOwnedByCommissioner = team.manager?.id === commissionerId

  // ── Inline rename state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(team.name)
  const [saving, setSaving] = useState(false)

  async function commitRename() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === team.name) { setEditing(false); setEditName(team.name); return }
    setSaving(true)
    await onRename(team.id, trimmed)
    setSaving(false)
    setEditing(false)
  }

  // ── Manager info edit panel ──────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState(team.manager?.display_name ?? '')
  const [editEmail, setEditEmail] = useState(team.manager?.email ?? '')
  const [editTeamName, setEditTeamName] = useState(team.name)
  const [savingInfo, setSavingInfo] = useState(false)

  // Re-sync when team prop changes
  useEffect(() => {
    setEditDisplayName(team.manager?.display_name ?? '')
    setEditEmail(team.manager?.email ?? '')
    setEditTeamName(team.name)
  }, [team])

  async function handleSaveInfo() {
    if (!team.manager) return
    setSavingInfo(true)
    const patch: { display_name?: string; email?: string; team_name?: string } = {}
    if (editDisplayName.trim() !== (team.manager.display_name ?? '')) patch.display_name = editDisplayName.trim()
    if (editEmail.trim() !== team.manager.email) patch.email = editEmail.trim()
    if (editTeamName.trim() !== team.name) patch.team_name = editTeamName.trim()
    await onSaveManagerInfo(team.id, team.manager.id, patch)
    setSavingInfo(false)
    setPanelOpen(false)
  }

  return (
    <div className="bg-gray-800/50 rounded-lg border border-orange-600/20 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Draft position badge */}
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-yellow-400 shrink-0"
          title={team.draft_position ? `Draft position ${team.draft_position}` : 'No draft position set'}>
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
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setEditName(team.name) } }}
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
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <User className="w-3 h-3" />
            {team.manager
              ? (team.manager.display_name ?? team.manager.email)
              : <span className="text-yellow-600">No manager assigned</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Edit info panel toggle */}
          {team.manager && (
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                panelOpen
                  ? 'bg-orange-950 text-orange-300 border-orange-800'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
              }`}
              title="Edit team & manager info"
            >
              <Pencil className="w-3 h-3" />
              Edit Info
              <ChevronDown className={`w-3 h-3 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
            </button>
          )}

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

      {/* Edit info panel */}
      {panelOpen && team.manager && (
        <div className="border-t border-orange-600/20 bg-gray-900/60 px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Edit Team &amp; Manager Info</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Team name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Team Name</label>
              <input
                type="text"
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            {/* Manager display name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Manager Display Name</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="e.g. Coach Miller"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            {/* Manager email */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Manager Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveInfo}
              disabled={savingInfo}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg text-sm transition-colors"
            >
              {savingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Changes
            </button>
            <button
              onClick={() => setPanelOpen(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-yellow-700">
            ⚠️ Changing the email address updates the manager&apos;s login email. They may need to verify the new address.
          </p>
        </div>
      )}
    </div>
  )
}

// ── TeamsManager ─────────────────────────────────────────────────────────────

export function TeamsManager({ commissionerId }: { commissionerId: string }) {
  const [teams, setTeams] = useState<TeamWithManager[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteTeamName, setInviteTeamName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [generatedLinkExpiry, setGeneratedLinkExpiry] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchTeams = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/teams')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFetchError(data.error ?? `Failed to load teams (${res.status})`)
      } else {
        setTeams(await res.json())
      }
    } catch {
      setFetchError('Network error — could not load teams.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTeams() }, [fetchTeams])

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
    if (res.ok) { await fetchTeams() }
    else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data.error ?? 'Failed to claim team.' })
    }
  }

  async function handleRelease(teamId: string) {
    const res = await fetch(`/api/teams/${teamId}/claim`, { method: 'DELETE' })
    if (res.ok) { await fetchTeams() }
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

  async function handleSaveManagerInfo(
    teamId: string,
    managerId: string,
    patch: { display_name?: string; email?: string; team_name?: string }
  ) {
    const errors: string[] = []

    // Update team name if changed
    if (patch.team_name) {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: patch.team_name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        errors.push(d.error ?? 'Failed to rename team')
      }
    }

    // Update manager profile (display_name and/or email)
    if (patch.display_name !== undefined || patch.email !== undefined) {
      const userPatch: Record<string, string> = {}
      if (patch.display_name !== undefined) userPatch.display_name = patch.display_name
      if (patch.email !== undefined) userPatch.email = patch.email

      const res = await fetch(`/api/users/${managerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userPatch),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        errors.push(d.error ?? 'Failed to update manager info')
      }
    }

    if (errors.length > 0) {
      setMessage({ type: 'error', text: errors.join(' · ') })
    } else {
      setMessage({ type: 'success', text: 'Team info updated successfully' })
      await fetchTeams()
    }
  }

  function openInvite(teamId: string, teamName: string) {
    setInviteTeamId(teamId)
    setInviteTeamName(teamName)
    setInviteEmail('')
    setGeneratedLink(null)
    setGeneratedLinkExpiry(null)
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
      const isRateLimit = /rate.?limit|too many/i.test(data.error ?? '')
      setMessage({
        type: 'error',
        text: isRateLimit
          ? '⚠️ Supabase email rate limit reached. Use "Get Link" above to share a join link directly — no email needed.'
          : data.error,
      })
    } else {
      setMessage({ type: 'success', text: data.message })
      setInviteTeamId(null)
      setInviteEmail('')
    }
  }

  async function handleGetLink() {
    if (!inviteTeamId) return
    setGeneratingLink(true)
    setGeneratedLink(null)
    setGeneratedLinkExpiry(null)
    setMessage(null)
    const res = await fetch('/api/invite-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: inviteTeamId }),
    })
    const data = await res.json()
    setGeneratingLink(false)
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed to generate link' })
    } else if (data.url) {
      setGeneratedLink(data.url)
      setGeneratedLinkExpiry(data.expires_at ?? null)
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
        <button onClick={fetchTeams} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg transition-colors shrink-0">
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
            <button onClick={() => { setInviteTeamId(null); setGeneratedLink(null) }} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Get Link */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGetLink}
              disabled={inviting || generatingLink}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/40 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {generatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Get Link
            </button>
            <p className="text-xs text-gray-500">No email required — manager registers with their own email on the join page.</p>
          </div>

          {generatedLink && (
            <div className="space-y-2">
              <p className="text-xs text-green-400 font-medium">✓ Invite link ready — share this with the manager:</p>
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
                    linkCopied ? 'bg-green-700 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-yellow-600">
                ⚠️ Single-use link · expires {generatedLinkExpiry ? new Date(generatedLinkExpiry).toLocaleDateString() : 'in 7 days'}
              </p>
            </div>
          )}

          {/* Send Email */}
          <div className="border-t border-gray-800 pt-4 space-y-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Or send a Supabase invite email</p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="manager@example.com"
                className="flex-1 min-w-48 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teams list */}
      {teams.length > 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              Teams <span className="text-gray-500 font-normal text-sm">({teams.length}/10)</span>
            </h3>
            <button onClick={fetchTeams} className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg" title="Refresh teams">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-800/60 rounded-lg border border-orange-600/20 text-xs text-gray-400">
            <ListOrdered className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
            <span>
              The number badge shows each team&apos;s draft position for the current season.
              To set or change draft order, go to <strong className="text-gray-300">Season Management → Draft Order</strong>.
              Use <strong className="text-gray-300">Edit Info</strong> to update team name, manager name, or email.
            </span>
          </div>

          <div className="space-y-2">
            {teams.map((team, i) => (
              <TeamRow
                key={team.id}
                team={team}
                index={i}
                onDelete={handleDelete}
                onInvite={openInvite}
                onRename={handleRename}
                commissionerId={commissionerId}
                onClaim={handleClaim}
                onRelease={handleRelease}
                onSaveManagerInfo={handleSaveManagerInfo}
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

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCog, Shield, User, Loader2, CheckCircle, AlertCircle,
  Crown, Zap, Users, Trash2, Mail, Pencil, X, Check, MailCheck,
} from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  display_name: string | null
  role: 'commissioner' | 'team_manager'
  team_id: string | null
  team?: { name: string } | null
}

interface TeamOption {
  id: string
  name: string
  manager_id: string | null
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isBootstrap, setIsBootstrap] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const load = useCallback(async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/teams'),
      ])
      const usersData = await usersRes.json()
      const teamsData = await teamsRes.json()

      if (!usersRes.ok) {
        flash('error', usersData.error ?? 'Failed to load users')
        setUsers([])
      } else {
        const userList: UserProfile[] = Array.isArray(usersData.users) ? usersData.users : []
        setUsers(userList)
        setCurrentUserId(usersData.current_user_id ?? null)
        setIsBootstrap(usersData.is_bootstrap ?? false)
        const me = userList.find((u) => u.id === usersData.current_user_id)
        setCurrentUserRole(me?.role ?? null)
      }

      if (teamsRes.ok && Array.isArray(teamsData)) {
        setTeams(teamsData as TeamOption[])
      }
    } catch {
      flash('error', 'Network error loading users')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleRoleChange(userId: string, newRole: 'commissioner' | 'team_manager') {
    setBusy(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      flash('error', data.error ?? 'Failed to update role')
      return
    }
    flash(
      'success',
      newRole === 'commissioner'
        ? `${data.display_name ?? data.email} is now a commissioner`
        : `${data.display_name ?? data.email} is now a team manager`
    )
    load()
  }

  async function handleTeamAssign(userId: string, teamId: string | null) {
    setBusy(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      flash('error', data.error ?? 'Failed to assign team')
      return
    }
    flash('success', teamId ? 'Team assigned successfully' : 'Team assignment cleared')
    load()
  }

  async function handleUpdate(userId: string, payload: { display_name?: string; email?: string }) {
    setBusy(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      flash('error', data.error ?? 'Update failed')
      return false
    }
    flash('success', 'User updated successfully')
    load()
    return true
  }

  async function handleDelete(user: UserProfile) {
    const label = user.display_name ?? user.email
    if (!confirm(`Permanently delete "${label}"?\n\nThis cannot be undone. Their account, login, and all associated data will be removed.`)) {
      return
    }
    setBusy(user.id)
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      flash('error', data.error ?? 'Delete failed')
      return
    }
    flash('success', `"${label}" has been deleted`)
    load()
  }

  async function handleResendActivation(user: UserProfile) {
    setBusy(`resend-${user.id}`)
    const res = await fetch(`/api/users/${user.id}/resend-activation`, { method: 'POST' })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) {
      flash('error', data.error ?? 'Failed to resend activation email')
      return
    }
    if (data.already_confirmed) {
      flash('error', `${data.email} is already confirmed — no email sent`)
      return
    }
    if (data.email_queued) {
      flash('success', `Activation email queued for ${data.email} (message ID: ${data.message_id})`)
    } else {
      // API returned success but no message_id — email provider may not have queued it
      flash('error', `Request accepted but no message ID returned — check Supabase email logs to confirm delivery to ${data.email}`)
    }
  }

  const commissioners = users.filter((u) => u.role === 'commissioner')
  const managers = users.filter((u) => u.role === 'team_manager')
  const isCurrentUserCommissioner = currentUserRole === 'commissioner'

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <UserCog className="w-8 h-8 text-yellow-400 shrink-0" />
        <h1 className="text-3xl font-bold text-white">User Management</h1>
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

      {/* Bootstrap banner */}
      {isBootstrap && !loading && (
        <div className="bg-yellow-950/50 border border-yellow-600/50 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-yellow-400 font-semibold">
            <Zap className="w-5 h-5" />
            No commissioners assigned yet
          </div>
          <p className="text-sm text-yellow-200/70">
            The league has no commissioners. Click below to claim the commissioner role for your account.
          </p>
          {currentUserId && (
            <button
              onClick={() => handleRoleChange(currentUserId, 'commissioner')}
              disabled={busy === currentUserId}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
            >
              {busy === currentUserId
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Crown className="w-4 h-4" />}
              Claim Commissioner Role
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
        </div>
      ) : (
        <>
          {/* Commissioners section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-yellow-400">
              <Crown className="w-4 h-4" />
              Commissioners ({commissioners.length})
            </div>

            {commissioners.length === 0 ? (
              <p className="text-gray-500 text-sm px-1">No commissioners yet.</p>
            ) : (
              commissioners.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  teams={teams}
                  isSelf={u.id === currentUserId}
                  busyId={busy}
                  isLastCommissioner={commissioners.length === 1}
                  canEdit={isCurrentUserCommissioner}
                  onRoleChange={handleRoleChange}
                  onTeamAssign={handleTeamAssign}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onResendActivation={handleResendActivation}
                />
              ))
            )}
          </section>

          {/* Team Managers section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              <User className="w-4 h-4" />
              Team Managers ({managers.length})
            </div>

            {managers.length === 0 ? (
              <p className="text-gray-500 text-sm px-1">No team managers yet.</p>
            ) : (
              managers.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  teams={teams}
                  isSelf={u.id === currentUserId}
                  busyId={busy}
                  isLastCommissioner={false}
                  canEdit={isCurrentUserCommissioner}
                  onRoleChange={handleRoleChange}
                  onTeamAssign={handleTeamAssign}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onResendActivation={handleResendActivation}
                />
              ))
            )}
          </section>

          {/* Info box */}
          <div className="bg-gray-900 border border-orange-600/10 rounded-xl p-4 text-sm text-gray-400 space-y-1">
            <p className="flex items-center gap-2 text-white font-medium text-xs uppercase tracking-wider mb-2">
              <Shield className="w-4 h-4 text-yellow-400" />
              Commissioner Access
            </p>
            <p>Commissioners have full access to all admin controls — seasons, athletes, teams, draft, scores, and announcements.</p>
            <p>Team managers only see the Draft Room and their own team dashboard.</p>
            <p className="text-yellow-600">At least one commissioner must remain at all times.</p>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-component: single user row ───────────────────────────────────────────

function UserRow({
  user,
  teams,
  isSelf,
  busyId,
  isLastCommissioner,
  canEdit,
  onRoleChange,
  onTeamAssign,
  onUpdate,
  onDelete,
  onResendActivation,
}: {
  user: UserProfile
  teams: TeamOption[]
  isSelf: boolean
  busyId: string | null
  isLastCommissioner: boolean
  canEdit: boolean
  onRoleChange: (id: string, role: 'commissioner' | 'team_manager') => void
  onTeamAssign: (id: string, teamId: string | null) => void
  onUpdate: (id: string, payload: { display_name?: string; email?: string }) => Promise<boolean>
  onDelete: (user: UserProfile) => void
  onResendActivation: (user: UserProfile) => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [nameVal, setNameVal] = useState(user.display_name ?? '')
  const [emailVal, setEmailVal] = useState(user.email)

  // Keep local state in sync if parent reloads
  useEffect(() => { setNameVal(user.display_name ?? '') }, [user.display_name])
  useEffect(() => { setEmailVal(user.email) }, [user.email])

  const busy = busyId === user.id || busyId === `resend-${user.id}`
  const isResendBusy = busyId === `resend-${user.id}`
  const isCommissioner = user.role === 'commissioner'
  const canDemote = canEdit && isCommissioner && !(isSelf && isLastCommissioner)
  const canPromote = canEdit && !isCommissioner

  async function saveName() {
    const ok = await onUpdate(user.id, { display_name: nameVal })
    if (ok) setEditingName(false)
  }

  async function saveEmail() {
    const ok = await onUpdate(user.id, { email: emailVal })
    if (ok) setEditingEmail(false)
  }

  return (
    <div className="bg-gray-900 border border-orange-600/20 rounded-xl px-5 py-4 space-y-3">

      {/* Top row: icon + identity + role badge + role action */}
      <div className="flex items-start gap-4 flex-wrap">
        {/* Role icon */}
        <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isCommissioner ? 'bg-yellow-400/10' : 'bg-gray-800'}`}>
          {isCommissioner
            ? <Crown className="w-5 h-5 text-yellow-400" />
            : <User className="w-5 h-5 text-gray-400" />}
        </div>

        {/* Identity block */}
        <div className="flex-1 min-w-0 space-y-1.5">

          {/* Display name row */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingName && canEdit ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder="Display name"
                  className="px-2 py-1 bg-gray-800 border border-yellow-400/50 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-400 w-44"
                />
                <button onClick={saveName} disabled={busy} className="p-1 text-green-400 hover:text-green-300 disabled:opacity-40">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => { setEditingName(false); setNameVal(user.display_name ?? '') }} className="p-1 text-gray-500 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">
                  {user.display_name ?? <span className="text-gray-500 italic">No display name</span>}
                </span>
                {isSelf && (
                  <span className="text-xs px-2 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded-full">
                    You
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() => setEditingName(true)}
                    title="Edit display name"
                    className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Email row */}
          {editingEmail && canEdit ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="email"
                value={emailVal}
                onChange={(e) => setEmailVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') setEditingEmail(false) }}
                className="px-2 py-1 bg-gray-800 border border-yellow-400/50 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-400 w-56"
              />
              <button onClick={saveEmail} disabled={busy} className="p-1 text-green-400 hover:text-green-300 disabled:opacity-40">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => { setEditingEmail(false); setEmailVal(user.email) }} className="p-1 text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{user.email}</span>
              {canEdit && (
                <button
                  onClick={() => setEditingEmail(true)}
                  title="Edit email"
                  className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Role badge + role action */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isCommissioner
              ? 'bg-yellow-950 border-yellow-700 text-yellow-300'
              : 'bg-gray-800 border-gray-700 text-gray-300'
          }`}>
            {isCommissioner ? 'Commissioner' : 'Team Manager'}
          </span>

          {busy && busyId === user.id ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : canPromote ? (
            <button
              onClick={() => onRoleChange(user.id, 'commissioner')}
              disabled={!!busyId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <Crown className="w-3 h-3" />
              Make Commissioner
            </button>
          ) : canDemote ? (
            <button
              onClick={() => {
                if (isSelf) {
                  if (confirm('Remove your own commissioner access? You will lose admin controls.')) {
                    onRoleChange(user.id, 'team_manager')
                  }
                } else {
                  onRoleChange(user.id, 'team_manager')
                }
              }}
              disabled={!!busyId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            >
              <User className="w-3 h-3" />
              Remove Access
            </button>
          ) : isLastCommissioner ? (
            <span className="text-xs text-gray-600 italic">Last commissioner</span>
          ) : null}
        </div>
      </div>

      {/* Team assignment */}
      {canEdit && (
        <div className="flex items-center gap-3 pl-14 flex-wrap">
          <Users className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <select
            value={user.team_id ?? ''}
            disabled={!!busyId}
            onChange={(e) => onTeamAssign(user.id, e.target.value || null)}
            className="flex-1 max-w-xs px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-400 disabled:opacity-50"
          >
            <option value="">— No team assigned —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.manager_id && t.manager_id !== user.id ? ' (taken)' : ''}
              </option>
            ))}
          </select>
          {!user.team_id && (
            <span className="text-xs text-yellow-600">Not assigned to a team</span>
          )}
        </div>
      )}

      {/* Action row: resend activation + delete */}
      {canEdit && (
        <div className="flex items-center gap-2 pl-14 flex-wrap pt-1 border-t border-gray-800">
          {/* Resend activation email */}
          <button
            onClick={() => onResendActivation(user)}
            disabled={!!busyId}
            title="Resend activation / confirmation email"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-blue-900/40 text-gray-400 hover:text-blue-300 border border-gray-700 hover:border-blue-700/50 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          >
            {isResendBusy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <MailCheck className="w-3.5 h-3.5" />}
            Resend Activation Email
          </button>

          {/* Delete user */}
          {!isSelf && (
            <button
              onClick={() => onDelete(user)}
              disabled={!!busyId}
              title="Permanently delete this user"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-700/50 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete User
            </button>
          )}

          {/* Invite / email icon placeholder (visual context) */}
          {isSelf && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
              <Mail className="w-3.5 h-3.5" />
              Cannot delete your own account here
            </span>
          )}
        </div>
      )}
    </div>
  )
}

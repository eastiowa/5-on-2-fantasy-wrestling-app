'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCog, Shield, User, Loader2, CheckCircle, AlertCircle, Crown, Zap
} from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  display_name: string | null
  role: 'commissioner' | 'team_manager'
  team_id: string | null
  team?: { name: string } | null
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
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
      const res = await fetch('/api/users')
      const data = await res.json()
      if (!res.ok) {
        flash('error', data.error ?? 'Failed to load users')
        setUsers([])
      } else {
        const userList: UserProfile[] = Array.isArray(data.users) ? data.users : []
        setUsers(userList)
        setCurrentUserId(data.current_user_id ?? null)
        setIsBootstrap(data.is_bootstrap ?? false)
        // Track current user's role for permission checks in the UI
        const me = userList.find((u) => u.id === data.current_user_id)
        setCurrentUserRole(me?.role ?? null)
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

  const commissioners = users.filter((u) => u.role === 'commissioner')
  const managers = users.filter((u) => u.role === 'team_manager')
  const isCurrentUserCommissioner = currentUserRole === 'commissioner'

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <UserCog className="w-8 h-8 text-yellow-400 shrink-0" />
        <h1 className="text-3xl font-bold text-white">User Roles</h1>
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
            You can then assign other users from this page.
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
                  isSelf={u.id === currentUserId}
                  busy={busy === u.id}
                  isLastCommissioner={commissioners.length === 1}
                  canEdit={isCurrentUserCommissioner}
                  onRoleChange={handleRoleChange}
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
                  isSelf={u.id === currentUserId}
                  busy={busy === u.id}
                  isLastCommissioner={false}
                  canEdit={isCurrentUserCommissioner}
                  onRoleChange={handleRoleChange}
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
  isSelf,
  busy,
  isLastCommissioner,
  canEdit,
  onRoleChange,
}: {
  user: UserProfile
  isSelf: boolean
  busy: boolean
  isLastCommissioner: boolean
  canEdit: boolean
  onRoleChange: (id: string, role: 'commissioner' | 'team_manager') => void
}) {
  const isCommissioner = user.role === 'commissioner'
  const canDemote = canEdit && isCommissioner && !(isSelf && isLastCommissioner)
  const canPromote = canEdit && !isCommissioner

  return (
    <div className="bg-gray-900 border border-orange-600/20 rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap">
      {/* Role icon */}
      <div className={`p-2 rounded-lg shrink-0 ${isCommissioner ? 'bg-yellow-400/10' : 'bg-gray-800'}`}>
        {isCommissioner
          ? <Crown className="w-5 h-5 text-yellow-400" />
          : <User className="w-5 h-5 text-gray-400" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">
            {user.display_name ?? user.email}
          </span>
          {isSelf && (
            <span className="text-xs px-2 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded-full">
              You
            </span>
          )}
          {user.team && (
            <span className="text-xs text-gray-500">· {(user.team as { name?: string })?.name}</span>
          )}
        </div>
        {user.display_name && (
          <div className="text-xs text-gray-500 mt-0.5">{user.email}</div>
        )}
      </div>

      {/* Role badge + action */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
          isCommissioner
            ? 'bg-yellow-950 border-yellow-700 text-yellow-300'
            : 'bg-gray-800 border-gray-700 text-gray-300'
        }`}>
          {isCommissioner ? 'Commissioner' : 'Team Manager'}
        </span>

        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : canPromote ? (
          <button
            onClick={() => onRoleChange(user.id, 'commissioner')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-lg text-xs font-medium transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg text-xs font-medium transition-colors"
          >
            <User className="w-3 h-3" />
            Remove Access
          </button>
        ) : isLastCommissioner ? (
          <span className="text-xs text-gray-600 italic">Last commissioner</span>
        ) : null}
      </div>
    </div>
  )
}

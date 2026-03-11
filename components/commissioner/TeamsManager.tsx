'use client'

import { useState } from 'react'
import { Team } from '@/types'
import {
  Plus, Mail, Trash2, GripVertical, Loader2, AlertCircle, CheckCircle, User
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
  draft_position: number | null
  created_at: string
  manager: { id: string; display_name: string | null; email: string } | null
}

interface TeamsManagerProps {
  initialTeams: TeamWithManager[]
}

function SortableTeamRow({
  team,
  index,
  onDelete,
  onInvite,
}: {
  team: TeamWithManager
  index: number
  onDelete: (id: string) => void
  onInvite: (teamId: string, teamName: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700"
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
        <div className="font-semibold text-white">{team.name}</div>
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <User className="w-3 h-3" />
          {team.manager
            ? (team.manager.display_name ?? team.manager.email)
            : <span className="text-yellow-600">No manager assigned</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onInvite(team.id, team.name)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-950 text-blue-400 border border-blue-800 rounded-lg hover:bg-blue-900 transition-colors"
        >
          <Mail className="w-3 h-3" />
          {team.manager ? 'Re-invite' : 'Invite Manager'}
        </button>
        <button
          onClick={() => onDelete(team.id)}
          className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function TeamsManager({ initialTeams }: TeamsManagerProps) {
  const [teams, setTeams] = useState<TeamWithManager[]>(initialTeams)
  const [newTeamName, setNewTeamName] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteTeamName, setInviteTeamName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
    }
  }

  function openInvite(teamId: string, teamName: string) {
    setInviteTeamId(teamId)
    setInviteTeamName(teamName)
    setInviteEmail('')
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
        <div className="bg-gray-900 rounded-xl border border-yellow-400/30 p-6">
          <h3 className="font-semibold text-white mb-1">
            Invite Manager — <span className="text-yellow-400">{inviteTeamName}</span>
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            An invite email with a secure account setup link will be sent.
          </p>
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="manager@example.com"
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-semibold rounded-lg transition-colors"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Invite
            </button>
            <button
              onClick={() => setInviteTeamId(null)}
              className="px-4 py-2.5 text-gray-400 hover:text-white transition-colors rounded-lg border border-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Teams list with drag-and-drop */}
      {teams.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Draft Order</h3>
            <button
              onClick={handleSaveOrder}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save Order
            </button>
          </div>
          <p className="text-xs text-gray-500">Drag teams to set the snake draft order (position 1 picks first).</p>

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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}

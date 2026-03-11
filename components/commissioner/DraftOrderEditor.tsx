'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { GripVertical, Loader2, CheckCircle, AlertCircle, User, RefreshCw } from 'lucide-react'

interface TeamRow {
  id: string
  name: string
  draft_position: number | null
  manager: { id: string; display_name: string | null; email: string } | null
}

function SortableRow({ team, index }: { team: TeamRow; index: number }) {
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
      className="flex items-center gap-3 px-4 py-3 bg-gray-800/60 rounded-lg border border-orange-600/10 hover:border-orange-600/30 transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Position badge */}
      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0">
        {index + 1}
      </div>

      {/* Team info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm">{team.name}</div>
        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
          <User className="w-3 h-3" />
          {team.manager
            ? (team.manager.display_name ?? team.manager.email)
            : <span className="text-yellow-700">No manager</span>}
        </div>
      </div>
    </div>
  )
}

interface DraftOrderEditorProps {
  /** The season this draft order belongs to */
  seasonId: string
  seasonLabel: string
  /** Whether this season is locked (complete) — editor becomes read-only */
  readOnly?: boolean
}

export function DraftOrderEditor({ seasonId, seasonLabel, readOnly = false }: DraftOrderEditorProps) {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/teams?season_id=${seasonId}`)
      if (!res.ok) {
        const d = await res.json()
        setStatus({ type: 'error', text: d.error ?? 'Failed to load teams' })
      } else {
        setTeams(await res.json())
      }
    } catch {
      setStatus({ type: 'error', text: 'Network error loading teams' })
    } finally {
      setLoading(false)
    }
  }, [seasonId])

  useEffect(() => { load() }, [load])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = teams.findIndex((t) => t.id === active.id)
    const newIndex = teams.findIndex((t) => t.id === over.id)
    setTeams(arrayMove(teams, oldIndex, newIndex))
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    const order = teams.map((t, i) => ({ id: t.id, draft_position: i + 1 }))
    try {
      const res = await fetch('/api/teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, season_id: seasonId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error ?? 'Failed to save order' })
      } else {
        setStatus({ type: 'success', text: `Draft order saved for "${seasonLabel}"` })
        // Refresh to confirm server state
        await load()
      }
    } catch {
      setStatus({ type: 'error', text: 'Network error saving order' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading teams…
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">
        No teams found. Add teams in <strong className="text-gray-400">Manage Teams</strong> first.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Status message */}
      {status && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
          status.type === 'success'
            ? 'bg-green-950 border-green-800 text-green-400'
            : 'bg-red-950 border-red-800 text-red-400'
        }`}>
          {status.type === 'success'
            ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {status.text}
        </div>
      )}

      {readOnly ? (
        /* Read-only ordered list */
        <div className="space-y-2">
          {teams.map((team, i) => (
            <div
              key={team.id}
              className="flex items-center gap-3 px-4 py-3 bg-gray-800/40 rounded-lg border border-gray-800"
            >
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0">
                {team.draft_position ?? i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm">{team.name}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" />
                  {team.manager
                    ? (team.manager.display_name ?? team.manager.email)
                    : <span className="text-yellow-700">No manager</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Drag-and-drop editable list */
        <>
          <p className="text-xs text-gray-500">
            Drag teams to set the snake draft order — position&nbsp;1 picks first.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={teams.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {teams.map((team, i) => (
                  <SortableRow key={team.id} team={team} index={i} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg text-sm transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Draft Order
            </button>
            <button
              onClick={load}
              disabled={loading || saving}
              className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg"
              title="Reset to saved order"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

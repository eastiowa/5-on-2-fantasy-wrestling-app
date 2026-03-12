'use client'

import { useState } from 'react'
import { WishlistItem, Athlete } from '@/types'
import { cn } from '@/lib/utils'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Zap, Loader2, BookmarkPlus, Layers } from 'lucide-react'

type GroupBy = 'weight' | 'seed' | null

interface WishlistPanelProps {
  wishlist: Array<WishlistItem & { athlete: Athlete }>
  setWishlist: (items: Array<WishlistItem & { athlete: Athlete }>) => void
  isMyTurn: boolean
  picking: boolean
  onPick: (athleteId: string) => void
  teamId: string | null
}

function WishlistRow({
  item, isMyTurn, picking, onPick, onRemove, draggable
}: {
  item: WishlistItem & { athlete: Athlete }
  isMyTurn: boolean
  picking: boolean
  onPick: (id: string) => void
  onRemove: (id: string) => void
  draggable: boolean
}) {
  const sortable = useSortable({ id: item.id, disabled: !draggable })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  }
  const drafted = item.athlete?.is_drafted

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border',
        drafted
          ? 'bg-gray-900/30 border-gray-800 opacity-50'
          : 'bg-gray-900 border-gray-700'
      )}
    >
      {draggable ? (
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="text-gray-600 hover:text-gray-400 cursor-grab shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <div className="w-6 text-center text-xs font-bold text-gray-500 shrink-0">
        {item.rank}
      </div>

      <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-0.5 rounded-full shrink-0">
        {item.athlete?.weight}
      </span>

      <div className="flex-1 min-w-0">
        <div className={cn('font-medium truncate', drafted ? 'line-through text-gray-500' : 'text-white')}>
          {item.athlete?.name}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {item.athlete?.school} · Seed #{item.athlete?.seed}
          {drafted && <span className="text-red-400 ml-1">· Drafted</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isMyTurn && !drafted && (
          <button
            onClick={() => onPick(item.athlete_id)}
            disabled={picking}
            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-gray-900 font-semibold text-xs rounded-lg"
          >
            {picking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Pick
          </button>
        )}
        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function WishlistPanel({
  wishlist, setWishlist, isMyTurn, picking, onPick, teamId
}: WishlistPanelProps) {
  const sensors = useSensors(useSensor(PointerSensor))
  const [groupBy, setGroupBy] = useState<GroupBy>(null)

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = wishlist.findIndex((i) => i.id === active.id)
    const newIndex = wishlist.findIndex((i) => i.id === over.id)
    const reordered = arrayMove(wishlist, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }))
    setWishlist(reordered)

    await fetch('/api/draft/wishlist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: reordered.map((i) => ({ id: i.id, rank: i.rank })),
        team_id: teamId,
      }),
    })
  }

  async function handleRemove(id: string) {
    setWishlist(wishlist.filter((i) => i.id !== id))
    await fetch('/api/draft/wishlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, team_id: teamId }),
    })
  }

  function toggleGroup(mode: GroupBy) {
    setGroupBy((prev) => (prev === mode ? null : mode))
  }

  if (!teamId) {
    return <div className="py-12 text-center text-gray-500 text-sm">No team assigned.</div>
  }

  if (wishlist.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <BookmarkPlus className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Your wishlist is empty.</p>
        <p className="text-xs mt-1">Add athletes from the Athletes tab to queue them up.</p>
      </div>
    )
  }

  const topAvailable = wishlist.find((i) => !i.athlete?.is_drafted)

  // Build grouped buckets for display
  function getBuckets(): { label: string; items: Array<WishlistItem & { athlete: Athlete }> }[] {
    if (!groupBy) return []

    if (groupBy === 'weight') {
      const weights = [...new Set(wishlist.map((i) => i.athlete?.weight ?? 0))].sort((a, b) => a - b)
      return weights.map((w) => ({
        label: `${w} lbs`,
        items: wishlist.filter((i) => i.athlete?.weight === w),
      }))
    }

    // seed: bucket by ranges 1–4, 5–8, 9–12, 13–16, 17+
    const ranges = [
      { label: 'Seeds 1–4',  min: 1,  max: 4  },
      { label: 'Seeds 5–8',  min: 5,  max: 8  },
      { label: 'Seeds 9–12', min: 9,  max: 12 },
      { label: 'Seeds 13–16', min: 13, max: 16 },
      { label: 'Seeds 17+',  min: 17, max: Infinity },
    ]
    return ranges
      .map((r) => ({
        label: r.label,
        items: wishlist.filter((i) => {
          const s = i.athlete?.seed ?? 99
          return s >= r.min && s <= r.max
        }),
      }))
      .filter((b) => b.items.length > 0)
  }

  const buckets = getBuckets()
  const isGrouped = groupBy !== null

  return (
    <div className="space-y-3">
      {/* Group by controls */}
      <div className="flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-500">Group by:</span>
        <button
          onClick={() => toggleGroup('weight')}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors',
            groupBy === 'weight'
              ? 'bg-yellow-400 text-gray-900 font-semibold'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          )}
        >
          Weight
        </button>
        <button
          onClick={() => toggleGroup('seed')}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors',
            groupBy === 'seed'
              ? 'bg-yellow-400 text-gray-900 font-semibold'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          )}
        >
          Seed
        </button>
        {isGrouped && (
          <span className="text-xs text-gray-600 ml-1 italic">drag disabled while grouped</span>
        )}
      </div>

      {isMyTurn && topAvailable && (
        <div className="px-4 py-3 bg-green-950/50 border border-green-800 rounded-lg text-sm">
          <span className="text-green-400 font-medium">Auto-pick ready: </span>
          <span className="text-white">{topAvailable.athlete?.name}</span>
          <span className="text-gray-400"> ({topAvailable.athlete?.weight} lbs)</span>
        </div>
      )}

      {/* Grouped view */}
      {isGrouped ? (
        <div className="space-y-4">
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider px-1">
                  {bucket.label}
                </div>
                <div className="flex-1 h-px bg-yellow-400/20" />
                <div className="text-xs text-gray-600">{bucket.items.length}</div>
              </div>
              <div className="space-y-1.5">
                {bucket.items.map((item) => (
                  <WishlistRow
                    key={item.id}
                    item={item}
                    isMyTurn={isMyTurn}
                    picking={picking}
                    onPick={onPick}
                    onRemove={handleRemove}
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Normal DnD view */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={wishlist.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {wishlist.map((item) => (
                <WishlistRow
                  key={item.id}
                  item={item}
                  isMyTurn={isMyTurn}
                  picking={picking}
                  onPick={onPick}
                  onRemove={handleRemove}
                  draggable={true}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

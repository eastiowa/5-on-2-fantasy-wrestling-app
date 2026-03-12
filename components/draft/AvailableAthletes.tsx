'use client'

import { useState } from 'react'
import { Athlete, DraftPick, WEIGHT_CLASSES } from '@/types'
import { validatePick } from '@/lib/draft-logic'
import { cn } from '@/lib/utils'
import { Search, BookmarkPlus, Zap, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'

const ALL_SEEDS = Array.from({ length: 33 }, (_, i) => i + 1)

interface AvailableAthletesProps {
  athletes: Athlete[]
  picks: Array<DraftPick & { athlete: Athlete }>
  userTeamId: string | null
  isMyTurn: boolean
  picking: boolean
  onPick: (athleteId: string) => void
  onAddToWishlist: (athleteId: string) => Promise<void>
  wishlistIds: Set<string>
}

export function AvailableAthletes({
  athletes,
  picks,
  userTeamId,
  isMyTurn,
  picking,
  onPick,
  onAddToWishlist,
  wishlistIds,
}: AvailableAthletesProps) {
  const [search, setSearch] = useState('')
  const [filterWeight, setFilterWeight] = useState<number | 'all'>('all')
  const [selectedSeeds, setSelectedSeeds] = useState<Set<number>>(new Set())
  const [seedPanelOpen, setSeedPanelOpen] = useState(false)
  const [addingToWishlist, setAddingToWishlist] = useState<string | null>(null)

  function toggleSeed(seed: number) {
    setSelectedSeeds((prev) => {
      const next = new Set(prev)
      if (next.has(seed)) next.delete(seed)
      else next.add(seed)
      return next
    })
  }

  function clearSeeds() {
    setSelectedSeeds(new Set())
  }

  const available = athletes.filter((a) => {
    if (a.is_drafted) return false
    if (filterWeight !== 'all' && a.weight !== filterWeight) return false
    if (selectedSeeds.size > 0 && !selectedSeeds.has(a.seed)) return false
    if (search) {
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.school.toLowerCase().includes(q)
    }
    return true
  })

  async function handleWishlist(athleteId: string) {
    setAddingToWishlist(athleteId)
    await onAddToWishlist(athleteId)
    setAddingToWishlist(null)
  }

  const getEligibility = (athlete: Athlete) => {
    if (!userTeamId) return null
    return validatePick(athlete, { id: userTeamId } as any, picks)
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or school…"
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>
        <select
          value={filterWeight}
          onChange={(e) => setFilterWeight(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          <option value="all">All weights</option>
          {WEIGHT_CLASSES.map((w) => (
            <option key={w} value={w}>{w} lbs</option>
          ))}
        </select>

        {/* Seed filter toggle */}
        <button
          onClick={() => setSeedPanelOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm transition-colors',
            selectedSeeds.size > 0
              ? 'bg-yellow-400/10 border-yellow-400/50 text-yellow-300'
              : 'bg-gray-800 border-gray-700 text-white hover:border-gray-500'
          )}
        >
          {selectedSeeds.size > 0 ? `Seeds: ${[...selectedSeeds].sort((a,b)=>a-b).join(', ')}` : 'Filter by seed'}
          {seedPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Seed checkbox panel */}
      {seedPanelOpen && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-300">Select seeds to show</span>
            {selectedSeeds.size > 0 && (
              <button
                onClick={clearSeeds}
                className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-11 gap-1">
            {ALL_SEEDS.map((seed) => {
              const checked = selectedSeeds.has(seed)
              return (
                <button
                  key={seed}
                  onClick={() => toggleSeed(seed)}
                  className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 rounded text-[10px] sm:text-xs font-semibold transition-colors',
                    checked
                      ? 'bg-yellow-400 text-gray-900'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                >
                  {seed}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Count */}
      <div className="text-xs text-gray-500">{available.length} athletes available</div>

      {/* Athletes list */}
      <div className="space-y-1.5">
        {available.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">
            No athletes match your filter.
          </div>
        ) : (
          available.map((athlete) => {
            const eligError = getEligibility(athlete)
            const ineligible = !!eligError
            const inWishlist = wishlistIds.has(athlete.id)

            return (
              <div
                key={athlete.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors',
                  ineligible
                    ? 'bg-gray-900/50 border-gray-800 opacity-60'
                    : isMyTurn
                    ? 'bg-gray-900 border-gray-700 hover:border-yellow-400/50'
                    : 'bg-gray-900 border-gray-800'
                )}
              >
                {/* Weight badge */}
                <span className="text-xs font-bold bg-gray-800 text-yellow-400 px-2 py-0.5 rounded-full shrink-0">
                  {athlete.weight}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{athlete.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {athlete.school} · Seed #{athlete.seed}
                    {ineligible && <span className="text-red-400 ml-2">· {eligError}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Add to wishlist */}
                  <button
                    onClick={() => handleWishlist(athlete.id)}
                    disabled={inWishlist || addingToWishlist === athlete.id || !userTeamId}
                    className={cn(
                      'p-1.5 rounded transition-colors',
                      inWishlist
                        ? 'text-yellow-400 bg-yellow-400/10'
                        : 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10'
                    )}
                    title={inWishlist ? 'In wishlist' : 'Add to wishlist'}
                  >
                    {addingToWishlist === athlete.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : inWishlist
                      ? <Check className="w-4 h-4" />
                      : <BookmarkPlus className="w-4 h-4" />}
                  </button>

                  {/* Pick button */}
                  {isMyTurn && !ineligible && (
                    <button
                      onClick={() => onPick(athlete.id)}
                      disabled={picking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-gray-900 font-semibold text-xs rounded-lg transition-colors"
                    >
                      {picking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Pick
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

'use client'

/**
 * WinProbabilityBadge
 *
 * Displays a team's Monte Carlo championship win probability as a
 * percentage pill with a proportional fill bar underneath.
 *
 * Color coding:
 *   ≥ 30%  → green  (strong contender)
 *   10–29% → yellow (live shot)
 *   1–9%   → gray   (long shot)
 *   < 1%   → muted  (effectively eliminated)
 *
 * Props:
 *   probability  — 0.0–1.0 float from team_projections.win_probability
 *   showBar      — render the fill bar (default true)
 *   className    — extra Tailwind classes on the wrapper
 */

interface WinProbabilityBadgeProps {
  probability: number
  showBar?: boolean
  className?: string
}

export function WinProbabilityBadge({
  probability,
  showBar = true,
  className = '',
}: WinProbabilityBadgeProps) {
  const pct = Math.min(100, Math.max(0, Math.round(probability * 100)))

  // Colour tier
  const textColor =
    pct >= 30  ? 'text-green-400'
    : pct >= 10 ? 'text-yellow-400'
    : pct >= 1  ? 'text-gray-300'
    :             'text-gray-600'

  const barColor =
    pct >= 30  ? 'bg-green-500'
    : pct >= 10 ? 'bg-yellow-400'
    : pct >= 1  ? 'bg-gray-500'
    :             'bg-gray-700'

  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      <span className={`text-sm font-bold tabular-nums ${textColor}`}>
        {pct}%
      </span>

      {showBar && (
        <div className="w-16 h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

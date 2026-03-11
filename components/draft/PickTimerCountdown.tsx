'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface PickTimerCountdownProps {
  remainingSeconds: number | null
  totalSeconds: number
}

export function PickTimerCountdown({ remainingSeconds, totalSeconds }: PickTimerCountdownProps) {
  const [display, setDisplay] = useState(remainingSeconds)

  useEffect(() => {
    if (remainingSeconds === null) return
    setDisplay(remainingSeconds)

    const interval = setInterval(() => {
      setDisplay((prev) => {
        if (prev === null || prev <= 0) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [remainingSeconds])

  if (display === null) return null

  const pct = totalSeconds > 0 ? Math.max(0, display / totalSeconds) : 0
  const isLow = pct < 0.25
  const isVeryLow = pct < 0.1
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - pct)

  return (
    <div className={cn('relative w-14 h-14 shrink-0', isVeryLow && 'animate-pulse')}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        {/* Background ring */}
        <circle cx="24" cy="24" r={radius} fill="none" stroke="#374151" strokeWidth="4" />
        {/* Progress ring */}
        <circle
          cx="24" cy="24" r={radius}
          fill="none"
          stroke={isLow ? '#ef4444' : isVeryLow ? '#ef4444' : '#facc15'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000"
        />
      </svg>
      {/* Number */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn(
          'text-sm font-bold tabular-nums',
          isLow ? 'text-red-400' : 'text-yellow-400'
        )}>
          {display}
        </span>
      </div>
    </div>
  )
}

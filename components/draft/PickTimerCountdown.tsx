'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface PickTimerCountdownProps {
  remainingSeconds: number | null
  totalSeconds: number
  onExpire?: () => void
}

export function PickTimerCountdown({ remainingSeconds, totalSeconds, onExpire }: PickTimerCountdownProps) {
  const [display, setDisplay] = useState(remainingSeconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (remainingSeconds === null) return
    setDisplay(remainingSeconds)
    expiredRef.current = false

    const interval = setInterval(() => {
      setDisplay((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(interval)
          if (!expiredRef.current) {
            expiredRef.current = true
            onExpire?.()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [remainingSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  if (display === null) return null

  const pct = totalSeconds > 0 ? Math.max(0, display / totalSeconds) : 0
  const isLow = pct < 0.25
  const isVeryLow = pct < 0.1
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - pct)

  // Format as MM:SS (or M:SS when < 10 min, or 0:SS when < 1 min)
  const secs = display ?? 0
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const timeLabel = `${m}:${String(s).padStart(2, '0')}`
  const color = isLow ? 'text-red-400' : 'text-yellow-400'

  return (
    <div className={cn('relative w-16 h-16 shrink-0', isVeryLow && 'animate-pulse')}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 52 52">
        {/* Background ring */}
        <circle cx="26" cy="26" r={radius} fill="none" stroke="#374151" strokeWidth="4" />
        {/* Progress ring */}
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke={isLow ? '#ef4444' : '#facc15'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000"
        />
      </svg>
      {/* MM:SS label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none gap-0.5">
        <span className={cn('text-xs font-bold tabular-nums tracking-tight', color)}>
          {timeLabel}
        </span>
        <span className="text-[8px] text-gray-500 font-medium">left</span>
      </div>
    </div>
  )
}

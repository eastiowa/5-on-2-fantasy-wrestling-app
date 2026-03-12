'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface DraftCountdownProps {
  draftStartDate: string   // ISO timestamp
  className?: string
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number            // milliseconds remaining
}

function calcTimeLeft(target: string): TimeLeft {
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
  return {
    total: diff,
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export function DraftCountdown({ draftStartDate, className = '' }: DraftCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(draftStartDate))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft(draftStartDate)), 1000)
    return () => clearInterval(id)
  }, [draftStartDate])

  if (timeLeft.total <= 0) {
    return (
      <div className={`flex items-center gap-2 text-green-400 font-bold ${className}`}>
        <Clock className="w-4 h-4 animate-pulse" />
        Draft starting now!
      </div>
    )
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
        <Clock className="w-3.5 h-3.5 text-yellow-400" />
        Draft starts in
      </div>
      <div className="flex items-center gap-1.5 font-mono font-bold text-white">
        {timeLeft.days > 0 && (
          <>
            <span className="text-2xl text-yellow-400">{timeLeft.days}</span>
            <span className="text-sm text-gray-500 mr-2">d</span>
          </>
        )}
        <span className="text-2xl text-yellow-400">{pad(timeLeft.hours)}</span>
        <span className="text-gray-600 text-xl">:</span>
        <span className="text-2xl text-yellow-400">{pad(timeLeft.minutes)}</span>
        <span className="text-gray-600 text-xl">:</span>
        <span className="text-2xl text-yellow-400">{pad(timeLeft.seconds)}</span>
      </div>
      <div className="text-xs text-gray-500">
        {new Date(draftStartDate).toLocaleString(undefined, {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })}
      </div>
    </div>
  )
}

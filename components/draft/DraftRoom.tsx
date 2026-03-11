'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DraftSettings, Athlete, DraftPick, ChatMessage, WishlistItem, UserRole } from '@/types'
import { getCurrentPickInfo, getTeamForPick, getRemainingSeconds } from '@/lib/draft-logic'
import { PickTimerCountdown } from './PickTimerCountdown'
import { AvailableAthletes } from './AvailableAthletes'
import { WishlistPanel } from './WishlistPanel'
import { DraftChat } from './DraftChat'
import { DraftBoard } from './DraftBoard'
import { cn } from '@/lib/utils'
import { formatPickLabel } from '@/lib/draft-logic'
import { Trophy, Clock, Users, List, MessageSquare, BookmarkPlus } from 'lucide-react'

interface DraftRoomProps {
  initialSettings: DraftSettings
  teams: Array<{ id: string; name: string; draft_position: number | null; manager_id: string | null }>
  initialAthletes: Athlete[]
  initialPicks: Array<DraftPick & { athlete: Athlete }>
  initialMessages: ChatMessage[]
  initialWishlist: Array<WishlistItem & { athlete: Athlete }>
  userId: string
  userRole: UserRole
  userTeamId: string | null
  userName: string
}

type TabKey = 'athletes' | 'wishlist' | 'board' | 'chat'

export function DraftRoom({
  initialSettings,
  teams,
  initialAthletes,
  initialPicks,
  initialMessages,
  initialWishlist,
  userId,
  userRole,
  userTeamId,
  userName,
}: DraftRoomProps) {
  const supabase = createClient()

  const [settings, setSettings] = useState<DraftSettings>(initialSettings)
  const [athletes, setAthletes] = useState<Athlete[]>(initialAthletes)
  const [picks, setPicks] = useState<Array<DraftPick & { athlete: Athlete }>>(initialPicks)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [wishlist, setWishlist] = useState<Array<WishlistItem & { athlete: Athlete }>>(initialWishlist)
  const [activeTab, setActiveTab] = useState<TabKey>('athletes')
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  const orderedTeams = [...teams].sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
  const currentPickInfo = orderedTeams.length === 10 && settings.status === 'active'
    ? getCurrentPickInfo(settings.current_pick_number, orderedTeams as any, userTeamId)
    : null
  const isMyTurn = currentPickInfo?.is_my_turn ?? false

  // Real-time subscriptions
  useEffect(() => {
    // Draft settings changes (status, pick number, timer)
    const settingsSub = supabase
      .channel('draft-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'draft_settings' },
        (payload) => setSettings(payload.new as DraftSettings))
      .subscribe()

    // New draft picks
    const picksSub = supabase
      .channel('draft-picks')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_picks' },
        async (payload) => {
          // Fetch full pick with athlete info
          const { data } = await supabase
            .from('draft_picks')
            .select('*, athlete:athletes(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setPicks((prev) => [...prev, data as any])
            // Mark athlete as drafted
            setAthletes((prev) => prev.map((a) =>
              a.id === payload.new.athlete_id ? { ...a, is_drafted: true } : a
            ))
            // Remove from wishlist if it was there
            setWishlist((prev) => prev.filter((w) => w.athlete_id !== payload.new.athlete_id))
          }
        })
      .subscribe()

    // Chat messages
    const chatSub = supabase
      .channel('draft-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_chat_messages' },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessage]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'draft_chat_messages' },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'draft_chat_messages' },
        (payload) => setMessages((prev) => prev.map((m) =>
          m.id === payload.new.id ? { ...m, ...payload.new } : m
        )))
      .subscribe()

    // Wishlist changes
    const wishlistSub = supabase
      .channel('draft-wishlist')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'draft_wishlist', filter: `team_id=eq.${userTeamId ?? ''}` },
        async () => {
          if (!userTeamId) return
          const { data } = await supabase
            .from('draft_wishlist')
            .select('*, athlete:athletes(*)')
            .eq('team_id', userTeamId)
            .order('rank')
          if (data) setWishlist(data as any)
        })
      .subscribe()

    return () => {
      supabase.removeChannel(settingsSub)
      supabase.removeChannel(picksSub)
      supabase.removeChannel(chatSub)
      supabase.removeChannel(wishlistSub)
    }
  }, [userTeamId])

  const handlePick = useCallback(async (athleteId: string) => {
    setPicking(true)
    setPickError(null)

    const res = await fetch('/api/draft/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_id: athleteId }),
    })
    const data = await res.json()
    setPicking(false)

    if (!res.ok) setPickError(data.error)
  }, [])

  const tabs: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: 'athletes', label: 'Athletes', icon: Users },
    { key: 'wishlist', label: 'My Queue', icon: BookmarkPlus, badge: wishlist.length || undefined },
    { key: 'board', label: 'Board', icon: List },
    { key: 'chat', label: 'Chat', icon: MessageSquare, badge: messages.filter((m) => !m.is_system).length || undefined },
  ]

  const myPicks = picks.filter((p) => p.team_id === userTeamId)
  const remainingSecs = getRemainingSeconds(settings.pick_started_at, settings.pick_timer_seconds)

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4 max-w-7xl mx-auto">
      {/* Status bar */}
      <div className={cn('rounded-xl border px-5 py-3 flex items-center gap-4',
        settings.status === 'active' && isMyTurn ? 'bg-green-950/50 border-green-800' :
        settings.status === 'active' ? 'bg-gray-900 border-gray-800' :
        settings.status === 'paused' ? 'bg-yellow-950/50 border-yellow-800' :
        settings.status === 'complete' ? 'bg-blue-950/50 border-blue-800' :
        'bg-gray-900 border-gray-800'
      )}>
        {settings.status === 'active' && currentPickInfo && (
          <>
            {settings.pick_timer_seconds > 0 && (
              <PickTimerCountdown
                remainingSeconds={remainingSecs}
                totalSeconds={settings.pick_timer_seconds}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className={cn('font-bold text-lg', isMyTurn ? 'text-green-400' : 'text-white')}>
                {isMyTurn ? '🏆 YOUR TURN — ON THE CLOCK!' : `On the Clock: ${currentPickInfo.team_name}`}
              </div>
              <div className="text-sm text-gray-400">
                {formatPickLabel(settings.current_pick_number)} · {picks.length}/100 picks made
              </div>
            </div>
          </>
        )}
        {settings.status === 'paused' && (
          <div className="text-yellow-400 font-bold">⏸ Draft Paused</div>
        )}
        {settings.status === 'pending' && (
          <div className="text-gray-400">Draft has not started yet. Waiting for Commissioner.</div>
        )}
        {settings.status === 'complete' && (
          <div className="flex items-center gap-2 text-blue-400 font-bold">
            <Trophy className="w-5 h-5" />
            Draft Complete! All 100 picks have been made.
          </div>
        )}

        {/* My roster summary */}
        {userTeamId && (
          <div className="ml-auto text-right shrink-0">
            <div className="text-xs text-gray-500">My Roster</div>
            <div className="text-sm font-semibold text-white">{myPicks.length}/10 picked</div>
          </div>
        )}
      </div>

      {/* Pick error */}
      {pickError && (
        <div className="px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
          ❌ {pickError}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Mobile tabs */}
        <div className="flex border-b border-gray-800 mb-4">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors relative',
                activeTab === key
                  ? 'text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge != null && (
                <span className="bg-yellow-400 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === 'athletes' && (
            <AvailableAthletes
              athletes={athletes}
              picks={picks}
              userTeamId={userTeamId}
              isMyTurn={isMyTurn && settings.status === 'active'}
              picking={picking}
              onPick={handlePick}
              onAddToWishlist={async (athleteId: string) => {
                await fetch('/api/draft/wishlist', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ athlete_id: athleteId }),
                })
              }}
              wishlistIds={new Set(wishlist.map((w) => w.athlete_id))}
            />
          )}
          {activeTab === 'wishlist' && (
            <WishlistPanel
              wishlist={wishlist}
              setWishlist={setWishlist}
              isMyTurn={isMyTurn && settings.status === 'active'}
              picking={picking}
              onPick={handlePick}
              teamId={userTeamId}
            />
          )}
          {activeTab === 'board' && (
            <DraftBoard
              teams={orderedTeams}
              picks={picks}
              currentPickNumber={settings.current_pick_number}
              status={settings.status}
              userTeamId={userTeamId}
            />
          )}
          {activeTab === 'chat' && (
            <DraftChat
              messages={messages}
              userRole={userRole}
              userId={userId}
              userName={userName}
              draftStatus={settings.status}
            />
          )}
        </div>
      </div>
    </div>
  )
}

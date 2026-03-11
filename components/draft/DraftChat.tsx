'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatMessage, UserRole, DraftStatus } from '@/types'
import { cn, formatTime } from '@/lib/utils'
import { Send, Pin, Trash2, Loader2 } from 'lucide-react'

interface DraftChatProps {
  messages: ChatMessage[]
  userRole: UserRole
  userId: string
  userName: string
  draftStatus: DraftStatus
}

export function DraftChat({ messages, userRole, userId, userName, draftStatus }: DraftChatProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const pinnedMessage = messages.findLast((m) => m.is_pinned)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)

    await fetch('/api/draft/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text.trim() }),
    })

    setText('')
    setSending(false)
  }

  async function handleDelete(id: string) {
    await fetch('/api/draft/chat', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  async function handlePin(id: string, currentPinned: boolean) {
    await fetch('/api/draft/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_pinned: !currentPinned }),
    })
  }

  const isActive = draftStatus === 'active' || draftStatus === 'paused'

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: 'calc(100vh - 20rem)' }}>
      {/* Pinned message */}
      {pinnedMessage && (
        <div className="px-4 py-2.5 bg-yellow-950/50 border-b border-yellow-800/50 flex items-start gap-2 shrink-0">
          <Pin className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-yellow-400">📌 </span>
            <span className="text-xs text-yellow-200">{pinnedMessage.message}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 px-2 py-2">
        {messages.length === 0 ? (
          <div className="py-8 text-center text-gray-600 text-sm">
            No messages yet. Chat will be active during the draft.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('group px-3 py-2 rounded-lg text-sm', {
                'bg-gray-800/30 italic': msg.is_system,
                'bg-yellow-950/20 border border-yellow-900/30': !msg.is_system && msg.sender_role === 'commissioner',
                'hover:bg-gray-800/20': !msg.is_system,
              })}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {!msg.is_system && (
                    <span className={cn('font-semibold text-xs mr-1.5', {
                      'text-yellow-400': msg.sender_role === 'commissioner',
                      'text-blue-400': msg.sender_role === 'team_manager',
                    })}>
                      {msg.sender_name}
                    </span>
                  )}
                  <span className={cn('text-sm leading-relaxed', {
                    'text-gray-400': msg.is_system,
                    'text-white': !msg.is_system,
                  })}>
                    {msg.message}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <span className="text-xs text-gray-600">{formatTime(msg.created_at)}</span>
                  {userRole === 'commissioner' && !msg.is_system && (
                    <>
                      <button
                        onClick={() => handlePin(msg.id, msg.is_pinned)}
                        className={cn('p-1 rounded transition-colors', msg.is_pinned ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400')}
                        title="Pin message"
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors"
                        title="Delete message"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t border-gray-800 shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isActive ? 'Type a message…' : 'Chat available during draft'}
          disabled={!isActive}
          maxLength={500}
          className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || !isActive}
          className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/30 text-gray-900 rounded-lg transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  )
}

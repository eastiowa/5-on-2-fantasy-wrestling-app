'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Trophy, Lock, Mail, User, AlertCircle, Loader2, CheckCircle,
} from 'lucide-react'

interface TokenInfo {
  valid: boolean
  team_name?: string
  team_id?: string
  expires_at?: string
  reason?: string
}

export default function JoinPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string
  const supabase = createClient()

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [validating, setValidating] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Validate the token on mount
  useEffect(() => {
    fetch(`/api/invite-token/${token}`)
      .then(r => r.json())
      .then((data: TokenInfo) => { setTokenInfo(data) })
      .catch(() => setTokenInfo({ valid: false, reason: 'Could not validate invite link.' }))
      .finally(() => setValidating(false))
  }, [token])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Sign up with Supabase auth
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      // If user already exists, try to sign them in so they can still consume the token
      if (signUpError.message.toLowerCase().includes('already registered')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) {
          setError('An account with this email already exists. Please use the correct password or contact your commissioner.')
          setLoading(false)
          return
        }
        // Signed in — fall through to token consumption below
      } else {
        setError(signUpError.message)
        setLoading(false)
        return
      }
    }

    // If signUp returns a user but no session, email confirmation is required
    if (signUpData?.user && !signUpData?.session) {
      setError('Please check your email and confirm your address, then return to this link.')
      setLoading(false)
      return
    }

    // 2. Consume the invite token — assigns the user to the team
    const useRes = await fetch(`/api/invite-token/${token}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim() }),
    })

    const useData = await useRes.json()

    if (!useRes.ok) {
      setError(useData.error ?? 'Failed to complete join. The link may have already been used.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  // ── Loading / validating ──────────────────────────────────────────────────
  if (validating) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto mb-3" />
          <p className="text-gray-400">Validating invite link…</p>
        </div>
      </div>
    )
  }

  // ── Invalid token ─────────────────────────────────────────────────────────
  if (!tokenInfo?.valid) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-full max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Invite Link</h1>
          <p className="text-gray-400">{tokenInfo?.reason ?? 'This link is not valid.'}</p>
          <p className="text-gray-500 text-sm mt-3">Contact your commissioner for a new link.</p>
        </div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to the League!</h2>
          <p className="text-gray-400">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Join form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-white">Join the League</h1>
          <p className="text-gray-400 mt-2">
            You&apos;ve been invited to manage{' '}
            <span className="text-yellow-400 font-semibold">{tokenInfo.team_name}</span>
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-8">
          <form onSubmit={handleJoin} className="space-y-5">

            {/* Display name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Name / Team Alias
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Coach Miller"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Set Your Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating your account…
                </>
              ) : (
                'Create Account & Join League'
              )}
            </button>

          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          This invite link is single-use and expires{' '}
          {tokenInfo.expires_at
            ? new Date(tokenInfo.expires_at).toLocaleDateString()
            : 'soon'}.
        </p>
      </div>
    </div>
  )
}

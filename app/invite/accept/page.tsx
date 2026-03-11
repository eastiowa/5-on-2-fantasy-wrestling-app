'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trophy, Lock, User, AlertCircle, Loader2, CheckCircle } from 'lucide-react'

/**
 * Invite acceptance page — handles both auth flows:
 *   • PKCE  (default for @supabase/ssr ≥ 0.5):  ?code=xxx  in the query string
 *   • Implicit (legacy):  #access_token=xxx&type=invite  in the URL hash
 *
 * Supabase redirects the invited user here after they click the invite link.
 */

// useSearchParams() requires a Suspense boundary in Next.js App Router
export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
        </div>
      }
    >
      <InviteAcceptInner />
    </Suspense>
  )
}

function InviteAcceptInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)

  useEffect(() => {
    async function verify() {
      // ── PKCE flow: Supabase sends ?code= as a query param ─────────────────
      const code = searchParams.get('code')
      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError || !data.user) {
          setError(exchangeError?.message ?? 'Invalid or expired invite link. Please contact your Commissioner.')
        } else {
          setInviteEmail(data.user.email ?? null)
        }
        setVerifying(false)
        return
      }

      // ── Implicit flow: Supabase sends #access_token=...&type=invite ────────
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
      const accessToken = hashParams.get('access_token')
      const type = hashParams.get('type')

      if (type === 'invite' && accessToken) {
        const { data } = await supabase.auth.getUser(accessToken)
        if (!data.user) {
          setError('Invalid or expired invite link. Please contact your Commissioner.')
        } else {
          setInviteEmail(data.user.email ?? null)
        }
        setVerifying(false)
        return
      }

      // ── No token found ─────────────────────────────────────────────────────
      setError('Invalid or expired invite link. Please contact your Commissioner.')
      setVerifying(false)
    }

    verify()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // For PKCE flow the session is already set by exchangeCodeForSession above.
    // For implicit flow we need to manually set it from the hash.
    const hashParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
    )
    const hashAccessToken = hashParams.get('access_token')
    const hashRefreshToken = hashParams.get('refresh_token')
    const isImplicitFlow = !!hashAccessToken && hashParams.get('type') === 'invite'

    if (isImplicitFlow) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: hashAccessToken!,
        refresh_token: hashRefreshToken ?? '',
      })
      if (sessionError || !sessionData.user) {
        setError(sessionError?.message ?? 'Failed to verify invite.')
        setLoading(false)
        return
      }
    }

    // Update password
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setError(pwError.message)
      setLoading(false)
      return
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Session expired. Please ask the commissioner to resend the invite.')
      setLoading(false)
      return
    }

    // Update display name in profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user.id)

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  if (verifying) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto mb-3" />
          <p className="text-gray-400">Verifying your invite…</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
          <p className="text-gray-400">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-white">Set Up Your Account</h1>
          {inviteEmail && (
            <p className="text-gray-400 mt-2">
              Welcome, <span className="text-yellow-400">{inviteEmail}</span>
            </p>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-8">
          {error ? (
            <div className="flex items-start gap-3 p-4 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Invite link error</p>
                <p>{error}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSetup} className="space-y-5">
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
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Coach Miller"
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
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  'Create Account & Enter League'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

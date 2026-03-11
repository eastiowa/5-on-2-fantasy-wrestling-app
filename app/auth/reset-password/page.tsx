'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import Image from 'next/image'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // Supabase embeds the access_token in the URL hash (#access_token=...&type=recovery).
  // The client SDK picks it up automatically via onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    // Redirect to dashboard after a brief pause
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 2000)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="5 on 2 Fantasy Wrestling"
              width={80}
              height={80}
              className="rounded-xl object-contain"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-white">Set New Password</h1>
          <p className="text-gray-400 mt-2">5 on 2 Fantasy Wrestling League</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-8">

          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
              <div>
                <p className="text-white font-semibold">Password updated!</p>
                <p className="text-gray-400 text-sm mt-1">Redirecting to your dashboard…</p>
              </div>
            </div>
          ) : !sessionReady ? (
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto" />
              <p className="text-gray-400 text-sm">
                Verifying your reset link…
              </p>
              <p className="text-xs text-gray-600">
                If nothing happens, your link may have expired.{' '}
                <a href="/login" className="text-yellow-400 hover:underline">Request a new one</a>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <p className="text-sm text-gray-400">Choose a strong password for your account.</p>

              {/* New password */}
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Password strength hint */}
              {password.length > 0 && (
                <div className={`text-xs ${
                  password.length >= 8 ? 'text-green-400' : 'text-yellow-600'
                }`}>
                  {password.length >= 8
                    ? '✓ Password length OK'
                    : `${8 - password.length} more character${8 - password.length !== 1 ? 's' : ''} needed`}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
                  : 'Set New Password'}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-800 text-center">
            <a href="/login" className="text-sm text-gray-500 hover:text-yellow-400 transition-colors">
              ← Back to Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

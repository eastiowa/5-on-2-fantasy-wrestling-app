'use client'

/**
 * InviteRedirector — mounts invisibly in the root layout.
 *
 * When Supabase's invite flow cannot use a specific redirectTo URL
 * (because it isn't whitelisted in the project's URL allow list), it falls
 * back to the configured Site URL (https://5on2fantasywrestling.com).
 * That means the invited user lands on the homepage with invite tokens in
 * the URL hash (implicit flow) or a ?code= param (PKCE flow).
 * This component detects both cases and forwards to /invite/accept.
 *
 * Additionally, when detectSessionInUrl already processes the hash before
 * React mounts, the user is signed in but the hash is gone. In that case
 * the /invite/accept page's getSession() check handles it directly.
 */

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function InviteRedirector() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only intercept on the root/home page — not already on /invite/accept
    if (pathname !== '/') return

    // ── Implicit flow: #access_token=...&type=invite in hash ──────────────
    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const type = params.get('type')
      const accessToken = params.get('access_token')
      if ((type === 'invite' || type === 'signup') && accessToken) {
        router.replace(`/invite/accept${hash}`)
        return
      }
    }

    // ── PKCE flow: ?code= in query string from invite redirect ────────────
    // Supabase appends ?code= when the project uses PKCE flow and the
    // redirect_to isn't whitelisted (falls back to Site URL with ?code=).
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    if (code) {
      router.replace(`/invite/accept?code=${encodeURIComponent(code)}`)
    }
  }, [router, pathname])

  return null
}

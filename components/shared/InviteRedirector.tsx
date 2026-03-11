'use client'

/**
 * InviteRedirector — mounts invisibly in the root layout.
 *
 * When Supabase's invite flow cannot use a specific redirectTo URL
 * (because it isn't whitelisted in the project's URL allow list), it falls
 * back to the configured Site URL (e.g. https://5on2fantasywrestling.com).
 * That means the invited user lands on the homepage with invite tokens in
 * the URL hash.  This component detects those tokens and forwards the user
 * to /invite/accept so the onboarding flow can complete.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function InviteRedirector() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const type = params.get('type')
    const accessToken = params.get('access_token')

    // Only intercept invite-type hash tokens — not password resets, sign-ins, etc.
    if (type === 'invite' && accessToken) {
      // Preserve the full hash so /invite/accept can read the tokens
      router.replace(`/invite/accept${hash}`)
    }
  }, [router])

  return null
}

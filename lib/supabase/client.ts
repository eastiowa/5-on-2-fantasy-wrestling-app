import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Use implicit flow so admin-generated invite links (which carry
        // #access_token= hash params) are handled correctly without needing
        // a PKCE code_verifier that was never generated in this browser session.
        flowType: 'implicit',
      },
    }
  )
}

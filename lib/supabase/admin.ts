import { createClient } from '@supabase/supabase-js'

/**
 * Admin Supabase client — uses the SERVICE ROLE key.
 * This bypasses Row Level Security (RLS).
 *
 * ONLY use this in server-side API routes, never expose it to the client.
 * Always verify the caller's role with the regular session client first,
 * then use this client only for the privileged operation.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in your environment variables.
 * Add it to Vercel: Settings → Environment Variables → SUPABASE_SERVICE_ROLE_KEY
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase session refresh middleware.
 *
 * Required for Supabase SSR auth to work correctly in Next.js App Router:
 *   • Refreshes the access token on every request so server components always
 *     receive a valid session.
 *   • Sets the refreshed token cookies on the response so the browser stays
 *     in sync.
 *
 * Without this middleware, server components calling `supabase.auth.getUser()`
 * can see a stale or missing session even when the user is logged in.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // First, write updated cookies back onto the request so subsequent
          // server-side reads see the refreshed values.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Then write them onto the response so the browser saves them.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session (validates + rotates the token if needed).
  // Do NOT use getSession() here — getUser() makes a server-side call to verify
  // the JWT rather than relying on the potentially stale cookie value.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico
     *   - image / font files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}

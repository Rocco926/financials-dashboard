/**
 * Next.js middleware — route-level authentication guard.
 *
 * WHAT THIS DOES
 * ──────────────
 * This file runs on EVERY request that matches the `config.matcher` pattern
 * (everything except Next.js static assets and images). It checks whether
 * the request has a valid NextAuth session and redirects accordingly.
 *
 * ROUTING LOGIC
 * ─────────────
 * Three cases:
 *
 *   1. /api/auth/* routes → always pass through.
 *      These are NextAuth's own API handlers (sign in, sign out, session check).
 *      They must never be blocked by the auth guard or login will break.
 *
 *   2. Logged in + visiting /login → redirect to /.
 *      Prevents an already-authenticated user from seeing the login page.
 *
 *   3. Not logged in + visiting any other route → redirect to /login.
 *      The core protection: unauthenticated users see nothing except /login.
 *
 *   4. Any other case → pass through (logged in, accessing a normal page).
 *
 * HOW IT WORKS WITH NEXTAUTH v5
 * ──────────────────────────────
 * We export NextAuth's `auth` function as the default middleware. When used
 * this way, `auth` wraps our callback and provides `req.auth` (the session
 * object, or null if not authenticated). This is the recommended NextAuth v5
 * middleware pattern — it's equivalent to calling `getServerSession()` but
 * runs in the Edge runtime on every request.
 *
 * MATCHER
 * ───────
 * The regex `/((?!_next/static|_next/image|favicon.ico).*)` matches all paths
 * EXCEPT Next.js's built-in static asset paths. This ensures the middleware
 * doesn't run unnecessarily on bundled JS, CSS, and image files.
 *
 * API ROUTES ARE ALSO PROTECTED
 * ──────────────────────────────
 * Importantly, /api/import, /api/transactions, /api/accounts, etc. all match
 * the pattern and are checked here. This means the auth guards in the route
 * handlers themselves (the `const session = await auth()` checks) are a
 * second layer of defence — the middleware should catch unauthenticated
 * API requests before they even reach the handler.
 */
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn  = !!req.auth                                          // Session exists
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login')           // /login page
  const isApiAuth   = req.nextUrl.pathname.startsWith('/api/auth')        // NextAuth API routes

  // Case 1: NextAuth API routes — always allow through
  if (isApiAuth) return NextResponse.next()

  // Case 2: Already logged in, trying to visit /login → go to dashboard
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }

  // Case 3: Not logged in, visiting a protected route → go to login
  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  // Case 4: Logged in, visiting any non-login route → allow through
  return NextResponse.next()
})

export const config = {
  /**
   * Runs middleware on all paths EXCEPT:
   *   _next/static  — bundled JS, CSS files
   *   _next/image   — Next.js image optimisation API
   *   favicon.ico   — browser favicon request
   *
   * The negative lookahead (?!...) syntax means "match everything that
   * does NOT start with these patterns".
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

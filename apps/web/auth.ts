/**
 * NextAuth v5 configuration — authentication for the finance dashboard.
 *
 * AUTHENTICATION APPROACH
 * ────────────────────────
 * This is a single-user personal app, so we use the simplest possible auth:
 * username + password stored in environment variables. There's no database
 * user table, no registration, no password reset flow.
 *
 * The user's password is stored as a bcrypt hash in ADMIN_PASSWORD. To set
 * it up, run `pnpm hash-password` and copy the output into your .env file.
 *
 * NEXTAUTH v5 API
 * ────────────────
 * NextAuth v5 exports four named exports from a single config call:
 *
 *   handlers  → { GET, POST } for the [...nextauth] API route
 *   auth      → function to get the current session anywhere (Server Components, routes)
 *   signIn    → programmatic sign-in (used by the middleware)
 *   signOut   → programmatic sign-out (used by the Nav component)
 *
 * HOW IT FITS TOGETHER
 * ──────────────────────
 * 1. User visits any protected page → middleware.ts calls auth() → no session → redirect to /login
 * 2. User submits /login form → next-auth/react's signIn('credentials', ...) is called
 * 3. NextAuth calls the `authorize` function below with the submitted credentials
 * 4. We validate email + bcrypt-compare password → return user object or null
 * 5. NextAuth creates a JWT session stored in an httpOnly cookie
 * 6. Subsequent requests → middleware reads the JWT from the cookie → session exists → allow through
 *
 * SESSION STRATEGY
 * ─────────────────
 * We use JWT sessions (not database sessions). This means no session table is
 * needed in Supabase — the session is self-contained in a signed cookie.
 * This is appropriate for a single-user app with no need to manage or revoke
 * multiple sessions.
 */
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

/**
 * Validates the shape of the credentials form submission.
 * Using Zod here ensures we get proper TypeScript types and clean validation
 * rather than checking `typeof credentials?.email === 'string'` manually.
 */
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      /**
       * These `credentials` fields define what the auto-generated login form
       * would look like (we don't use the auto-generated form — we have our
       * own /login/page.tsx). They're also used by next-auth/react's signIn()
       * to know what fields to send.
       */
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      /**
       * The authorize function is called by NextAuth when the user submits
       * their credentials (via the signIn('credentials', ...) call in /login).
       *
       * Return a user object → login succeeds → session created.
       * Return null → login fails → NextAuth shows an error.
       * Never throw — throwing would expose server errors to the client.
       *
       * @param credentials - Form values submitted (typed as unknown by NextAuth)
       */
      async authorize(credentials) {
        // Validate that credentials has the expected shape
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        // Load expected values from environment
        const adminEmail = process.env['ADMIN_EMAIL']
        const adminHash  = process.env['ADMIN_PASSWORD']

        // Both must be configured — fail clearly if not
        if (!adminEmail || !adminHash) {
          console.error(
            'Auth misconfigured: ADMIN_EMAIL or ADMIN_PASSWORD env vars are missing. ' +
              'Run `pnpm hash-password` to generate a password hash.',
          )
          return null
        }

        // Check email first (fast, no crypto needed)
        if (email !== adminEmail) return null

        // bcrypt.compare is timing-safe — it always takes the same time
        // whether the password matches or not, preventing timing attacks.
        const valid = await bcrypt.compare(password, adminHash)
        if (!valid) return null

        // Return the user object that gets stored in the JWT session.
        // For a single-user app this is minimal — we just need something non-null.
        return { id: '1', email, name: 'Admin' }
      },
    }),
  ],

  /**
   * Override the default NextAuth login page URL.
   * Without this, NextAuth would render its own auto-generated form at /api/auth/signin.
   * We redirect to our custom /login page instead.
   */
  pages: {
    signIn: '/login',
  },

  /**
   * Use JWT-based sessions (stored in a signed cookie) rather than database sessions.
   * This requires no database session table and is appropriate for a single-user app.
   */
  session: {
    strategy: 'jwt',
  },
})

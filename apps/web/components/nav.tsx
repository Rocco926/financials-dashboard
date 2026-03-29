/**
 * Nav — the left-hand sidebar navigation.
 *
 * WHAT IT RENDERS
 * ────────────────
 * A fixed-width (224px / w-56) sidebar containing:
 *   - App title and subtitle at the top
 *   - Navigation links to the four main pages
 *   - A "Sign out" button at the bottom
 *
 * ACTIVE STATE
 * ─────────────
 * The currently active link is highlighted with a gray background.
 * We use `usePathname()` (Next.js hook) to compare each link's href
 * against the current URL path.
 *
 * SIGN OUT
 * ─────────
 * Calls next-auth/react's `signOut()` with `callbackUrl: '/login'` so
 * the user is redirected to the login page after their session is cleared.
 * This is a client-side call — it POSTs to /api/auth/signout internally.
 *
 * CLIENT COMPONENT
 * ─────────────────
 * Must be 'use client' because it uses:
 *   - usePathname() — reads the current URL client-side
 *   - onClick on the sign-out button — event handler
 *
 * The parent layout (app/layout.tsx) is a Server Component that conditionally
 * renders this Nav only when the user is authenticated. Unauthenticated users
 * (on the /login page) see no sidebar.
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Upload, List, Target, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'

/**
 * The four navigation destinations.
 * - href: the Next.js route path
 * - label: displayed text
 * - icon: Lucide React icon component
 */
const links = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/import',       label: 'Import',       icon: Upload          },
  { href: '/transactions', label: 'Transactions', icon: List            },
  { href: '/budgets',      label: 'Budgets',      icon: Target          },
]

/** Renders the left sidebar navigation. No props — reads state from URL and auth. */
export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0">
      {/* App header */}
      <div className="p-5 border-b border-gray-200">
        <h1 className="font-semibold text-base text-gray-900">Finance</h1>
        <p className="text-xs text-gray-500 mt-0.5">Personal dashboard</p>
      </div>

      {/* Navigation links */}
      <ul className="p-3 flex-1 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                // Active: darker background, full weight text
                pathname === href
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  // Inactive: subtle text, hover effect
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      {/* Sign out button — pinned to bottom of sidebar */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 w-full transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </nav>
  )
}

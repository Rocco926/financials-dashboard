/**
 * PeriodSelector — time period filter buttons for the dashboard.
 *
 * WHAT IT RENDERS
 * ────────────────
 * A pill-style button group with four options:
 *   "This month" / "3 months" / "12 months" / "All time"
 *
 * The currently selected period is highlighted with a white pill + shadow.
 *
 * HOW IT WORKS
 * ─────────────
 * The selected period is stored as a `?period=` URL search parameter
 * (e.g. /  or /?period=3months). This means:
 *
 *   1. The selection survives page refresh.
 *   2. The dashboard Server Component reads `searchParams.period` and
 *      passes it to getPeriodDates() to build the date range for DB queries.
 *   3. Clicking a period button calls router.push() to update the URL,
 *      which triggers a Server Component re-render with the new date range.
 *
 * WHY URL STATE INSTEAD OF LOCAL STATE?
 * ──────────────────────────────────────
 * Using the URL for filter state means:
 *   - Server Components can read the filter without client-side fetching
 *   - The user can bookmark a specific period view
 *   - Browser back/forward works as expected
 *
 * CLIENT COMPONENT
 * ─────────────────
 * Must be 'use client' because it uses useRouter, useSearchParams, and usePathname.
 * Wrapped in <Suspense> in the parent page because useSearchParams() requires it
 * in Next.js App Router.
 */
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** The four available time period options */
const PERIODS = [
  { value: 'month',    label: 'This month' },
  { value: '3months',  label: '3 months'   },
  { value: '12months', label: '12 months'  },
  { value: 'all',      label: 'All time'   },
] as const

/**
 * Renders the period selection button group.
 *
 * Reads the current period from `?period=` search param (defaults to 'month').
 * Clicking a button updates the URL param, triggering a server-side re-render.
 */
export function PeriodSelector() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const current      = searchParams.get('period') ?? 'month'

  /**
   * Updates the ?period= search param while preserving any other params.
   * Uses `new URLSearchParams(searchParams.toString())` to clone existing params
   * so we don't accidentally drop other filters if any are added in the future.
   */
  function setPeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setPeriod(value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            // Active state: white background with shadow (pill effect)
            current === value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

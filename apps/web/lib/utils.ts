/**
 * Shared utility functions used across the web app.
 *
 * These are pure functions with no side effects — no DB calls, no API calls.
 * They can be used in both Server Components and Client Components.
 */
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ─── CSS class merging ────────────────────────────────────────────────────────

/**
 * Merges Tailwind CSS class names, resolving conflicts correctly.
 *
 * WHY BOTH clsx AND tailwind-merge?
 * ──────────────────────────────────
 * - `clsx` handles conditional class application:
 *     cn('base', condition && 'conditional', { 'another': flag })
 * - `tailwind-merge` resolves Tailwind conflicts:
 *     cn('px-2 px-4') → 'px-4'  (later value wins, not 'px-2 px-4')
 *     cn('text-red-500 text-blue-500') → 'text-blue-500'
 *
 * Without tailwind-merge, conflicting classes would both be in the string
 * and the browser would apply whichever appears last in the CSS file,
 * which may not be the one you passed last.
 *
 * @example
 *   cn('px-4 py-2', isActive && 'bg-blue-500', !isActive && 'bg-gray-100')
 *   cn('text-sm', className)  // in a component that accepts a className prop
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency formatting ──────────────────────────────────────────────────────

/**
 * Formats a number as Australian dollars.
 *
 * Uses the browser's built-in Intl.NumberFormat which handles:
 *   - Thousands separators: 1234.56 → "$1,234.56"
 *   - Negative amounts: -45.5 → "-$45.50"
 *   - Zero: 0 → "$0.00"
 *
 * IMPORTANT: Drizzle returns numeric columns as strings, not numbers.
 * This function accepts both so callers don't need to call parseFloat() first:
 *   formatCurrency(tx.amount)           // tx.amount is string from Drizzle
 *   formatCurrency(parseFloat(str))     // also fine
 *
 * @param amount - A numeric value or its string representation
 * @returns      - Formatted AUD string e.g. "$1,234.56" or "-$45.50"
 */
export function formatCurrency(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(n)
}

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Formats a date as a human-readable string in Australian style.
 *
 * Output format: "29 Mar 2024" (day month year, abbreviated month)
 *
 * WHY THE `+ 'T00:00:00'` SUFFIX?
 * ─────────────────────────────────
 * Drizzle returns `date` columns as strings in "YYYY-MM-DD" format.
 * If you pass "2024-03-29" directly to `new Date()`, the browser interprets
 * it as UTC midnight, which can shift the displayed date by one day for
 * users in timezones ahead of UTC (e.g. AEST = UTC+10).
 *
 * Appending 'T00:00:00' (no timezone) makes the Date constructor treat it
 * as LOCAL time midnight instead, so "2024-03-29" always displays as
 * "29 Mar 2024" regardless of the user's timezone.
 *
 * @param value - A YYYY-MM-DD date string (from Drizzle) or a Date object
 * @returns     - Formatted string e.g. "29 Mar 2024"
 */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value + 'T00:00:00') : value
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

// ─── Dashboard period dates ───────────────────────────────────────────────────

/**
 * Converts a named time period into a date range for database queries.
 *
 * PERIODS
 * ───────
 *   'month'    → From 1st of the current calendar month to today.
 *                Resets on the 1st — consistent with how budgets are tracked.
 *   '3months'  → From 3 months ago to today.
 *   '12months' → From 12 months ago to today (a rolling year, not a calendar year).
 *   'all'      → From year 2000 to today (effectively all time).
 *
 * Both `from` and `to` are returned as YYYY-MM-DD strings because that's what
 * Drizzle's `date` column comparisons expect (gte/lte with string values).
 *
 * The period is passed as a URL search param (e.g. ?period=3months) and
 * read server-side in the dashboard page component.
 *
 * @param period - One of: 'month', '3months', '12months', 'all' (defaults to 'month')
 * @returns      - { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *
 * @example
 *   // Called 2024-03-29:
 *   getPeriodDates('month')    // → { from: '2024-03-01', to: '2024-03-29' }
 *   getPeriodDates('3months')  // → { from: '2023-12-29', to: '2024-03-29' }
 *   getPeriodDates('12months') // → { from: '2023-03-29', to: '2024-03-29' }
 */
export function getPeriodDates(period: string): { from: string; to: string } {
  const now   = new Date()
  const toStr = now.toISOString().split('T')[0]!  // Today as YYYY-MM-DD

  switch (period) {
    case 'month': {
      // setDate(1) resets to the 1st of the current month
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: from.toISOString().split('T')[0]!, to: toStr }
    }

    case '3months': {
      const from = new Date(now)
      from.setMonth(from.getMonth() - 3)
      return { from: from.toISOString().split('T')[0]!, to: toStr }
    }

    case '12months': {
      const from = new Date(now)
      from.setFullYear(from.getFullYear() - 1)
      return { from: from.toISOString().split('T')[0]!, to: toStr }
    }

    case 'all':
    default:
      // Year 2000 is far enough back to capture any realistic bank history.
      // Using a fixed past date is simpler than querying for the oldest transaction.
      return { from: '2000-01-01', to: toStr }
  }
}

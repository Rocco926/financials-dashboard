import { db } from '@/lib/db'
import { transactions, categories } from '@/lib/db'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { getPeriodDates } from '@/lib/utils'
import { CategoriseClient } from './categorise-client'
import { CategoriseRangeSelector } from './range-selector'

export type MerchantGroup = {
  /** Normalised description — the key used by bulk-categorise. */
  pattern: string
  /** A representative raw description for display. */
  displayDescription: string
  /** Cleaned merchant name if one exists, otherwise null. */
  displayMerchant: string | null
  /** Uncategorised count within the active date filter (or all-time if no filter). */
  uncategorisedCount: number
  /** Total transactions across all time with this description. */
  totalCount: number
  /** Most recent transaction date (YYYY-MM-DD), all-time. */
  lastDate: string
}

interface PageProps {
  searchParams: { range?: string; from?: string; to?: string }
}

const RANGE_LABELS: Record<string, string> = {
  '30days':  'last 30 days',
  '3months': 'last 3 months',
  '6months': 'last 6 months',
  'year':    'this year',
}

async function getMerchantGroups(from: string | null, to: string | null): Promise<MerchantGroup[]> {
  // Build the uncategorised condition — date-scoped when a filter is active.
  const uncatFilter =
    from && to
      ? sql`${transactions.category} is null AND ${transactions.date} >= ${from} AND ${transactions.date} <= ${to}`
      : sql`${transactions.category} is null`

  const rows = await db
    .select({
      pattern:            sql<string>`upper(trim(${transactions.description}))`,
      displayDescription: sql<string>`min(${transactions.description})`,
      displayMerchant:    sql<string | null>`min(${transactions.merchant})`,
      uncategorisedCount: sql<number>`count(*) filter (where ${uncatFilter})::int`,
      totalCount:         sql<number>`count(*)::int`,
      lastDate:           sql<string>`max(${transactions.date})`,
    })
    .from(transactions)
    .groupBy(sql`upper(trim(${transactions.description}))`)
    .having(sql`count(*) filter (where ${uncatFilter}) > 0`)
    .orderBy(
      sql`count(*) filter (where ${uncatFilter}) desc`,
      sql`max(${transactions.date}) desc`,
    )
    .limit(500)

  return rows
}

async function getCategories() {
  return db
    .select({ name: categories.name, colour: categories.colour })
    .from(categories)
    .orderBy(categories.name)
}

export default async function CategorisePage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect('/login')

  const range = searchParams.range ?? 'all'
  const isFiltered = range !== 'all'

  // Compute date bounds server-side — guarantees the query and the API call
  // use the same dates without the client having to recalculate them.
  let fromParam: string | null = null
  let toParam:   string | null = null

  if (range === 'custom') {
    // Custom range: from/to come directly from URL params set by the picker.
    fromParam = searchParams.from ?? null
    toParam   = searchParams.to   ?? null
  } else if (isFiltered) {
    const dates = getPeriodDates(range)
    fromParam = dates.from
    toParam   = dates.to
  }

  const [groups, allCategories] = await Promise.all([
    getMerchantGroups(fromParam, toParam),
    getCategories(),
  ])

  const totalUncategorised = groups.reduce((sum, g) => sum + g.uncategorisedCount, 0)
  const rangeLabel = isFiltered
    ? range === 'custom'
      ? fromParam && toParam ? `${fromParam} – ${toParam}` : 'custom range'
      : RANGE_LABELS[range] ?? range
    : null

  return (
    <div>

      {/* Header */}
      <header className="flex justify-between items-baseline mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Categorise Merchants</h1>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-sm font-medium text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Transactions</span>
        </Link>
      </header>

      {/* Sub-header row: stats + range selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-2 text-secondary text-sm font-medium">
          <span>{groups.length} merchant{groups.length !== 1 ? 's' : ''}</span>
          <span className="w-1 h-1 rounded-full bg-secondary/30" />
          <span>{totalUncategorised.toLocaleString()} uncategorised</span>
          {rangeLabel && (
            <>
              <span className="w-1 h-1 rounded-full bg-secondary/30" />
              <span>{rangeLabel}</span>
            </>
          )}
        </div>
        <Suspense>
          <CategoriseRangeSelector />
        </Suspense>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-ambient px-6 py-16 text-center">
          <p className="text-sm font-medium text-on-surface">All caught up!</p>
          <p className="text-xs text-secondary mt-1">
            {rangeLabel
              ? `No uncategorised transactions in the ${rangeLabel}.`
              : 'Every transaction has a category.'}
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:text-primary-dim transition-colors"
          >
            Back to transactions →
          </Link>
        </div>
      ) : (
        <CategoriseClient
          groups={groups}
          categories={allCategories}
          from={fromParam ?? undefined}
          to={toParam ?? undefined}
        />
      )}
    </div>
  )
}

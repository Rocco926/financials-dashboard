import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db, transactions, categories } from '@/lib/db'
import { and, gte, lte, eq, sql } from 'drizzle-orm'
import { AnalyticsClient, type AnalyticsPeriod } from './analytics-client'

const VALID_PERIODS: AnalyticsPeriod[] = ['this_month', '3_months', '6_months', 'this_year']

function getPeriodDates(period: AnalyticsPeriod): { from: string; to: string } {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)

  if (period === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { from, to: today }
  }
  if (period === '3_months') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    return { from: d.toISOString().slice(0, 10), to: today }
  }
  if (period === '6_months') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 6)
    return { from: d.toISOString().slice(0, 10), to: today }
  }
  // this_year
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  return { from, to: today }
}

async function getAnalyticsData(period: AnalyticsPeriod) {
  const { from, to } = getPeriodDates(period)

  const transferSubquery = sql`(SELECT name FROM ${categories} WHERE is_transfer = true)`

  const categoryRows = await db
    .select({
      name:   sql<string>`COALESCE(${transactions.category}, 'Uncategorised')`,
      colour: categories.colour,
      total:  sql<string>`ABS(SUM(${transactions.amount}::numeric))`,
      count:  sql<string>`COUNT(*)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category, categories.name))
    .where(and(
      gte(transactions.date, from),
      lte(transactions.date, to),
      sql`${transactions.amount}::numeric < 0`,
      sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
    ))
    .groupBy(transactions.category, categories.colour)
    .orderBy(sql`ABS(SUM(${transactions.amount}::numeric)) DESC`)
    .limit(15)

  const rows = categoryRows.map((r) => ({
    name:   r.name,
    colour: r.colour ?? '#6b7280',
    total:  parseFloat(r.total),
    count:  parseInt(r.count, 10),
  }))

  const totalSpent = rows.reduce((s, r) => s + r.total, 0)
  const topCategory = rows[0] ?? null

  // Days in period for avg/day
  const fromDate = new Date(from)
  const toDate   = new Date(to)
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000))

  return { rows, totalSpent, topCategory, days, from, to }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; category?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const params = await searchParams

  const period: AnalyticsPeriod = VALID_PERIODS.includes(params.period as AnalyticsPeriod)
    ? (params.period as AnalyticsPeriod)
    : 'this_month'

  const { rows, totalSpent, topCategory, days, from, to } = await getAnalyticsData(period)

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Spend Analytics</h2>
        <p className="text-sm text-secondary mt-1">Understand exactly where your money goes.</p>
      </div>

      <AnalyticsClient
        rows={rows}
        totalSpent={totalSpent}
        topCategory={topCategory}
        avgPerDay={days > 0 ? totalSpent / days : 0}
        period={period}
        from={from}
        to={to}
        initialCategory={params.category ?? null}
      />
    </>
  )
}

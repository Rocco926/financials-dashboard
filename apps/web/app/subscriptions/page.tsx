import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db, transactions, categories } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { SubscriptionsClient } from './subscriptions-client'

export interface DetectedSubscription {
  merchant:      string
  category:      string | null
  colour:        string | null
  avgAmount:     number
  frequency:     'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual'
  frequencyDays: number
  count:         number
  firstSeen:     string
  lastSeen:      string
  nextExpected:  string
  monthlyEquiv:  number
}

const MONTHLY_EQUIV: Record<DetectedSubscription['frequency'], number> = {
  weekly:      52 / 12,
  fortnightly: 26 / 12,
  monthly:     1,
  quarterly:   1 / 3,
  annual:      1 / 12,
}

function classifyFrequency(avgGapDays: number): DetectedSubscription['frequency'] | null {
  if (avgGapDays >= 5   && avgGapDays <= 9)   return 'weekly'
  if (avgGapDays >= 10  && avgGapDays <= 18)  return 'fortnightly'
  if (avgGapDays >= 22  && avgGapDays <= 38)  return 'monthly'
  if (avgGapDays >= 75  && avgGapDays <= 105) return 'quarterly'
  if (avgGapDays >= 330 && avgGapDays <= 400) return 'annual'
  return null
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

async function detectSubscriptions(): Promise<DetectedSubscription[]> {
  const transferSubquery = sql`(SELECT name FROM ${categories} WHERE is_transfer = true)`

  const rows = await db.execute(sql`
    SELECT
      COALESCE(${transactions.merchant}, ${transactions.description}) AS merchant,
      ${transactions.category}                                         AS category,
      COUNT(*)                                                         AS txn_count,
      AVG(ABS(${transactions.amount}::numeric))                        AS avg_amount,
      MIN(${transactions.date}::date)                                  AS first_seen,
      MAX(${transactions.date}::date)                                  AS last_seen,
      CASE
        WHEN COUNT(*) > 1
        THEN (
          EXTRACT(epoch FROM (MAX(${transactions.date}::date) - MIN(${transactions.date}::date)) * INTERVAL '1 day')
          / 86400.0
          / NULLIF(COUNT(*) - 1, 0)
        )
        ELSE NULL
      END AS avg_gap_days,
      array_agg(${transactions.date}::date ORDER BY ${transactions.date}::date) AS all_dates
    FROM ${transactions}
    WHERE ${transactions.amount}::numeric < 0
      AND (
        ${transactions.category} IS NULL
        OR ${transactions.category} NOT IN ${transferSubquery}
      )
    GROUP BY
      COALESCE(${transactions.merchant}, ${transactions.description}),
      ${transactions.category}
    HAVING COUNT(*) >= 2
    ORDER BY avg_amount DESC
    LIMIT 200
  `)

  const cats = await db.select({ name: categories.name, colour: categories.colour }).from(categories)
  const colourMap = Object.fromEntries(cats.map((c) => [c.name, c.colour]))

  const results: DetectedSubscription[] = []

  for (const row of rows as unknown as Array<{
    merchant:     string
    category:     string | null
    txn_count:    string
    avg_amount:   string
    first_seen:   string
    last_seen:    string
    avg_gap_days: string | null
    all_dates:    string[]
  }>) {
    const avgGap = row.avg_gap_days != null ? parseFloat(row.avg_gap_days) : null
    if (avgGap == null) continue

    const frequency = classifyFrequency(avgGap)
    if (!frequency) continue

    const dates   = row.all_dates
    const lastGap = dates.length >= 2
      ? (new Date(dates[dates.length - 1]!).getTime() - new Date(dates[dates.length - 2]!).getTime()) / 86_400_000
      : avgGap
    const nextExpected = addDays(row.last_seen, Math.min(lastGap, avgGap * 1.5))

    const avgAmount  = parseFloat(row.avg_amount)
    const multiplier = MONTHLY_EQUIV[frequency]

    results.push({
      merchant:     row.merchant,
      category:     row.category,
      colour:       row.category ? (colourMap[row.category] ?? null) : null,
      avgAmount,
      frequency,
      frequencyDays: Math.round(avgGap),
      count:        parseInt(row.txn_count, 10),
      firstSeen:    row.first_seen,
      lastSeen:     row.last_seen,
      nextExpected,
      monthlyEquiv: avgAmount * multiplier,
    })
  }

  return results
}

export default async function SubscriptionsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const subscriptions = await detectSubscriptions()
  const totalMonthly  = subscriptions.reduce((s, r) => s + r.monthlyEquiv, 0)

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Recurring</h2>
        <p className="text-sm text-secondary mt-1">Subscriptions and repeat expenses detected from your transactions.</p>
      </div>

      <SubscriptionsClient
        subscriptions={subscriptions}
        totalMonthly={totalMonthly}
      />
    </>
  )
}

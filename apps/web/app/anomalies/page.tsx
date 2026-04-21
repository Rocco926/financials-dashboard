import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db, transactions, categories } from '@/lib/db'
import { and, gte, lte, sql } from 'drizzle-orm'
import { AnomaliesClient } from './anomalies-client'

export interface Anomaly {
  txId:     string
  date:     string
  merchant: string
  category: string | null
  colour:   string | null
  amount:   number
  reason:   string
  severity: 'low' | 'medium' | 'high'
}

interface CategoryStats {
  mean:   number
  stddev: number
}

async function detectAnomalies(): Promise<Anomaly[]> {
  const today      = new Date()
  const thirtyAgo  = new Date(today); thirtyAgo.setDate(today.getDate() - 30)
  const sixMoAgo   = new Date(today); sixMoAgo.setMonth(today.getMonth() - 6)

  const recentFrom   = thirtyAgo.toISOString().slice(0, 10)
  const baselineFrom = sixMoAgo.toISOString().slice(0, 10)
  const todayStr     = today.toISOString().slice(0, 10)

  const transferSubquery = sql`(SELECT name FROM ${categories} WHERE is_transfer = true)`

  // Run independent queries in parallel: stats, merchant counts, category colours
  const [statsRows, merchantCounts, cats, recent] = await Promise.all([
    // Per-category stats over the last 6 months (baseline)
    db.execute(sql`
      SELECT
        COALESCE(${transactions.category}, 'Uncategorised') AS category,
        AVG(ABS(${transactions.amount}::numeric))           AS mean,
        STDDEV(ABS(${transactions.amount}::numeric))        AS stddev,
        COUNT(*)                                            AS cnt
      FROM ${transactions}
      WHERE ${transactions.amount}::numeric < 0
        AND ${transactions.date}::date >= ${baselineFrom}::date
        AND ${transactions.date}::date <= ${todayStr}::date
        AND (
          ${transactions.category} IS NULL
          OR ${transactions.category} NOT IN ${transferSubquery}
        )
      GROUP BY COALESCE(${transactions.category}, 'Uncategorised')
      HAVING COUNT(*) >= 3
    `),

    // All-time merchant appearance counts for new-merchant detection (capped at 5 000 merchants)
    db.execute(sql`
      SELECT
        COALESCE(${transactions.merchant}, ${transactions.description}) AS merchant,
        COUNT(*) AS cnt
      FROM ${transactions}
      WHERE ${transactions.amount}::numeric < 0
      GROUP BY COALESCE(${transactions.merchant}, ${transactions.description})
      LIMIT 5000
    `),

    // Category colours
    db.select({ name: categories.name, colour: categories.colour }).from(categories),

    // Recent transactions to scan (last 30 days)
    db
      .select({
        id:       transactions.id,
        date:     transactions.date,
        merchant: sql<string>`COALESCE(${transactions.merchant}, ${transactions.description})`,
        category: transactions.category,
        amount:   transactions.amount,
      })
      .from(transactions)
      .where(and(
        gte(transactions.date, recentFrom),
        lte(transactions.date, todayStr),
        sql`${transactions.amount}::numeric < 0`,
        sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
      ))
      .orderBy(sql`${transactions.date}::date DESC`),
  ])

  const statsMap: Record<string, CategoryStats> = {}
  for (const r of statsRows as unknown as Array<{
    category: string; mean: string; stddev: string | null
  }>) {
    statsMap[r.category] = {
      mean:   parseFloat(r.mean),
      stddev: r.stddev != null ? parseFloat(r.stddev) : 0,
    }
  }

  const merchantCountMap: Record<string, number> = {}
  for (const r of merchantCounts as unknown as Array<{ merchant: string; cnt: string }>) {
    merchantCountMap[r.merchant] = parseInt(r.cnt, 10)
  }

  const colourMap = Object.fromEntries(cats.map((c) => [c.name, c.colour]))

  const anomalies: Anomaly[] = []

  for (const tx of recent) {
    const absAmount = Math.abs(parseFloat(String(tx.amount)))
    const catKey    = tx.category ?? 'Uncategorised'
    const stats     = statsMap[catKey]
    const mCount    = merchantCountMap[tx.merchant] ?? 1

    // Rule 1: unusually large vs category baseline (z-score ≥ 2.0, stddev > 0)
    if (stats && stats.stddev > 0) {
      const zScore = (absAmount - stats.mean) / stats.stddev
      if (zScore >= 2.0) {
        const multiplier = (absAmount / stats.mean).toFixed(1)
        const severity: Anomaly['severity'] = zScore >= 3.5 ? 'high' : zScore >= 2.5 ? 'medium' : 'low'
        anomalies.push({
          txId:     tx.id,
          date:     tx.date,
          merchant: tx.merchant,
          category: tx.category,
          colour:   tx.category ? (colourMap[tx.category] ?? null) : null,
          amount:   absAmount,
          reason:   `${multiplier}× your usual ${catKey} spend (avg $${stats.mean.toFixed(0)})`,
          severity,
        })
        continue
      }
    }

    // Rule 2: first-time merchant with amount ≥ $80
    if (mCount === 1 && absAmount >= 80) {
      anomalies.push({
        txId:     tx.id,
        date:     tx.date,
        merchant: tx.merchant,
        category: tx.category,
        colour:   tx.category ? (colourMap[tx.category] ?? null) : null,
        amount:   absAmount,
        reason:   'First time seeing this merchant',
        severity: absAmount >= 500 ? 'high' : absAmount >= 200 ? 'medium' : 'low',
      })
      continue
    }

    // Rule 3: very large transaction (≥ $1 000) with no baseline
    if (absAmount >= 1000 && (!stats || stats.stddev === 0)) {
      anomalies.push({
        txId:     tx.id,
        date:     tx.date,
        merchant: tx.merchant,
        category: tx.category,
        colour:   tx.category ? (colourMap[tx.category] ?? null) : null,
        amount:   absAmount,
        reason:   'Unusually large transaction',
        severity: absAmount >= 3000 ? 'high' : 'medium',
      })
    }
  }

  const ORDER = { high: 0, medium: 1, low: 2 }
  return anomalies.sort((a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || b.amount - a.amount,
  )
}

export default async function AnomaliesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const anomalies = await detectAnomalies()

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Anomalies</h2>
        <p className="text-sm text-secondary mt-1">Unusual transactions from the last 30 days worth reviewing.</p>
      </div>

      <AnomaliesClient anomalies={anomalies} />
    </>
  )
}

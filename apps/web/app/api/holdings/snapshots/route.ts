/**
 * GET  /api/holdings/snapshots  — return up to 365 days of net-worth history
 * POST /api/holdings/snapshots  — upsert today's snapshot with current values
 *
 * SNAPSHOT STRATEGY
 * ─────────────────
 * A snapshot records the total portfolio value on a given date plus a
 * per-holding breakdown (JSONB). Snapshots are taken once per day, triggered
 * automatically when the holdings page loads (POST is called client-side on mount).
 *
 * The UNIQUE constraint on `snapshot_date` means re-posting the same day
 * will UPDATE (not duplicate) today's row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, holdings, holdingPriceCache, holdingSnapshots } from '@/lib/db'
import { asc, inArray, desc } from 'drizzle-orm'
import { z } from 'zod'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitParam = request.nextUrl.searchParams.get('limit') ?? '365'
  const limit = Math.min(parseInt(limitParam, 10) || 365, 365)

  const rows = await db
    .select({
      snapshotDate: holdingSnapshots.snapshotDate,
      totalValue:   holdingSnapshots.totalValue,
      breakdown:    holdingSnapshots.breakdown,
    })
    .from(holdingSnapshots)
    .orderBy(asc(holdingSnapshots.snapshotDate))
    .limit(limit)

  const data = rows.map((r) => ({
    date:       r.snapshotDate,
    totalValue: parseFloat(String(r.totalValue)),
    breakdown:  r.breakdown,
  }))

  return NextResponse.json({ data })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const postSchema = z.object({
  // Optional override — defaults to today
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const snapshotDate =
    parsed.data.date ?? new Date().toISOString().slice(0, 10)

  // Load all holdings
  const allHoldings = await db
    .select()
    .from(holdings)
    .orderBy(asc(holdings.sortOrder))

  const tickers = allHoldings
    .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
    .map((h) => h.ticker as string)

  let priceMap: Record<string, number> = {}
  if (tickers.length > 0) {
    const cached = await db
      .select()
      .from(holdingPriceCache)
      .where(inArray(holdingPriceCache.ticker, tickers))
    for (const row of cached) {
      priceMap[row.ticker] = parseFloat(String(row.price))
    }
  }

  let totalValue = 0
  const breakdown: Array<{ id: string; name: string; value: number }> = []

  for (const h of allHoldings) {
    const units = h.units != null ? parseFloat(String(h.units)) : null
    const avgCost = h.avgCostPerUnit != null ? parseFloat(String(h.avgCostPerUnit)) : null
    const manualBalance = h.manualBalance != null ? parseFloat(String(h.manualBalance)) : null

    let value: number | null = null
    if ((h.type === 'etf' || h.type === 'stock') && units != null) {
      const price = h.ticker ? (priceMap[h.ticker] ?? avgCost) : avgCost
      value = price != null ? units * price : null
    } else {
      value = manualBalance
    }

    if (value != null) {
      totalValue += value
      breakdown.push({ id: h.id, name: h.name, value })
    }
  }

  const rows = await db
    .insert(holdingSnapshots)
    .values({
      snapshotDate,
      totalValue: String(totalValue),
      breakdown,
    })
    .onConflictDoUpdate({
      target: holdingSnapshots.snapshotDate,
      set: {
        totalValue: String(totalValue),
        breakdown,
      },
    })
    .returning()

  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      date:       row.snapshotDate,
      totalValue: parseFloat(String(row.totalValue)),
      breakdown:  row.breakdown,
    },
  })
}

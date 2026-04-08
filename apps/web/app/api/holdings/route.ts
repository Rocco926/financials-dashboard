/**
 * GET  /api/holdings   — list all holdings with live prices for ETF/stock types
 * POST /api/holdings   — create a new holding
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, holdings, holdingPriceCache, transactions } from '@/lib/db'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { getLiveBalances } from '@/lib/get-live-balances'
import { z } from 'zod'

// ─── Validation ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:            z.string().min(1).max(120),
  institution:     z.string().min(1).max(120),
  type:            z.enum(['cash', 'etf', 'stock', 'other']),
  ticker:          z.string().max(20).optional().nullable(),
  units:           z.number().positive().optional().nullable(),
  avgCostPerUnit:  z.number().positive().optional().nullable(),
  manualBalance:   z.number().optional().nullable(),
  currency:        z.string().length(3).default('AUD'),
  notes:           z.string().max(500).optional().nullable(),
  sortOrder:       z.number().int().default(0),
  linkedAccountId: z.string().uuid().optional().nullable(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select()
    .from(holdings)
    .orderBy(asc(holdings.sortOrder), asc(holdings.createdAt))

  // Gather tickers for ETF/stock holdings to pull cached prices
  const tickers = rows
    .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
    .map((h) => h.ticker as string)

  let priceMap: Record<string, { price: number; changePct: number | null; currency: string }> = {}
  if (tickers.length > 0) {
    const cached = await db
      .select()
      .from(holdingPriceCache)
      .where(inArray(holdingPriceCache.ticker, tickers))

    for (const row of cached) {
      priceMap[row.ticker] = {
        price:     parseFloat(String(row.price)),
        changePct: row.changePct != null ? parseFloat(String(row.changePct)) : null,
        currency:  row.currency,
      }
    }
  }

  // For linked holdings, fetch the latest transaction balance per account.
  const linkedAccountIds = rows
    .map((h) => h.linkedAccountId)
    .filter((id): id is string => id != null)

  const liveBalanceMap = await getLiveBalances(linkedAccountIds)

  // Compute current value for each holding
  const data = rows.map((h) => {
    const cached = h.ticker ? priceMap[h.ticker] : null
    const units = h.units != null ? parseFloat(String(h.units)) : null
    const avgCost = h.avgCostPerUnit != null ? parseFloat(String(h.avgCostPerUnit)) : null
    const manualBalance = h.manualBalance != null ? parseFloat(String(h.manualBalance)) : null

    // Current value:
    //   ETF/stock with units + live price → units × price
    //   ETF/stock with units but no live price → units × avgCost (fallback)
    //   Cash linked to account → live balance from transactions (always fresh)
    //   Cash/other unlinked → manualBalance
    let currentValue: number | null = null
    if ((h.type === 'etf' || h.type === 'stock') && units != null) {
      const price = cached?.price ?? avgCost
      currentValue = price != null ? units * price : null
    } else if (h.linkedAccountId && liveBalanceMap[h.linkedAccountId] != null) {
      currentValue = liveBalanceMap[h.linkedAccountId] ?? null
    } else {
      currentValue = manualBalance
    }

    const costBase = units != null && avgCost != null ? units * avgCost : null
    const gainLoss =
      currentValue != null && costBase != null ? currentValue - costBase : null

    return {
      ...h,
      units:          units,
      avgCostPerUnit: avgCost,
      manualBalance:  manualBalance,
      currentValue,
      costBase,
      gainLoss,
      livePrice:      cached?.price ?? null,
      changePct:      cached?.changePct ?? null,
    }
  })

  return NextResponse.json({ data })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const {
    name, institution, type, ticker, units,
    avgCostPerUnit, manualBalance, currency, notes, sortOrder, linkedAccountId,
  } = parsed.data

  // If linked to an account, backfill manualBalance from the most recent
  // transaction balance right now — don't wait for the next import.
  let resolvedBalance = manualBalance != null ? String(manualBalance) : null
  if (linkedAccountId) {
    const [latest] = await db
      .select({ balance: transactions.balance })
      .from(transactions)
      .where(eq(transactions.accountId, linkedAccountId))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(1)
    if (latest?.balance != null) resolvedBalance = String(latest.balance)
  }

  const [row] = await db
    .insert(holdings)
    .values({
      name,
      institution,
      type,
      ticker:          ticker ?? null,
      units:           units != null ? String(units) : null,
      avgCostPerUnit:  avgCostPerUnit != null ? String(avgCostPerUnit) : null,
      manualBalance:   resolvedBalance,
      currency,
      notes:           notes ?? null,
      sortOrder,
      linkedAccountId: linkedAccountId ?? null,
    })
    .returning()

  return NextResponse.json({ data: row }, { status: 201 })
}

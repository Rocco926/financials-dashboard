import { db } from '@/lib/db'
import { holdings, holdingPriceCache, holdingSnapshots } from '@/lib/db'
import { asc, inArray, desc } from 'drizzle-orm'
import { HoldingsClient } from './holdings-client'

async function getHoldings() {
  const rows = await db
    .select()
    .from(holdings)
    .orderBy(asc(holdings.sortOrder), asc(holdings.createdAt))

  const tickers = rows
    .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
    .map((h) => h.ticker as string)

  let priceMap: Record<string, { price: number; changePct: number | null }> = {}
  if (tickers.length > 0) {
    const cached = await db
      .select()
      .from(holdingPriceCache)
      .where(inArray(holdingPriceCache.ticker, tickers))
    for (const r of cached) {
      priceMap[r.ticker] = {
        price:     parseFloat(String(r.price)),
        changePct: r.changePct != null ? parseFloat(String(r.changePct)) : null,
      }
    }
  }

  return rows.map((h) => {
    const cached = h.ticker ? priceMap[h.ticker] : null
    const units = h.units != null ? parseFloat(String(h.units)) : null
    const avgCost = h.avgCostPerUnit != null ? parseFloat(String(h.avgCostPerUnit)) : null
    const manualBalance = h.manualBalance != null ? parseFloat(String(h.manualBalance)) : null

    let currentValue: number | null = null
    if ((h.type === 'etf' || h.type === 'stock') && units != null) {
      const price = cached?.price ?? avgCost
      currentValue = price != null ? units * price : null
    } else {
      currentValue = manualBalance
    }

    const costBase = units != null && avgCost != null ? units * avgCost : null
    const gainLoss = currentValue != null && costBase != null ? currentValue - costBase : null
    const gainLossPct =
      gainLoss != null && costBase != null && costBase !== 0
        ? (gainLoss / costBase) * 100
        : null

    return {
      id:              h.id,
      name:            h.name,
      institution:     h.institution,
      type:            h.type,
      ticker:          h.ticker,
      units,
      avgCostPerUnit:  avgCost,
      manualBalance,
      currency:        h.currency,
      notes:           h.notes,
      sortOrder:       h.sortOrder,
      linkedAccountId: h.linkedAccountId ?? null,
      currentValue,
      costBase,
      gainLoss,
      gainLossPct,
      livePrice:       cached?.price ?? null,
      changePct:       cached?.changePct ?? null,
    }
  })
}

async function getSnapshots() {
  const rows = await db
    .select({
      snapshotDate: holdingSnapshots.snapshotDate,
      totalValue:   holdingSnapshots.totalValue,
    })
    .from(holdingSnapshots)
    .orderBy(asc(holdingSnapshots.snapshotDate))
    .limit(365)

  return rows.map((r) => ({
    date:       r.snapshotDate,
    totalValue: parseFloat(String(r.totalValue)),
  }))
}

export default async function HoldingsPage() {
  const [holdingRows, snapshots] = await Promise.all([
    getHoldings(),
    getSnapshots(),
  ])

  return (
    <HoldingsClient
      initialHoldings={holdingRows}
      initialSnapshots={snapshots}
    />
  )
}

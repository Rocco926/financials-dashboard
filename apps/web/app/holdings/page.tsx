import { db } from '@/lib/db'
import { holdings, holdingPriceCache, holdingSnapshots } from '@/lib/db'
import { asc, inArray, desc } from 'drizzle-orm'
import { formatCurrency } from '@/lib/utils'
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

  const totalValue = holdingRows.reduce(
    (sum, h) => sum + (h.currentValue ?? 0),
    0,
  )
  const totalCostBase = holdingRows.reduce(
    (sum, h) => sum + (h.costBase ?? 0),
    0,
  )
  const totalGainLoss = totalValue - totalCostBase

  return (
    <div className="px-10 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-[#37352F] text-balance">Holdings</h1>
          <p className="text-sm text-[#787774] mt-0.5 text-pretty">
            Investment accounts and cash positions
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      {holdingRows.length > 0 && (
        <div className="grid grid-cols-3 gap-0 border border-[#E9E7E2] divide-x divide-[#E9E7E2]">
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Total value</p>
            <p className="text-2xl font-medium text-[#37352F] tabular-nums mt-1">
              {formatCurrency(totalValue)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Cost base</p>
            <p className="text-2xl font-medium text-[#37352F] tabular-nums mt-1">
              {formatCurrency(totalCostBase)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Unrealised G/L</p>
            <p
              className={`text-2xl font-medium tabular-nums mt-1 ${
                totalGainLoss >= 0 ? 'text-[#4CAF7D]' : 'text-[#E5534B]'
              }`}
            >
              {totalGainLoss >= 0 ? '+' : ''}
              {formatCurrency(totalGainLoss)}
            </p>
          </div>
        </div>
      )}

      {/* Client component handles table + chart + form */}
      <HoldingsClient
        initialHoldings={holdingRows}
        initialSnapshots={snapshots}
      />
    </div>
  )
}

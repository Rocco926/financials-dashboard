/**
 * GET  /api/holdings/insights   — return cached or freshly generated insight
 * POST /api/holdings/insights   — force-regenerate (ignores cache age)
 *
 * CACHING STRATEGY
 * ─────────────────
 * One row ever lives in `market_insights`. A cached insight is reused when:
 *   1. It was generated within the last hour, AND
 *   2. The portfolio holdings hash hasn't changed
 *
 * If either condition fails, Claude Haiku is called and the row is upserted.
 *
 * FALLBACK
 * ────────
 * If Claude is unavailable (missing API key, network error), a computed
 * plain-English string is returned instead — the UI still renders, just
 * without AI prose.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'
import { db, holdings, holdingPriceCache, marketInsights } from '@/lib/db'
import { inArray, desc } from 'drizzle-orm'
import { formatCurrency } from '@/lib/utils'

const CACHE_TTL_MS  = 60 * 60 * 1000   // 1 hour
const INDEX_TICKERS = ['^AXJO', '^GSPC'] // ASX 200, S&P 500

// ─── Yahoo Finance fetch (lightweight, no cache) ─────────────────────────────

async function fetchPrices(
  tickers: string[],
): Promise<Record<string, { name: string; price: number; changePct: number | null }>> {
  if (tickers.length === 0) return {}
  const symbols = tickers.join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,longName,shortName,currency`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return {}
    const json = await res.json()
    const quotes: Array<{
      symbol: string
      regularMarketPrice?: number
      regularMarketChangePercent?: number
      longName?: string
      shortName?: string
    }> = json?.quoteResponse?.result ?? []
    const result: Record<string, { name: string; price: number; changePct: number | null }> = {}
    for (const q of quotes) {
      if (q.symbol && q.regularMarketPrice != null) {
        result[q.symbol] = {
          name:      q.longName ?? q.shortName ?? q.symbol,
          price:     q.regularMarketPrice,
          changePct: q.regularMarketChangePercent ?? null,
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

// ─── Portfolio stats ──────────────────────────────────────────────────────────

interface PortfolioStats {
  totalValue:       number
  totalCostBase:    number
  totalGainLoss:    number
  totalGainLossPct: number | null
  cashValue:        number
  cashPct:          number
  topPerformer:     { name: string; ticker: string; changePct: number } | null
  holdingsHash:     string
}

async function computeStats(): Promise<PortfolioStats> {
  // Column-scoped select — only fetch the fields needed for stats calculation
  const rows = await db
    .select({
      id:             holdings.id,
      name:           holdings.name,
      type:           holdings.type,
      ticker:         holdings.ticker,
      units:          holdings.units,
      avgCostPerUnit: holdings.avgCostPerUnit,
      manualBalance:  holdings.manualBalance,
    })
    .from(holdings)

  const tickers = rows
    .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
    .map((h) => h.ticker as string)

  // Single batch query for price + changePct — map carries both to avoid N+1 in the loop
  const priceMap: Record<string, { price: number; changePct: number | null }> = {}
  if (tickers.length > 0) {
    const cached = await db
      .select({
        ticker:    holdingPriceCache.ticker,
        price:     holdingPriceCache.price,
        changePct: holdingPriceCache.changePct,
      })
      .from(holdingPriceCache)
      .where(inArray(holdingPriceCache.ticker, tickers))
    for (const r of cached) {
      priceMap[r.ticker] = {
        price:     parseFloat(String(r.price)),
        changePct: r.changePct != null ? parseFloat(String(r.changePct)) : null,
      }
    }
  }

  let totalValue    = 0
  let totalCostBase = 0
  let cashValue     = 0

  // Top performer: investment holding with highest changePct
  let topPerformer: { name: string; ticker: string; changePct: number } | null = null

  const hashParts: string[] = []

  for (const h of rows) {
    const units   = h.units           != null ? parseFloat(String(h.units))           : null
    const avgCost = h.avgCostPerUnit   != null ? parseFloat(String(h.avgCostPerUnit))  : null
    const manual  = h.manualBalance    != null ? parseFloat(String(h.manualBalance))   : null

    let currentValue: number | null = null
    if ((h.type === 'etf' || h.type === 'stock') && units != null) {
      const price = h.ticker ? (priceMap[h.ticker]?.price ?? avgCost) : avgCost
      currentValue = price != null ? units * price : null
    } else {
      currentValue = manual
    }

    const costBase = units != null && avgCost != null ? units * avgCost : null

    if (currentValue != null) {
      totalValue += currentValue
      hashParts.push(`${h.id}:${currentValue.toFixed(2)}`)
    }
    if (costBase != null) totalCostBase += costBase
    if ((h.type === 'cash' || h.type === 'other') && currentValue != null) {
      cashValue += currentValue
    }

    // Top performer: read changePct from priceMap — no extra DB query needed
    if (h.ticker && (h.type === 'etf' || h.type === 'stock')) {
      const changePct = priceMap[h.ticker]?.changePct ?? null
      if (changePct != null && (topPerformer == null || changePct > topPerformer.changePct)) {
        topPerformer = { name: h.name, ticker: h.ticker, changePct }
      }
    }
  }

  const totalGainLoss    = totalValue - totalCostBase
  const totalGainLossPct = totalCostBase > 0 ? (totalGainLoss / totalCostBase) * 100 : null
  const cashPct          = totalValue > 0 ? (cashValue / totalValue) * 100 : 0
  const holdingsHash     = createHash('sha256').update(hashParts.sort().join('|')).digest('hex').slice(0, 16)

  return { totalValue, totalCostBase, totalGainLoss, totalGainLossPct, cashValue, cashPct, topPerformer, holdingsHash }
}

// ─── Computed fallback (no Claude) ───────────────────────────────────────────

function buildFallback(stats: PortfolioStats, indices: Record<string, { name: string; price: number; changePct: number | null }>): string {
  const gainStr = stats.totalGainLoss >= 0
    ? `up ${formatCurrency(stats.totalGainLoss)}`
    : `down ${formatCurrency(Math.abs(stats.totalGainLoss))}`

  const pctStr = stats.totalGainLossPct != null
    ? ` (${stats.totalGainLossPct >= 0 ? '+' : ''}${stats.totalGainLossPct.toFixed(1)}%)`
    : ''

  let text = `Your portfolio is worth ${formatCurrency(stats.totalValue)}, ${gainStr}${pctStr} on your cost base.`

  if (stats.topPerformer) {
    const tp = stats.topPerformer
    text += ` ${tp.name} (${tp.ticker}) is today's top mover at ${tp.changePct >= 0 ? '+' : ''}${tp.changePct.toFixed(2)}%.`
  }

  if (stats.cashPct > 0) {
    text += ` Cash represents ${stats.cashPct.toFixed(0)}% of your total holdings.`
  }

  const asx = indices['^AXJO']
  if (asx?.changePct != null) {
    text += ` ASX 200 is ${asx.changePct >= 0 ? 'up' : 'down'} ${Math.abs(asx.changePct).toFixed(2)}% today.`
  }

  return text
}

// ─── Claude generation ────────────────────────────────────────────────────────

async function generateWithClaude(
  stats: PortfolioStats,
  indices: Record<string, { name: string; price: number; changePct: number | null }>,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const client = new Anthropic({ apiKey })

    const asx  = indices['^AXJO']
    const sp   = indices['^GSPC']
    const indicesStr = [
      asx  ? `ASX 200 ${asx.changePct  != null ? (asx.changePct  >= 0 ? '+' : '') + asx.changePct.toFixed(2)  + '%' : 'n/a'}` : null,
      sp   ? `S&P 500 ${sp.changePct   != null ? (sp.changePct   >= 0 ? '+' : '') + sp.changePct.toFixed(2)   + '%' : 'n/a'}` : null,
    ].filter(Boolean).join(', ')

    const prompt = [
      `Portfolio total: ${formatCurrency(stats.totalValue)}`,
      `Unrealised gain/loss: ${stats.totalGainLoss >= 0 ? '+' : ''}${formatCurrency(stats.totalGainLoss)}${stats.totalGainLossPct != null ? ` (${stats.totalGainLossPct >= 0 ? '+' : ''}${stats.totalGainLossPct.toFixed(1)}%)` : ''}`,
      stats.topPerformer ? `Top mover today: ${stats.topPerformer.name} (${stats.topPerformer.ticker}) ${stats.topPerformer.changePct >= 0 ? '+' : ''}${stats.topPerformer.changePct.toFixed(2)}%` : null,
      `Cash allocation: ${stats.cashPct.toFixed(0)}% of portfolio`,
      indicesStr ? `Market today: ${indicesStr}` : null,
    ].filter(Boolean).join('\n')

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 150,
      system:     'You are a personal finance assistant. Write 2-3 calm, factual sentences summarising this person\'s investment portfolio based on the data below. Be specific with numbers. Do not give financial advice. Do not use markdown.',
      messages:   [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
    return text ?? null
  } catch {
    return null
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function getOrGenerate(forceRefresh: boolean): Promise<{ content: string; fresh: boolean }> {
  const stats   = await computeStats()
  const indices = await fetchPrices(INDEX_TICKERS)

  if (!forceRefresh) {
    // Check cache
    const [cached] = await db
      .select()
      .from(marketInsights)
      .orderBy(desc(marketInsights.generatedAt))
      .limit(1)

    if (cached) {
      const age    = Date.now() - new Date(cached.generatedAt).getTime()
      const fresh  = age < CACHE_TTL_MS && cached.holdingsHash === stats.holdingsHash
      if (fresh) {
        return { content: cached.content, fresh: false }
      }
    }
  }

  // Generate
  const content = (await generateWithClaude(stats, indices)) ?? buildFallback(stats, indices)

  // Atomic upsert: delete + insert in one transaction so the table is never
  // momentarily empty (which would cause a concurrent GET to regenerate).
  await db.transaction(async (tx) => {
    await tx.delete(marketInsights)
    await tx.insert(marketInsights).values({
      content,
      holdingsHash: stats.holdingsHash,
      generatedAt:  new Date(),
    })
  })

  return { content, fresh: true }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, fresh } = await getOrGenerate(false)
  return NextResponse.json({ content, fresh })
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await getOrGenerate(true)
  return NextResponse.json({ content, fresh: true })
}

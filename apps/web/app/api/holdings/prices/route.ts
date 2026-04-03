/**
 * GET /api/holdings/prices?tickers=DHHF.AX,BGBL.AX
 *
 * Returns current prices for one or more tickers.
 *
 * CACHING STRATEGY
 * ─────────────────
 * Prices are cached in `holding_price_cache` (TTL: 15 minutes).
 * On each request:
 *   1. Load all cached rows for the requested tickers
 *   2. Any ticker whose `fetchedAt` is >15 min old → stale
 *   3. Fetch fresh data from Yahoo for stale tickers only
 *   4. Upsert new prices back into the cache
 *   5. Return merged result (fresh + still-valid cached)
 *
 * This means the first hit is slow (~500ms Yahoo round-trip), subsequent
 * hits within 15 minutes are instant (DB-only).
 *
 * RESPONSE
 * ────────
 * {
 *   prices: Record<ticker, {
 *     ticker, name, price, changePct, currency, fetchedAt, stale
 *   }>
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, holdingPriceCache } from '@/lib/db'
import { inArray, sql } from 'drizzle-orm'

const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

async function fetchYahooPrices(tickers: string[]): Promise<
  Record<
    string,
    { name: string; price: number; changePct: number | null; currency: string }
  >
> {
  const symbols = tickers.join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,longName,shortName,currency`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) return {}

  const json = await res.json()
  const quotes: Array<{
    symbol: string
    regularMarketPrice?: number
    regularMarketChangePercent?: number
    longName?: string
    shortName?: string
    currency?: string
  }> = json?.quoteResponse?.result ?? []

  const result: Record<string, { name: string; price: number; changePct: number | null; currency: string }> = {}
  for (const q of quotes) {
    if (q.symbol && q.regularMarketPrice != null) {
      result[q.symbol] = {
        name:      q.longName ?? q.shortName ?? q.symbol,
        price:     q.regularMarketPrice,
        changePct: q.regularMarketChangePercent ?? null,
        currency:  q.currency ?? 'AUD',
      }
    }
  }
  return result
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tickerParam = request.nextUrl.searchParams.get('tickers') ?? ''
  const tickers = tickerParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)

  if (tickers.length === 0) {
    return NextResponse.json({ prices: {} })
  }

  // Load cache rows for all requested tickers
  const cached = await db
    .select()
    .from(holdingPriceCache)
    .where(inArray(holdingPriceCache.ticker, tickers))

  const cachedMap = new Map(cached.map((r) => [r.ticker, r]))
  const now = Date.now()

  // Determine which tickers need a fresh fetch
  const staleTickers = tickers.filter((t) => {
    const row = cachedMap.get(t)
    if (!row) return true
    return now - new Date(row.fetchedAt).getTime() > CACHE_TTL_MS
  })

  // Fetch fresh prices for stale tickers
  if (staleTickers.length > 0) {
    try {
      const fresh = await fetchYahooPrices(staleTickers)

      // Upsert into cache
      const upserts = Object.entries(fresh).map(([ticker, data]) => ({
        ticker,
        name:      data.name,
        price:     String(data.price),
        changePct: data.changePct != null ? String(data.changePct) : null,
        currency:  data.currency,
        fetchedAt: new Date(),
      }))

      if (upserts.length > 0) {
        await db
          .insert(holdingPriceCache)
          .values(upserts)
          .onConflictDoUpdate({
            target: holdingPriceCache.ticker,
            set: {
              name:      sql`excluded.name`,
              price:     sql`excluded.price`,
              changePct: sql`excluded.change_pct`,
              currency:  sql`excluded.currency`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          })

        // Update local map with fresh data
        for (const u of upserts) {
          cachedMap.set(u.ticker, u)
        }
      }
    } catch {
      // Yahoo fetch failed — return stale/missing data rather than erroring
    }
  }

  // Build response from (now potentially updated) map
  const prices: Record<
    string,
    {
      ticker: string
      name: string | null
      price: number
      changePct: number | null
      currency: string
      fetchedAt: string
      stale: boolean
    }
  > = {}

  for (const ticker of tickers) {
    const row = cachedMap.get(ticker)
    if (row) {
      prices[ticker] = {
        ticker,
        name:      row.name,
        price:     parseFloat(String(row.price)),
        changePct: row.changePct != null ? parseFloat(String(row.changePct)) : null,
        currency:  row.currency,
        fetchedAt: typeof row.fetchedAt === 'string' ? row.fetchedAt : (row.fetchedAt as Date).toISOString(),
        stale:     now - new Date(row.fetchedAt).getTime() > CACHE_TTL_MS,
      }
    }
  }

  return NextResponse.json({ prices })
}

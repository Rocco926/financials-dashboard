/**
 * GET /api/holdings/ticker-lookup?q=<query>
 *
 * Proxies Yahoo Finance's unofficial search API to look up tickers.
 * Returns a short list of matching instruments so the user can confirm
 * which ticker to attach to an ETF/stock holding.
 *
 * We proxy rather than hitting Yahoo directly from the browser because:
 * 1. CORS — Yahoo blocks browser requests
 * 2. Keeps the Yahoo Finance URL handling server-side only
 *
 * RESPONSE
 * ────────
 * { results: Array<{ ticker, name, exchange, type }> }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1 || q.length > 50) {
    return NextResponse.json({ results: [] })
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      // 5-second timeout
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ results: [] })
    }

    const json = await res.json()
    const quotes: Array<{
      symbol: string
      shortname?: string
      longname?: string
      exchDisp?: string
      typeDisp?: string
      quoteType?: string
    }> = json?.quotes ?? []

    const results = quotes
      .filter((q) => q.symbol && (q.shortname || q.longname))
      .map((q) => ({
        ticker:   q.symbol,
        name:     q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchDisp ?? '',
        type:     q.typeDisp ?? q.quoteType ?? '',
      }))

    return NextResponse.json({ results })
  } catch {
    // Timeout or network error — return empty rather than 500
    return NextResponse.json({ results: [] })
  }
}

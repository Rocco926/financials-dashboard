/**
 * GET  /api/summaries?month=YYYY-MM  — return cached or freshly generated monthly summary
 * POST /api/summaries?month=YYYY-MM  — force-regenerate (ignores cache)
 *
 * CACHING STRATEGY
 * ─────────────────
 * One row per calendar month in `financial_summaries`.
 * The data_hash column invalidates the cache when income/expense totals change
 * (e.g. the user imports more transactions for that month after the fact).
 *
 * FALLBACK
 * ────────
 * If Claude is unavailable (no API key, network error), a computed plain-English
 * sentence is returned instead — the UI still renders without AI prose.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'
import { db, transactions, categories, financialSummaries } from '@/lib/db'
import { and, gte, lte, eq, sql } from 'drizzle-orm'

const CACHE_TTL_MS = 60 * 60 * 1000  // 1 hour

// ─── Data computation ─────────────────────────────────────────────────────────

interface MonthStats {
  income:         number
  expenses:       number
  net:            number
  savingsRate:    number | null
  topCategories:  { name: string; total: number }[]
  dataHash:       string
}

async function computeMonthStats(month: string): Promise<MonthStats> {
  const from = `${month}-01`
  // Last day of the month: go to first of next month then subtract 1
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(year, mon, 0).getDate()
  const to = `${month}-${String(lastDay).padStart(2, '0')}`

  const transferSubquery = sql`(SELECT name FROM ${categories} WHERE is_transfer = true)`

  // Income: positive amounts, exclude transfers
  const [incomeRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)` })
    .from(transactions)
    .where(and(
      gte(transactions.date, from),
      lte(transactions.date, to),
      sql`${transactions.amount}::numeric > 0`,
      sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
    ))

  // Expenses: negative amounts, exclude transfers
  const [expensesRow] = await db
    .select({ total: sql<string>`COALESCE(ABS(SUM(${transactions.amount}::numeric)), 0)` })
    .from(transactions)
    .where(and(
      gte(transactions.date, from),
      lte(transactions.date, to),
      sql`${transactions.amount}::numeric < 0`,
      sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
    ))

  // Top 5 spending categories
  const categoryRows = await db
    .select({
      name:  sql<string>`COALESCE(${transactions.category}, 'Uncategorised')`,
      total: sql<string>`ABS(SUM(${transactions.amount}::numeric))`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category, categories.name))
    .where(and(
      gte(transactions.date, from),
      lte(transactions.date, to),
      sql`${transactions.amount}::numeric < 0`,
      sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
    ))
    .groupBy(transactions.category)
    .orderBy(sql`ABS(SUM(${transactions.amount}::numeric)) DESC`)
    .limit(5)

  const income   = parseFloat(incomeRow?.total ?? '0')
  const expenses = parseFloat(expensesRow?.total ?? '0')
  const net      = income - expenses
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null

  const topCategories = categoryRows.map((r) => ({
    name:  r.name,
    total: parseFloat(r.total),
  }))

  // Hash for cache invalidation
  const hashInput = [
    income.toFixed(2),
    expenses.toFixed(2),
    ...topCategories.map((c) => `${c.name}:${c.total.toFixed(2)}`),
  ].join('|')
  const dataHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16)

  return { income, expenses, net, savingsRate, topCategories, dataHash }
}

// ─── Fallback (no Claude) ─────────────────────────────────────────────────────

function buildFallback(stats: MonthStats, month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const monthName = new Date(year, mon - 1, 1).toLocaleString('en-AU', { month: 'long' })
  const fmt = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

  let text = `In ${monthName}, you earned ${fmt(stats.income)} and spent ${fmt(stats.expenses)}, leaving a net ${stats.net >= 0 ? 'surplus' : 'deficit'} of ${fmt(Math.abs(stats.net))}.`

  if (stats.savingsRate !== null) {
    text += ` Your savings rate was ${stats.savingsRate}%.`
  }

  if (stats.topCategories.length > 0) {
    const top = stats.topCategories[0]!
    text += ` Your biggest expense category was ${top.name} at ${fmt(top.total)}.`
  }

  return text
}

// ─── Claude generation ────────────────────────────────────────────────────────

async function generateWithClaude(stats: MonthStats, month: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const client = new Anthropic({ apiKey })

    const [year, mon] = month.split('-').map(Number) as [number, number]
    const monthName = new Date(year, mon - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
    const fmt = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

    const topCatsStr = stats.topCategories
      .map((c, i) => `${i + 1}. ${c.name}: ${fmt(c.total)}`)
      .join(', ')

    const prompt = [
      `Month: ${monthName}`,
      `Income: ${fmt(stats.income)}`,
      `Expenses: ${fmt(stats.expenses)}`,
      `Net: ${fmt(stats.net)} (${stats.net >= 0 ? 'surplus' : 'deficit'})`,
      stats.savingsRate !== null ? `Savings rate: ${stats.savingsRate}%` : null,
      topCatsStr ? `Top spending categories: ${topCatsStr}` : null,
    ].filter(Boolean).join('\n')

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 180,
      system:     'You are a personal finance assistant. Write 2-3 calm, insightful sentences summarising this person\'s financial month based on the data below. Be specific with numbers. Highlight one positive and one area to watch. Do not give financial advice. Do not use markdown.',
      messages:   [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
    return text ?? null
  } catch {
    return null
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

async function getOrGenerate(month: string, forceRefresh: boolean): Promise<{ content: string; fresh: boolean }> {
  const stats = await computeMonthStats(month)

  if (!forceRefresh) {
    const [cached] = await db
      .select()
      .from(financialSummaries)
      .where(eq(financialSummaries.month, `${month}-01`))
      .limit(1)

    if (cached) {
      const age   = Date.now() - new Date(cached.generatedAt).getTime()
      const valid = age < CACHE_TTL_MS && cached.dataHash === stats.dataHash
      if (valid) {
        return { content: cached.content, fresh: false }
      }
    }
  }

  const content = (await generateWithClaude(stats, month)) ?? buildFallback(stats, month)

  // Upsert the new summary
  await db
    .insert(financialSummaries)
    .values({
      month:       `${month}-01`,
      content,
      dataHash:    stats.dataHash,
      generatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: financialSummaries.month,
      set: {
        content,
        dataHash:    stats.dataHash,
        generatedAt: new Date(),
      },
    })

  return { content, fresh: true }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month param required (YYYY-MM)' }, { status: 400 })
  }

  const { content, fresh } = await getOrGenerate(month, false)
  return NextResponse.json({ content, fresh })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month param required (YYYY-MM)' }, { status: 400 })
  }

  const { content } = await getOrGenerate(month, true)
  return NextResponse.json({ content, fresh: true })
}

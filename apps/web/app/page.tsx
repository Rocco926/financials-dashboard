import { db } from '@/lib/db'
import { transactions, accounts, categories, holdings, holdingPriceCache, holdingSnapshots } from '@/lib/db'
import { eq, and, gte, lte, desc, asc, sql, inArray } from 'drizzle-orm'
import { MonthlyChart } from '@/components/monthly-chart'
import { CategoryChart } from '@/components/category-chart'
import { NetWorthChart } from '@/components/net-worth-chart'
import { PeriodSelector } from '@/components/period-selector'
import { Suspense } from 'react'
import { formatCurrency, formatDate, getPeriodDates } from '@/lib/utils'
import Link from 'next/link'

interface DashboardProps {
  searchParams: { period?: string }
}

/**
 * Computes total portfolio value directly from holdings + price cache.
 * Same logic as the holdings page — cash uses manualBalance, ETFs use units × price.
 * Falls back to avgCostPerUnit if no cached price exists for a ticker.
 */
async function getNetWorth(): Promise<number> {
  const rows = await db.select().from(holdings)
  if (rows.length === 0) return 0

  const tickers = rows
    .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
    .map((h) => h.ticker as string)

  const priceMap: Record<string, number> = {}
  if (tickers.length > 0) {
    const cached = await db
      .select({ ticker: holdingPriceCache.ticker, price: holdingPriceCache.price })
      .from(holdingPriceCache)
      .where(inArray(holdingPriceCache.ticker, tickers))
    for (const r of cached) {
      priceMap[r.ticker] = parseFloat(String(r.price))
    }
  }

  return rows.reduce((sum, h) => {
    if (h.type === 'etf' || h.type === 'stock') {
      const units = h.units != null ? parseFloat(String(h.units)) : null
      const price = h.ticker ? priceMap[h.ticker] : null
      const fallback = h.avgCostPerUnit != null ? parseFloat(String(h.avgCostPerUnit)) : null
      const effectivePrice = price ?? fallback
      return sum + (units != null && effectivePrice != null ? units * effectivePrice : 0)
    }
    return sum + (h.manualBalance != null ? parseFloat(String(h.manualBalance)) : 0)
  }, 0)
}

/** Last 90 days of daily snapshots for the mini net-worth sparkline. */
async function getRecentSnapshots() {
  const rows = await db
    .select({ snapshotDate: holdingSnapshots.snapshotDate, totalValue: holdingSnapshots.totalValue })
    .from(holdingSnapshots)
    .orderBy(asc(holdingSnapshots.snapshotDate))
    .limit(90)
  return rows.map((r) => ({
    date:       r.snapshotDate,
    totalValue: parseFloat(String(r.totalValue)),
  }))
}

async function getDashboardData(period: string) {
  const { from, to } = getPeriodDates(period)

  // Subquery: names of categories flagged as transfers.
  // Used to exclude internal transfers from all expense-related aggregations.
  // Stored as a SQL fragment so it's reused consistently across queries.
  const transferCategorySubquery = sql`(
    SELECT name FROM ${categories} WHERE is_transfer = true
  )`

  // ── Summary metrics ──────────────────────────────────────────────────────────
  // Income: all credits in the period (amount > 0).
  // Expenses: debits EXCLUDING transfer-category transactions.
  const [summary] = await db
    .select({
      totalIncome:   sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric > 0 THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      totalExpenses: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric < 0 AND (${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferCategorySubquery}) THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))

  const income   = parseFloat(summary?.totalIncome   ?? '0')
  const expenses = parseFloat(summary?.totalExpenses ?? '0')
  const savingsRate = income > 0 ? Math.round(((income + expenses) / income) * 100) : null

  // ── Monthly chart data (last 12 months) ──────────────────────────────────────
  // Expenses exclude transfer categories so the bars reflect true spending.
  const monthlyRaw = await db.execute(sql`
    SELECT
      TO_CHAR(date::date, 'Mon ''YY') as month,
      DATE_TRUNC('month', date::date) as month_date,
      COALESCE(SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as income,
      COALESCE(ABS(SUM(CASE WHEN amount::numeric < 0
        AND (category IS NULL OR category NOT IN (SELECT name FROM categories WHERE is_transfer = true))
        THEN amount::numeric ELSE 0 END)), 0) as expenses
    FROM transactions
    WHERE date::date >= CURRENT_DATE - INTERVAL '11 months'
    GROUP BY DATE_TRUNC('month', date::date), TO_CHAR(date::date, 'Mon ''YY')
    ORDER BY month_date ASC
  `)

  const monthlyData = (monthlyRaw as unknown as Array<{ month: string; income: string; expenses: string }>).map(
    (r) => ({ month: r.month, income: parseFloat(r.income), expenses: parseFloat(r.expenses) }),
  )

  // ── Category spending chart ───────────────────────────────────────────────────
  // Excludes transfer AND income categories — only true discretionary spend.
  const categoryRaw = await db
    .select({
      name:   sql<string>`COALESCE(${transactions.category}, 'Uncategorised')`,
      value:  sql<string>`ABS(SUM(${transactions.amount}::numeric))`,
      colour: categories.colour,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category, categories.name))
    .where(and(
      gte(transactions.date, from),
      lte(transactions.date, to),
      sql`${transactions.amount}::numeric < 0`,
      sql`(${transactions.category} IS NULL
           OR ${transactions.category} NOT IN ${transferCategorySubquery})`,
    ))
    .groupBy(transactions.category, categories.colour)
    .orderBy(sql`SUM(${transactions.amount}::numeric) ASC`)
    .limit(10)

  const categoryData = categoryRaw.map((r) => ({
    name:   r.name,
    value:  parseFloat(r.value),
    colour: r.colour ?? '#6b7280',
  }))

  // ── Recent transactions ───────────────────────────────────────────────────────
  const recent = await db
    .select({
      id:          transactions.id,
      date:        transactions.date,
      description: transactions.description,
      merchant:    transactions.merchant,
      category:    transactions.category,
      amount:      transactions.amount,
      type:        transactions.type,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(10)

  return { income, expenses, net: income + expenses, savingsRate, monthlyData, categoryData, recent }
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const period = searchParams.period ?? 'month'

  const [
    { income, expenses, net, savingsRate, monthlyData, categoryData, recent },
    netWorth,
    snapshots,
  ] = await Promise.all([
    getDashboardData(period),
    getNetWorth(),
    getRecentSnapshots(),
  ])

  return (
    <div className="px-10 py-8 space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-[#37352F] text-balance">Dashboard</h1>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>

      {/* Cash flow metrics */}
      <div className="grid grid-cols-3 gap-0 border-t border-[#E9E7E2] pt-8">
        <div className="pr-8">
          <p className="section-label">Income</p>
          <p className="text-3xl font-semibold mt-2 tabular-nums text-[#4CAF7D]">
            {formatCurrency(income)}
          </p>
        </div>
        <div className="px-8 border-l border-[#E9E7E2]">
          <p className="section-label">Expenses</p>
          <p className="text-3xl font-semibold mt-2 tabular-nums text-[#E5534B]">
            {formatCurrency(Math.abs(expenses))}
          </p>
          <p className="text-xs text-[#ACABA8] mt-1">transfers excluded</p>
        </div>
        <div className="pl-8 border-l border-[#E9E7E2]">
          <p className="section-label">
            {savingsRate !== null ? 'Savings rate' : 'Net cash flow'}
          </p>
          {savingsRate !== null ? (
            <>
              <p className={`text-3xl font-semibold mt-2 tabular-nums ${savingsRate >= 0 ? 'text-[#4CAF7D]' : 'text-[#E5534B]'}`}>
                {savingsRate}%
              </p>
              <p className="text-xs text-[#ACABA8] mt-1">
                {net >= 0 ? '+' : ''}{formatCurrency(net)} net
              </p>
            </>
          ) : (
            <p className={`text-3xl font-semibold mt-2 tabular-nums ${net >= 0 ? 'text-[#4CAF7D]' : 'text-[#E5534B]'}`}>
              {net >= 0 ? '+' : ''}{formatCurrency(net)}
            </p>
          )}
        </div>
      </div>

      {/* Net worth — only shown when holdings exist */}
      {netWorth > 0 && (
        <div className="border-t border-[#E9E7E2] pt-8 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="section-label">Net worth</p>
              <p className="text-3xl font-semibold mt-2 tabular-nums text-[#37352F]">
                {formatCurrency(netWorth)}
              </p>
              <p className="text-xs text-[#ACABA8] mt-1">investments &amp; cash holdings</p>
            </div>
            <Link
              href="/holdings"
              className="text-xs text-[#787774] hover:text-[#37352F] transition-colors"
            >
              View holdings →
            </Link>
          </div>
          {snapshots.length >= 2 && (
            <div className="bg-white border border-[#E9E7E2] rounded-lg p-5">
              <NetWorthChart data={snapshots} />
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 border-t border-[#E9E7E2] pt-8">
        <div className="bg-white border border-[#E9E7E2] rounded-lg p-5">
          <p className="section-label mb-4">Monthly income vs expenses</p>
          <MonthlyChart data={monthlyData} />
        </div>
        <div className="bg-white border border-[#E9E7E2] rounded-lg p-5">
          <p className="section-label mb-4">Spending by category</p>
          <CategoryChart data={categoryData} />
        </div>
      </div>

      {/* Recent transactions */}
      <div className="border-t border-[#E9E7E2] pt-8">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Recent transactions</p>
          <Link
            href="/transactions"
            className="text-xs text-[#787774] hover:text-[#37352F] transition-colors"
          >
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="text-sm text-[#787774] py-8">
            No transactions yet.{' '}
            <Link href="/import" className="underline hover:text-[#37352F]">
              Import a file
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <div className="border border-[#E9E7E2] bg-white">
            <div className="grid grid-cols-[120px_1fr_120px_140px_130px] border-b border-[#E9E7E2] px-4 py-2">
              <span className="section-label">Date</span>
              <span className="section-label">Description</span>
              <span className="section-label">Account</span>
              <span className="section-label">Category</span>
              <span className="section-label text-right">Amount</span>
            </div>
            {recent.map((tx, i) => (
              <div
                key={tx.id}
                className={`grid grid-cols-[120px_1fr_120px_140px_130px] px-4 py-2.5 text-sm hover:bg-[#F7F6F3] transition-colors ${
                  i < recent.length - 1 ? 'border-b border-[#EDE9E3]' : ''
                }`}
              >
                <span className="text-[#787774] text-xs self-center">
                  {formatDate(tx.date)}
                </span>
                <span className="text-[#37352F] truncate self-center pr-4">
                  {tx.merchant ?? tx.description}
                </span>
                <span className="text-[#787774] text-xs self-center truncate">
                  {tx.accountName}
                </span>
                <span className="self-center">
                  {tx.category ? (
                    <span className="text-xs text-[#787774] bg-[#EDE9E3] px-2 py-0.5">
                      {tx.category}
                    </span>
                  ) : (
                    <span className="text-xs text-[#ACABA8]">—</span>
                  )}
                </span>
                <span className={`text-right tabular-nums font-medium text-sm self-center ${
                  tx.type === 'credit' ? 'text-[#4CAF7D]' : 'text-[#37352F]'
                }`}>
                  {tx.type === 'credit' ? '+' : ''}
                  {formatCurrency(parseFloat(String(tx.amount)))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { db } from '@/lib/db'
import { transactions, accounts, categories, holdings, holdingPriceCache, holdingSnapshots } from '@/lib/db'
import { eq, and, gte, lte, desc, asc, sql, inArray } from 'drizzle-orm'
import { getLiveBalances } from '@/lib/get-live-balances'
import { MonthlyChart } from '@/components/monthly-chart'
import { CategoryChart } from '@/components/category-chart'
import { NetWorthChart } from '@/components/net-worth-chart'
import { PeriodSelector } from '@/components/period-selector'
import { Suspense } from 'react'
import { formatCurrency, formatDate, getPeriodDates } from '@/lib/utils'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Percent, ArrowRight, Plus } from 'lucide-react'

interface DashboardProps {
  searchParams: { period?: string; from?: string; to?: string }
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

  // For linked cash holdings, read the live balance from the most recent transaction.
  const linkedIds = rows
    .map((h) => h.linkedAccountId)
    .filter((id): id is string => id != null)

  const liveBalanceMap = await getLiveBalances(linkedIds)

  return rows.reduce((sum, h) => {
    if (h.type === 'etf' || h.type === 'stock') {
      const units = h.units != null ? parseFloat(String(h.units)) : null
      const price = h.ticker ? priceMap[h.ticker] : null
      const fallback = h.avgCostPerUnit != null ? parseFloat(String(h.avgCostPerUnit)) : null
      const effectivePrice = price ?? fallback
      return sum + (units != null && effectivePrice != null ? units * effectivePrice : 0)
    }
    // Cash/other: prefer live transaction balance if linked, else manualBalance
    if (h.linkedAccountId && liveBalanceMap[h.linkedAccountId] != null) {
      return sum + liveBalanceMap[h.linkedAccountId]!
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

async function getDashboardData(from: string, to: string) {

  // Subquery: names of categories flagged as transfers.
  const transferCategorySubquery = sql`(\n    SELECT name FROM ${categories} WHERE is_transfer = true\n  )`

  // ── Summary metrics ──────────────────────────────────────────────────────────
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

  const { from, to } = period === 'custom' && searchParams.from && searchParams.to
    ? { from: searchParams.from, to: searchParams.to }
    : getPeriodDates(period)

  const [
    { income, expenses, net, savingsRate, monthlyData, categoryData, recent },
    netWorth,
    snapshots,
  ] = await Promise.all([
    getDashboardData(from, to),
    getNetWorth(),
    getRecentSnapshots(),
  ])

  return (
    <div>

      {/* Page header */}
      <header className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Dashboard</h2>
          <p className="text-sm text-secondary mt-1">Welcome back</p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense>
            <PeriodSelector />
          </Suspense>
          <Link
            href="/import"
            className="flex items-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary px-5 py-2.5 rounded-3xl font-semibold text-sm hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <Plus className="size-4" />
            Import CSV
          </Link>
        </div>
      </header>

      {/* Summary cards — 3-col grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">

        {/* Income */}
        <div className="bg-white p-6 rounded-[24px] shadow-ambient relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Income</span>
            <ArrowUp className="size-5 text-primary shrink-0" />
          </div>
          <div className="text-4xl font-semibold text-primary tracking-tight tabular-nums">
            {formatCurrency(income)}
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-white p-6 rounded-[24px] shadow-ambient relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Expenses</span>
              <span className="text-[10px] text-secondary/60 mt-0.5">transfers excluded</span>
            </div>
            <ArrowDown className="size-5 text-tertiary shrink-0" />
          </div>
          <div className="text-4xl font-semibold text-tertiary tracking-tight tabular-nums">
            {formatCurrency(Math.abs(expenses))}
          </div>
        </div>

        {/* Savings rate */}
        <div className="bg-white p-6 rounded-[24px] shadow-ambient relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                {savingsRate !== null ? 'Savings rate' : 'Net cash flow'}
              </span>
              {savingsRate !== null && net !== 0 && (
                <span className={`text-[10px] mt-0.5 font-medium ${net >= 0 ? 'text-primary' : 'text-tertiary'}`}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net)} net
                </span>
              )}
            </div>
            <Percent className="size-5 text-secondary shrink-0" />
          </div>
          <div className="text-4xl font-semibold text-on-surface tracking-tight tabular-nums">
            {savingsRate !== null
              ? `${savingsRate}%`
              : `${net >= 0 ? '+' : ''}${formatCurrency(net)}`}
          </div>
        </div>

      </div>

      {/* Net worth — only shown when holdings exist */}
      {netWorth > 0 && (
        <section className="bg-white p-8 rounded-[24px] shadow-ambient mb-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Net worth</h3>
              <div className="text-5xl font-bold text-on-surface tracking-tighter tabular-nums mb-2">
                {formatCurrency(netWorth)}
              </div>
              <p className="text-sm text-secondary">Combined investments &amp; cash holdings</p>
            </div>
            <Link
              href="/holdings"
              className="flex items-center gap-1 text-primary font-medium text-sm hover:underline underline-offset-4 decoration-[0.5px]"
            >
              View holdings
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {snapshots.length >= 2 && (
            <div className="w-full bg-surface-container-low rounded-xl overflow-hidden">
              <NetWorthChart data={snapshots} />
            </div>
          )}
        </section>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-8 rounded-[24px] shadow-ambient">
          <h4 className="text-lg font-semibold text-on-surface mb-8">Monthly income vs expenses</h4>
          <MonthlyChart data={monthlyData} />
        </div>
        <div className="bg-white p-8 rounded-[24px] shadow-ambient">
          <h4 className="text-lg font-semibold text-on-surface mb-8">Spending by category</h4>
          <CategoryChart data={categoryData} />
        </div>
      </div>

      {/* Recent transactions */}
      <section className="bg-white p-8 rounded-[24px] shadow-ambient">
        <div className="flex justify-between items-center mb-8 px-2">
          <h3 className="text-lg font-semibold text-on-surface">Recent transactions</h3>
          <Link
            href="/transactions"
            className="flex items-center gap-1 text-primary font-medium text-sm hover:underline underline-offset-4 decoration-[0.5px]"
          >
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="text-sm text-secondary py-8 text-center">
            No transactions yet.{' '}
            <Link href="/import" className="underline hover:text-on-surface">
              Import a file
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-surface-container-low text-[10px] font-bold text-secondary uppercase tracking-widest">
                <tr>
                  <th className="py-4 px-2">Date</th>
                  <th className="py-4 px-2">Description</th>
                  <th className="py-4 px-2">Account</th>
                  <th className="py-4 px-2">Category</th>
                  <th className="py-4 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {recent.map((tx) => (
                  <tr key={tx.id} className="hover:bg-surface-container-low/40 transition-colors duration-200">
                    <td className="py-5 px-2 text-sm text-secondary tabular-nums whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="py-5 px-2 font-medium text-on-surface max-w-xs">
                      <p className="truncate">{tx.merchant ?? tx.description}</p>
                    </td>
                    <td className="py-5 px-2 text-sm italic text-secondary whitespace-nowrap">
                      {tx.accountName}
                    </td>
                    <td className="py-5 px-2">
                      {tx.category ? (
                        <span className="px-3 py-1 bg-secondary-container text-secondary rounded-full text-[10px] font-bold uppercase tracking-wide">
                          {tx.category}
                        </span>
                      ) : (
                        <span className="text-xs text-secondary">—</span>
                      )}
                    </td>
                    <td className={`py-5 px-2 text-right font-bold tabular-nums whitespace-nowrap ${
                      tx.type === 'credit' ? 'text-primary' : 'text-on-surface'
                    }`}>
                      {tx.type === 'credit' ? '+' : ''}
                      {formatCurrency(parseFloat(String(tx.amount)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}

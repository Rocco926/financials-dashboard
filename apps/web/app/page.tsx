import { db } from '@/lib/db'
import { transactions, accounts, categories } from '@/lib/db'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { MonthlyChart } from '@/components/monthly-chart'
import { CategoryChart } from '@/components/category-chart'
import { PeriodSelector } from '@/components/period-selector'
import { Suspense } from 'react'
import { formatCurrency, formatDate, getPeriodDates } from '@/lib/utils'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from 'lucide-react'

interface DashboardProps {
  searchParams: { period?: string }
}

async function getDashboardData(period: string) {
  const { from, to } = getPeriodDates(period)

  const [summary] = await db
    .select({
      totalIncome: sql<string>`COALESCE(SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0)`,
      totalExpenses: sql<string>`COALESCE(SUM(CASE WHEN amount::numeric < 0 THEN amount::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))

  const income = parseFloat(summary?.totalIncome ?? '0')
  const expenses = parseFloat(summary?.totalExpenses ?? '0')

  // Monthly chart — last 12 months regardless of period selector
  const monthlyRaw = await db.execute(sql`
    SELECT
      TO_CHAR(date::date, 'Mon ''YY') as month,
      DATE_TRUNC('month', date::date) as month_date,
      COALESCE(SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as income,
      COALESCE(ABS(SUM(CASE WHEN amount::numeric < 0 THEN amount::numeric ELSE 0 END)), 0) as expenses
    FROM transactions
    WHERE date::date >= CURRENT_DATE - INTERVAL '11 months'
    GROUP BY DATE_TRUNC('month', date::date), TO_CHAR(date::date, 'Mon ''YY')
    ORDER BY month_date ASC
  `)

  const monthlyData = (monthlyRaw as Array<{ month: string; income: string; expenses: string }>).map(
    (r) => ({
      month: r.month,
      income: parseFloat(r.income),
      expenses: parseFloat(r.expenses),
    }),
  )

  // Category breakdown (expenses only)
  const categoryRaw = await db
    .select({
      name: sql<string>`COALESCE(${transactions.category}, 'Uncategorised')`,
      value: sql<string>`ABS(SUM(${transactions.amount}::numeric))`,
      colour: categories.colour,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category, categories.name))
    .where(
      and(
        gte(transactions.date, from),
        lte(transactions.date, to),
        sql`${transactions.amount}::numeric < 0`,
      ),
    )
    .groupBy(transactions.category, categories.colour)
    .orderBy(sql`SUM(${transactions.amount}::numeric) ASC`)
    .limit(10)

  const categoryData = categoryRaw.map((r) => ({
    name: r.name,
    value: parseFloat(r.value),
    colour: r.colour ?? '#6b7280',
  }))

  // Recent transactions
  const recent = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      merchant: transactions.merchant,
      category: transactions.category,
      amount: transactions.amount,
      type: transactions.type,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(10)

  return { income, expenses, net: income + expenses, monthlyData, categoryData, recent }
}

function MetricCard({
  label,
  value,
  icon: Icon,
  colour,
}: {
  label: string
  value: number
  icon: React.ElementType
  colour: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-2xl font-semibold mt-1 ${colour}`}>
            {formatCurrency(Math.abs(value))}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-gray-50">
          <Icon className="w-5 h-5 text-gray-500" />
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const period = searchParams.period ?? 'month'
  const { income, expenses, net, monthlyData, categoryData, recent } =
    await getDashboardData(period)

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <Suspense>
          <PeriodSelector />
        </Suspense>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Income"
          value={income}
          icon={ArrowUpRight}
          colour="text-green-600"
        />
        <MetricCard
          label="Expenses"
          value={expenses}
          icon={ArrowDownRight}
          colour="text-orange-600"
        />
        <MetricCard
          label="Net cash flow"
          value={net}
          icon={net >= 0 ? TrendingUp : Minus}
          colour={net >= 0 ? 'text-blue-600' : 'text-red-600'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Monthly income vs expenses
          </h2>
          <MonthlyChart data={monthlyData} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Spending by category
          </h2>
          <CategoryChart data={categoryData} />
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">Recent transactions</h2>
          <Link
            href="/transactions"
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No transactions yet.{' '}
            <Link href="/import" className="underline">
              Import a file
            </Link>{' '}
            to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-3 py-3 text-gray-900">
                    {tx.merchant ?? tx.description}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    {tx.accountName}
                  </td>
                  <td className="px-3 py-3">
                    {tx.category ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                        {tx.category}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                    <span
                      className={
                        tx.type === 'credit' ? 'text-green-600' : 'text-gray-900'
                      }
                    >
                      {tx.type === 'credit' ? '+' : ''}
                      {formatCurrency(parseFloat(String(tx.amount)))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

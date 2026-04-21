import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db, categories, transactions, budgets } from '@/lib/db'
import { eq, and, sql, asc } from 'drizzle-orm'
import { BudgetsClient, type Period } from './budgets-client'

const VALID_PERIODS: Period[] = ['weekly', 'this_month', '3_months', 'all_time']

// Average weeks per month (365.25 / 12 / 7). Used to convert monthly budgets
// to weekly equivalents for display — budgets are always stored as monthly amounts.
export const WEEKS_PER_MONTH = 365.25 / 12 / 7

async function getBudgetData(period: Period) {
  // "Spent" aggregation changes with the period.
  // "Last month spent" is always current-month vs prior-month (for trend).
  // We do both in one pass via conditional aggregation — no second query needed.

  const spentCondition =
    period === 'weekly'
      ? sql`DATE_TRUNC('week', ${transactions.date}::date) = DATE_TRUNC('week', CURRENT_DATE)`
      : period === 'this_month'
      ? sql`DATE_TRUNC('month', ${transactions.date}::date) = DATE_TRUNC('month', CURRENT_DATE)`
      : period === '3_months'
      ? sql`${transactions.date}::date >= CURRENT_DATE - INTERVAL '3 months'`
      : sql`TRUE`

  const rows = await db
    .select({
      id:       categories.id,
      name:     categories.name,
      colour:   categories.colour,
      budgetId: budgets.id,
      amount:   budgets.amount,

      // Spent for the selected period
      spent: sql<string>`
        COALESCE(
          SUM(
            CASE
              WHEN ${transactions.amount}::numeric < 0
                AND (${spentCondition})
              THEN ABS(${transactions.amount}::numeric)
              ELSE 0
            END
          ),
          0
        )
      `,

      // Last month spend — always computed (used for trend on "this_month" view)
      spentLastMonth: sql<string>`
        COALESCE(
          SUM(
            CASE
              WHEN ${transactions.amount}::numeric < 0
                AND DATE_TRUNC('month', ${transactions.date}::date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
              THEN ABS(${transactions.amount}::numeric)
              ELSE 0
            END
          ),
          0
        )
      `,
    })
    .from(categories)
    .leftJoin(
      budgets,
      and(
        eq(budgets.categoryId, categories.id),
        sql`${budgets.month} = DATE_TRUNC('month', CURRENT_DATE)::date`,
      ),
    )
    .leftJoin(transactions, eq(transactions.category, categories.name))
    .where(and(eq(categories.isIncome, false), eq(categories.isTransfer, false)))
    .groupBy(
      categories.id,
      categories.name,
      categories.colour,
      budgets.id,
      budgets.amount,
    )
    .orderBy(asc(categories.name))

  return rows.map((r) => ({
    id:             r.id,
    budgetId:       r.budgetId ?? null,
    name:           r.name,
    colour:         r.colour,
    monthlyBudget:  r.amount != null ? parseFloat(String(r.amount)) : null,
    spent:          parseFloat(r.spent),
    spentLastMonth: parseFloat(r.spentLastMonth),
  }))
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const period: Period = VALID_PERIODS.includes(searchParams.period as Period)
    ? (searchParams.period as Period)
    : 'this_month'

  const rows = await getBudgetData(period)

  // Trend: total spent this month vs last month (only meaningful for "this_month" view)
  let trendPct: number | null = null
  if (period === 'this_month') {
    const thisMonth  = rows.filter((r) => r.monthlyBudget != null).reduce((s, r) => s + r.spent, 0)
    const lastMonth  = rows.filter((r) => r.monthlyBudget != null).reduce((s, r) => s + r.spentLastMonth, 0)
    if (lastMonth > 0) {
      trendPct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    }
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-on-surface">Budgets</h2>
        <p className="text-sm text-secondary mt-1">Manage your monthly allocations and spending habits.</p>
      </div>

      <BudgetsClient initialRows={rows} period={period} trendPct={trendPct} weeksPerMonth={WEEKS_PER_MONTH} />
    </>
  )
}

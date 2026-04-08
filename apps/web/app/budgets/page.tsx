import { db, categories, transactions } from '@/lib/db'
import { eq, and, sql, asc } from 'drizzle-orm'
import { BudgetsClient } from './budgets-client'

async function getBudgetData() {
  const rows = await db
    .select({
      id:            categories.id,
      name:          categories.name,
      colour:        categories.colour,
      monthlyBudget: categories.monthlyBudget,
      spent: sql<string>`
        COALESCE(
          ABS(SUM(
            CASE
              WHEN ${transactions.amount}::numeric < 0
              THEN ${transactions.amount}::numeric
              ELSE 0
            END
          )),
          0
        )
      `,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.category, categories.name),
        sql`DATE_TRUNC('month', ${transactions.date}::date) = DATE_TRUNC('month', CURRENT_DATE)`,
      ),
    )
    .where(eq(categories.isIncome, false))
    .groupBy(
      categories.id,
      categories.name,
      categories.colour,
      categories.monthlyBudget,
    )
    .orderBy(asc(categories.name))

  return rows.map((r) => ({
    id:            r.id,
    name:          r.name,
    colour:        r.colour,
    monthlyBudget: r.monthlyBudget != null ? parseFloat(String(r.monthlyBudget)) : null,
    spent:         parseFloat(r.spent),
  }))
}

export default async function BudgetsPage() {
  const rows = await getBudgetData()

  const monthName = new Date().toLocaleDateString('en-AU', {
    month: 'long',
    year:  'numeric',
  })

  return (
    <>
      {/* Page header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">Budgets</h2>
          <p className="text-sm text-secondary mt-1">Manage your monthly allocations</p>
        </div>
        <span className="text-sm text-secondary">{monthName}</span>
      </div>

      <BudgetsClient initialRows={rows} />
    </>
  )
}

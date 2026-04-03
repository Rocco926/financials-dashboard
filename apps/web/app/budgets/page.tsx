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
    <div className="px-10 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-medium text-[#37352F]">Budgets</h1>
        <p className="text-sm text-[#787774] mt-0.5">{monthName}</p>
      </div>

      <BudgetsClient initialRows={rows} />
    </div>
  )
}

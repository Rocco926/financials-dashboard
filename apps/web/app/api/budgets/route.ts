/**
 * GET /api/budgets
 *
 * Returns all non-income categories with their monthlyBudget and how much
 * was spent in the current calendar month.
 *
 * QUERY DESIGN
 * ────────────
 * Left-joins transactions so categories with zero spend still appear.
 * Filters to current month using DATE_TRUNC so the month boundary is exact
 * regardless of what timezone the server is in (Supabase uses UTC).
 * Only sums negative amounts (debits) — credits are ignored.
 *
 * RESPONSE
 * ────────
 * { data: Array<{ id, name, colour, monthlyBudget: number|null, spent: number }> }
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, categories, transactions } from '@/lib/db'
import { eq, and, sql } from 'drizzle-orm'
import { asc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const data = rows.map((r) => ({
    id:            r.id,
    name:          r.name,
    colour:        r.colour,
    monthlyBudget: r.monthlyBudget != null ? parseFloat(String(r.monthlyBudget)) : null,
    spent:         parseFloat(r.spent),
  }))

  return NextResponse.json({ data })
}

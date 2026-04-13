/**
 * GET  /api/budgets — all non-income, non-transfer categories with budget + spend data
 * POST /api/budgets — upsert a budget for a category for the current month
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, categories, transactions, budgets } from '@/lib/db'
import { eq, and, sql, asc } from 'drizzle-orm'
import { z } from 'zod'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id:       categories.id,
      name:     categories.name,
      colour:   categories.colour,
      budgetId: budgets.id,
      amount:   budgets.amount,
      spent: sql<string>`
        COALESCE(
          SUM(
            CASE
              WHEN ${transactions.amount}::numeric < 0
                AND DATE_TRUNC('month', ${transactions.date}::date) = DATE_TRUNC('month', CURRENT_DATE)
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

  const data = rows.map((r) => ({
    id:           r.id,
    budgetId:     r.budgetId ?? null,
    name:         r.name,
    colour:       r.colour,
    monthlyBudget: r.amount != null ? parseFloat(String(r.amount)) : null,
    spent:        parseFloat(r.spent),
  }))

  return NextResponse.json({ data })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

const postSchema = z.object({
  categoryId: z.string().uuid(),
  amount:     z.number().positive(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { categoryId, amount } = parsed.data

  // First day of current month in YYYY-MM-DD format (server-side, UTC-safe)
  const now   = new Date()
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const [row] = await db
    .insert(budgets)
    .values({ categoryId, amount: String(amount), month })
    .onConflictDoUpdate({
      target:     [budgets.categoryId, budgets.month],
      set: {
        amount:    String(amount),
        updatedAt: new Date(),
      },
    })
    .returning()

  return NextResponse.json({ data: row }, { status: 201 })
}

/**
 * GET  /api/transactions/bulk-categorise?pattern=NORMALISED_DESC
 *   Returns the count of uncategorised transactions whose normalised description
 *   exactly matches `pattern`. Used by CategoryEditor to decide whether to show
 *   the "apply to all similar" prompt after the user categorises one transaction.
 *
 *   Note: Next.js App Router gives static segments priority over dynamic [id]
 *   segments, so this route correctly takes precedence over /api/transactions/[id].
 *
 * POST /api/transactions/bulk-categorise
 *   Body: { pattern: string, category: string }
 *   Applies `category` to all uncategorised transactions matching `pattern`.
 *   Returns { updated: number } — the count of rows changed.
 *
 *   The category_rules entry for this pattern is already written by the preceding
 *   PATCH /api/transactions/[id] call, so this route only touches the transactions
 *   table (retroactive application to existing uncategorised rows).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transactions, categoryRules } from '@/lib/db'
import { and, gte, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pattern = request.nextUrl.searchParams.get('pattern')
  if (!pattern) {
    return NextResponse.json({ error: 'pattern query param is required' }, { status: 400 })
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        sql`upper(trim(${transactions.description})) = ${pattern}`,
        isNull(transactions.category),
      ),
    )

  return NextResponse.json({ count: row?.count ?? 0 })
}

const postSchema = z.object({
  pattern:  z.string().min(1),
  category: z.string().min(1),
  /** Optional date range — when set, only uncategorised transactions within the
   *  range are updated. The category_rule is always written for all future imports. */
  from: z.string().optional(),
  to:   z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await request.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const { pattern, category, from, to } = parsed.data

  const [updated] = await Promise.all([
    db
      .update(transactions)
      .set({ category, categorySource: 'user' })
      .where(
        and(
          sql`upper(trim(${transactions.description})) = ${pattern}`,
          isNull(transactions.category),
          from ? gte(transactions.date, from) : undefined,
          to   ? lte(transactions.date, to)   : undefined,
        ),
      )
      .returning({ id: transactions.id }),

    // Write (or overwrite) the category_rule so future imports auto-classify.
    // The single-PATCH flow does this itself; we do it here too so the
    // categorise page works without a preceding single-PATCH call.
    db
      .insert(categoryRules)
      .values({ merchantPattern: pattern, category, source: 'manual' })
      .onConflictDoUpdate({
        target:  categoryRules.merchantPattern,
        set:     { category, source: 'manual', updatedAt: new Date() },
      }),
  ])

  return NextResponse.json({ updated: updated.length })
}

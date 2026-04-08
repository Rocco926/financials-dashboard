/**
 * GET /api/transactions
 *
 * Returns a paginated, filtered list of transactions with their account name.
 * Used by the transactions page and (in future) any client-side data fetching.
 *
 * NOTE: The transactions page currently uses direct DB queries in a Server
 * Component rather than calling this API route. This route exists for
 * potential client-side use (e.g. if the transactions table is ever made
 * fully client-rendered with live filtering).
 *
 * QUERY PARAMETERS
 * ─────────────────
 * All parameters are optional. Without any params, returns the first 50
 * transactions ordered by date descending.
 *
 *   accountId  string (UUID)           — Filter to one account
 *   from       string (YYYY-MM-DD)     — Earliest transaction date (inclusive)
 *   to         string (YYYY-MM-DD)     — Latest transaction date (inclusive)
 *   category   string                  — Exact category name match
 *   type       'credit' | 'debit'      — Filter by transaction direction
 *   search     string                  — Case-insensitive substring match on description
 *   page       number (default: 1)     — 1-based page number
 *   limit      number (default: 50, max: 200) — Results per page
 *
 * RESPONSE FORMAT
 * ────────────────
 * {
 *   data: Array<{
 *     id, date, description, merchant, category, amount, balance,
 *     type, notes, accountId, accountName
 *   }>,
 *   pagination: { page, limit, total, totalPages }
 * }
 *
 * ORDERING
 * ─────────
 * Primary: date DESC (most recent first)
 * Secondary: createdAt DESC (tiebreaker for same-date transactions)
 *
 * PERFORMANCE NOTE
 * ─────────────────
 * We run two queries in parallel (Promise.all): one for the data page and one
 * for the total count. This is more efficient than running them sequentially.
 * The WHERE clause is built dynamically based on which filters are present.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transactions, accounts } from '@/lib/db'
import { and, eq, gte, lte, ilike, desc, count, sql } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Zod schema for query parameter validation and coercion.
 *
 * `z.coerce.number()` converts string URL params to numbers automatically,
 * so `page=2` (string) becomes `2` (number) without manual parseInt().
 */
const querySchema = z.object({
  accountId: z.string().uuid().optional(),
  from:      z.string().optional(),                              // YYYY-MM-DD
  to:        z.string().optional(),                              // YYYY-MM-DD
  category:  z.string().optional(),
  type:      z.enum(['credit', 'debit']).optional(),
  search:    z.string().optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Convert URLSearchParams to a plain object for Zod parsing
  const params = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query params', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { accountId, from, to, category, type, search, page, limit } = parsed.data
  const offset = (page - 1) * limit

  // Build the WHERE clause dynamically.
  // Each active filter adds a condition. Drizzle's `and()` combines them.
  // If no filters are active, `where` is undefined → no WHERE clause → all rows.
  const conditions = []
  if (accountId) conditions.push(eq(transactions.accountId, accountId))
  if (from)      conditions.push(gte(transactions.date, from))    // date >= from
  if (to)        conditions.push(lte(transactions.date, to))      // date <= to
  if (category)  conditions.push(eq(transactions.category, category))
  if (type)      conditions.push(eq(transactions.type, type))
  if (search) {
    // ilike = case-insensitive LIKE. The % wildcards allow substring matching.
    // e.g. search='woolworths' matches 'WOOLWORTHS 1234 SYDNEY'
    conditions.push(ilike(transactions.description, `%${search}%`))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  // Run data query and count query in parallel for efficiency.
  // Both use the same WHERE clause so they're consistent.
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id:          transactions.id,
        date:        transactions.date,
        description: transactions.description,
        merchant:    transactions.merchant,
        category:    transactions.category,
        amount:      transactions.amount,
        balance:     transactions.balance,
        type:        transactions.type,
        notes:       transactions.notes,
        accountId:   transactions.accountId,
        // LEFT JOIN to get the account name — null if account was deleted
        accountName: accounts.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset),

    // Count query: same WHERE, no JOIN needed (we only need the total)
    db
      .select({ total: count() })
      .from(transactions)
      .where(where),
  ])

  const total = countRows[0]?.total ?? 0

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      limit,
      total:       Number(total),
      totalPages:  Math.ceil(Number(total) / limit),
    },
  })
}

/**
 * DELETE /api/transactions?accountId=<uuid>
 *
 * Deletes ALL transactions for a given account.
 * Requires accountId — will not delete across all accounts without one.
 * Returns the count of deleted rows.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = request.nextUrl.searchParams.get('accountId')
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
  }

  const deleted = await db
    .delete(transactions)
    .where(eq(transactions.accountId, accountId))
    .returning({ id: transactions.id })

  return NextResponse.json({ deleted: deleted.length })
}

/**
 * GET /api/accounts
 *
 * Returns all bank accounts with aggregated statistics.
 * Used by the import wizard (account picker) and could be used by a future
 * accounts management page.
 *
 * RESPONSE FORMAT
 * ────────────────
 * Array of:
 * {
 *   id:               string (UUID)
 *   name:             string       — e.g. "Westpac Everyday"
 *   institution:      string       — e.g. "Westpac"
 *   type:             AccountType  — transaction | savings | credit_card | loan
 *   currency:         string       — e.g. "AUD"
 *   lastImportedAt:   string | null — ISO timestamp of most recent import
 *   createdAt:        string       — ISO timestamp when account was created
 *   transactionCount: number       — Total transactions imported for this account
 *   latestBalance:    string | null — Most recent balance value (from balance column)
 * }
 *
 * QUERY DESIGN
 * ─────────────
 * We use a LEFT JOIN + GROUP BY to compute per-account aggregates in a single
 * database round-trip. The LEFT JOIN ensures accounts with zero transactions
 * still appear in the result (their count will be 0, balance will be null).
 *
 * `max(transactions.balance)` is used as a proxy for "latest balance" because
 * the balance column isn't always present (QIF imports have no balance) and
 * we don't have a guaranteed ordering within the query. A proper "latest balance"
 * would require ordering by date and taking the last row — left as a future improvement.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { accounts, transactions } from '@/lib/db'
import { eq, max, count } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id:               accounts.id,
      name:             accounts.name,
      institution:      accounts.institution,
      type:             accounts.type,
      currency:         accounts.currency,
      lastImportedAt:   accounts.lastImportedAt,
      createdAt:        accounts.createdAt,
      transactionCount: count(transactions.id),
      latestBalance:    max(transactions.balance),
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .groupBy(accounts.id)
    .orderBy(accounts.name)

  return NextResponse.json(rows)
}

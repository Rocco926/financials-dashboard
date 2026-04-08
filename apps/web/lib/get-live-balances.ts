/**
 * getLiveBalances — fetches the most recent transaction balance for each
 * given account ID, using one LIMIT 1 query per account run in parallel.
 *
 * WHY NOT A SINGLE QUERY?
 * ───────────────────────
 * The naïve single-query approach (fetch all transactions for all linked
 * accounts ordered by date DESC, then pick the first per account in JS)
 * is unbounded — if an account has thousands of transactions it returns all
 * of them just to use one row. The correct single-query alternative would be
 * `DISTINCT ON (account_id)` (PostgreSQL-specific), but for a personal finance
 * app with at most a handful of linked accounts, N parallel LIMIT-1 queries are
 * simpler, fully type-safe, and plenty fast.
 */
import { db } from '@/lib/db'
import { transactions } from '@/lib/db'
import { and, eq, desc, isNotNull } from 'drizzle-orm'

export async function getLiveBalances(
  accountIds: string[],
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {}

  const entries = await Promise.all(
    accountIds.map(async (accountId) => {
      const [row] = await db
        .select({ balance: transactions.balance })
        .from(transactions)
        .where(and(eq(transactions.accountId, accountId), isNotNull(transactions.balance)))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(1)
      const value = row?.balance != null ? parseFloat(String(row.balance)) : null
      return [accountId, value] as const
    }),
  )

  return Object.fromEntries(
    entries.filter((e): e is [string, number] => e[1] != null),
  )
}

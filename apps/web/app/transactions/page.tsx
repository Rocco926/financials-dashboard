import { db } from '@/lib/db'
import { transactions, accounts, categories } from '@/lib/db'
import { and, eq, gte, lte, ilike, desc, count, sql } from 'drizzle-orm'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CategoryEditor } from './category-editor'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PageProps {
  searchParams: {
    page?: string
    accountId?: string
    from?: string
    to?: string
    category?: string
    type?: string
    search?: string
  }
}

const LIMIT = 50

async function getTransactions(params: PageProps['searchParams']) {
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  const conditions = []
  if (params.accountId) conditions.push(eq(transactions.accountId, params.accountId))
  if (params.from) conditions.push(gte(transactions.date, params.from))
  if (params.to) conditions.push(lte(transactions.date, params.to))
  if (params.category) conditions.push(eq(transactions.category, params.category))
  if (params.type && (params.type === 'credit' || params.type === 'debit')) {
    conditions.push(eq(transactions.type, params.type))
  }
  if (params.search) {
    conditions.push(ilike(transactions.description, `%${params.search}%`))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [totalRow], allAccounts, allCategories] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        merchant: transactions.merchant,
        category: transactions.category,
        amount: transactions.amount,
        balance: transactions.balance,
        type: transactions.type,
        accountName: accounts.name,
        accountId: transactions.accountId,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(LIMIT)
      .offset(offset),

    db.select({ total: count() }).from(transactions).where(where),

    db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(accounts.name),

    db
      .select({ name: categories.name, colour: categories.colour })
      .from(categories)
      .orderBy(categories.name),
  ])

  return {
    rows,
    total: Number(totalRow?.total ?? 0),
    page,
    totalPages: Math.ceil(Number(totalRow?.total ?? 0) / LIMIT),
    allAccounts,
    allCategories,
  }
}

function buildUrl(
  current: PageProps['searchParams'],
  overrides: Partial<PageProps['searchParams']>,
): string {
  const params = new URLSearchParams()
  const merged = { ...current, ...overrides }
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v)
  }
  return `/transactions?${params.toString()}`
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const { rows, total, page, totalPages, allAccounts, allCategories } =
    await getTransactions(searchParams)

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>
        <span className="text-sm text-gray-500">{total.toLocaleString()} total</span>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="search"
          type="search"
          placeholder="Search description…"
          defaultValue={searchParams.search}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 w-48"
        />

        <select
          name="accountId"
          defaultValue={searchParams.accountId ?? ''}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="">All accounts</option>
          {allAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={searchParams.category ?? ''}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="">All categories</option>
          {allCategories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          name="type"
          defaultValue={searchParams.type ?? ''}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="">Credit & debit</option>
          <option value="credit">Credits only</option>
          <option value="debit">Debits only</option>
        </select>

        <input
          name="from"
          type="date"
          defaultValue={searchParams.from}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <input
          name="to"
          type="date"
          defaultValue={searchParams.to}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />

        <button
          type="submit"
          className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Filter
        </button>

        {Object.values(searchParams).some(Boolean) && (
          <Link
            href="/transactions"
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            No transactions found.{' '}
            {!Object.values(searchParams).some(Boolean) && (
              <Link href="/import" className="underline">
                Import a file
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">Description</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">Account</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">Category</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-3 py-3 text-gray-900 max-w-xs">
                    <p className="truncate">{tx.merchant ?? tx.description}</p>
                    {tx.merchant && tx.merchant !== tx.description && (
                      <p className="text-xs text-gray-400 truncate">{tx.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {tx.accountName}
                  </td>
                  <td className="px-3 py-3">
                    <CategoryEditor
                      transactionId={tx.id}
                      currentCategory={tx.category}
                      categories={allCategories}
                    />
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl(searchParams, { page: String(page - 1) })}
                className="flex items-center gap-1 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(searchParams, { page: String(page + 1) })}
                className="flex items-center gap-1 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { db } from '@/lib/db'
import { transactions, accounts, categories } from '@/lib/db'
import { and, eq, gte, lte, ilike, desc, count, sql } from 'drizzle-orm'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CategoryEditor } from './category-editor'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react'

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
  const page   = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * LIMIT

  const conditions = []
  if (params.accountId) conditions.push(eq(transactions.accountId, params.accountId))
  if (params.from)      conditions.push(gte(transactions.date, params.from))
  if (params.to)        conditions.push(lte(transactions.date, params.to))
  if (params.category)  conditions.push(eq(transactions.category, params.category))
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
        id:          transactions.id,
        date:        transactions.date,
        description: transactions.description,
        merchant:    transactions.merchant,
        category:    transactions.category,
        amount:      transactions.amount,
        balance:     transactions.balance,
        type:        transactions.type,
        accountName: accounts.name,
        accountId:   transactions.accountId,
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
    total:      Number(totalRow?.total ?? 0),
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

  const hasFilters = Object.values(searchParams).some(Boolean)

  return (
    <div className="px-10 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-[#37352F] text-balance">Transactions</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#787774]">{total.toLocaleString()} transactions</span>
          <Link
            href="/import"
            className="flex items-center gap-1.5 text-sm text-[#37352F] border border-[#37352F] px-3 py-1.5 hover:bg-[#37352F] hover:text-white transition-colors rounded-md"
          >
            <Upload className="size-3.5" />
            Import
          </Link>
        </div>
      </div>

      {/* Filters — inline, understated */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input
          name="search"
          type="search"
          placeholder="Search…"
          defaultValue={searchParams.search}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] w-44 transition-colors rounded-md"
        />
        <select
          name="accountId"
          defaultValue={searchParams.accountId ?? ''}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors rounded-md"
        >
          <option value="">All accounts</option>
          {allAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={searchParams.category ?? ''}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors rounded-md"
        >
          <option value="">All categories</option>
          {allCategories.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={searchParams.type ?? ''}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors rounded-md"
        >
          <option value="">All types</option>
          <option value="credit">Credits</option>
          <option value="debit">Debits</option>
        </select>
        <input
          name="from"
          type="date"
          defaultValue={searchParams.from}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors rounded-md"
        />
        <input
          name="to"
          type="date"
          defaultValue={searchParams.to}
          className="border border-[#E9E7E2] bg-white px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors rounded-md"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm text-[#37352F] border border-[#37352F] hover:bg-[#37352F] hover:text-white transition-colors rounded-md"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/transactions"
            className="px-3 py-1.5 text-sm text-[#787774] hover:text-[#37352F] transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-white border border-[#E9E7E2] rounded-lg">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-[#787774]">
            No transactions found.{' '}
            {!hasFilters && (
              <Link href="/import" className="underline hover:text-[#37352F] transition-colors">
                Import a file to get started.
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9E7E2]">
                <th className="px-4 py-2.5 text-left section-label font-medium">Date</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">Description</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">Account</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">Category</th>
                <th className="px-4 py-2.5 text-right section-label font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-[#EDE9E3] last:border-0 hover:bg-[#F7F6F3] transition-colors"
                >
                  <td className="px-4 py-2.5 text-[#787774] whitespace-nowrap text-xs">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-4 py-2.5 text-[#37352F] max-w-xs">
                    <p className="truncate">{tx.merchant ?? tx.description}</p>
                    {tx.merchant && tx.merchant !== tx.description && (
                      <p className="text-xs text-[#ACABA8] truncate mt-0.5">{tx.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#787774] text-xs whitespace-nowrap">
                    {tx.accountName}
                  </td>
                  <td className="px-4 py-2.5">
                    <CategoryEditor
                      transactionId={tx.id}
                      currentCategory={tx.category}
                      categories={allCategories}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">
                    <span className={tx.type === 'credit' ? 'text-[#4CAF7D]' : 'text-[#37352F]'}>
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
          <span className="text-[#787774]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl(searchParams, { page: String(page - 1) })}
                className="flex items-center gap-1 border border-[#E9E7E2] px-3 py-1.5 text-[#787774] hover:border-[#37352F] hover:text-[#37352F] transition-colors rounded-md"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(searchParams, { page: String(page + 1) })}
                className="flex items-center gap-1 border border-[#E9E7E2] px-3 py-1.5 text-[#787774] hover:border-[#37352F] hover:text-[#37352F] transition-colors rounded-md"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

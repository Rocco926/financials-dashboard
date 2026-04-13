import { db } from '@/lib/db'
import { transactions, accounts, categories } from '@/lib/db'
import { and, eq, gte, lte, ilike, isNull, desc, count, sql } from 'drizzle-orm'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CategoryEditor } from './category-editor'
import { DeleteButton } from './delete-button'
import { ClearAccountButton } from './clear-account-button'
import { TransactionFilters } from './transaction-filters'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Tags } from 'lucide-react'

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
  if (params.category === '__uncategorised') {
    conditions.push(isNull(transactions.category))
  } else if (params.category) {
    conditions.push(eq(transactions.category, params.category))
  }
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

  const offset = (page - 1) * LIMIT

  return (
    <>
      {/* Page header */}
      <header className="flex justify-between items-center h-20 mb-8">
        <div className="flex items-baseline gap-3">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Transactions</h2>
          <span className="text-sm font-medium text-secondary tabular-nums bg-surface-container-low px-2.5 py-0.5 rounded-full">
            {total.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ClearAccountButton accounts={allAccounts} />
          <Link
            href="/transactions/categorise"
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-3xl font-semibold text-sm hover:bg-primary-dim transition-all active:scale-95 shadow-ambient"
          >
            <Tags className="size-4" />
            Categorise
          </Link>
        </div>
      </header>

      {/* Filter bar */}
      <section className="mb-8">
        <div className="bg-white rounded-2xl shadow-ambient px-6 py-4 flex flex-wrap lg:flex-nowrap items-center gap-4">
          <TransactionFilters
            accounts={allAccounts}
            categories={allCategories}
            current={searchParams}
            hasFilters={hasFilters}
          />
        </div>
      </section>

      {/* Transactions table card */}
      <section className="bg-white rounded-2xl shadow-ambient overflow-hidden">

        {/* Table header */}
        <div className="bg-surface-container-low grid grid-cols-[100px_1fr_150px_150px_120px_60px] px-8 py-4 text-[11px] font-extrabold uppercase tracking-widest text-secondary/70">
          <div>Date</div>
          <div>Description</div>
          <div>Account</div>
          <div>Category</div>
          <div className="text-right">Amount</div>
          <div className="text-center" />
        </div>

        {/* Rows */}
        <div className="divide-y divide-surface-container-low/60">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-secondary">
              No transactions found.{' '}
              {!hasFilters && (
                <Link href="/import" className="underline hover:text-on-surface transition-colors">
                  Import a file to get started.
                </Link>
              )}
            </div>
          ) : (
            rows.map((tx) => (
              <div
                key={tx.id}
                className="grid grid-cols-[100px_1fr_150px_150px_120px_60px] items-center px-8 py-5 hover:bg-surface-container-low/40 transition-all duration-200 group"
              >
                {/* Date */}
                <div className="text-sm text-secondary font-medium">
                  {formatDate(tx.date)}
                </div>

                {/* Description / merchant */}
                <div className="text-sm font-medium text-on-surface min-w-0">
                  <p className="truncate">{tx.merchant ?? tx.description}</p>
                  {tx.merchant && tx.merchant !== tx.description && (
                    <p className="text-xs text-secondary truncate mt-0.5">{tx.description}</p>
                  )}
                </div>

                {/* Account */}
                <div className="text-xs text-secondary italic truncate">
                  {tx.accountName}
                </div>

                {/* Category */}
                <div>
                  <CategoryEditor
                    transactionId={tx.id}
                    currentCategory={tx.category}
                    categories={allCategories}
                    description={tx.description}
                  />
                </div>

                {/* Amount */}
                <div className={`text-sm font-bold text-right tabular-nums ${tx.type === 'credit' ? 'text-primary' : 'text-on-surface'}`}>
                  {tx.type === 'credit' ? '+' : ''}
                  {formatCurrency(parseFloat(String(tx.amount)))}
                </div>

                {/* Actions */}
                <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <DeleteButton transactionId={tx.id} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table footer / pagination */}
        <div className="bg-surface-container-low/50 px-8 py-4 flex justify-between items-center">
          <span className="text-xs text-secondary">
            Showing {Math.min(offset + rows.length, total).toLocaleString()} of {total.toLocaleString()} transactions
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildUrl(searchParams, { page: String(page - 1) })}
                className="p-1.5 rounded-full bg-white shadow-ambient hover:bg-surface-container-low transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-secondary" />
              </Link>
            ) : (
              <button
                disabled
                className="p-1.5 rounded-full hover:bg-surface-container-low transition-colors opacity-40 cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-secondary" />
              </button>
            )}
            {page < totalPages ? (
              <Link
                href={buildUrl(searchParams, { page: String(page + 1) })}
                className="p-1.5 rounded-full bg-white shadow-ambient hover:bg-surface-container-low transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4 text-secondary" />
              </Link>
            ) : (
              <button
                disabled
                className="p-1.5 rounded-full hover:bg-surface-container-low transition-colors opacity-40 cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4 text-secondary" />
              </button>
            )}
          </div>
        </div>

      </section>
    </>
  )
}

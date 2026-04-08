'use client'

import { useRouter } from 'next/navigation'
import { useRef, useEffect } from 'react'
import Link from 'next/link'

interface Account  { id: string; name: string }
interface Category { name: string; colour: string }

interface Props {
  accounts:   Account[]
  categories: Category[]
  current: {
    search?:    string
    accountId?: string
    category?:  string
    type?:      string
    from?:      string
    to?:        string
  }
  hasFilters: boolean
}

export function TransactionFilters({ accounts, categories, current, hasFilters }: Props) {
  const router = useRouter()
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  /** Build a /transactions URL from the current filters merged with any overrides.
   *  Always resets to page 1 so you don't land on a now-empty page. */
  function buildUrl(overrides: Partial<Props['current']>): string {
    const merged = { ...current, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v)
    }
    return `/transactions?${params.toString()}`
  }

  /** Applies a filter change immediately. */
  function apply(overrides: Partial<Props['current']>) {
    router.push(buildUrl(overrides))
  }

  /** Applies only after the user stops typing for 400 ms (search input). */
  function applyDebounced(overrides: Partial<Props['current']>) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => apply(overrides), 400)
  }

  const inputCls = "bg-white shadow-sm px-3 py-1.5 text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all rounded-xl border border-secondary-container"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        name="search"
        type="search"
        placeholder="Search…"
        defaultValue={current.search}
        onChange={(e) => applyDebounced({ search: e.target.value })}
        className={`${inputCls} w-44`}
      />
      <select
        name="accountId"
        value={current.accountId ?? ''}
        onChange={(e) => apply({ accountId: e.target.value })}
        className={inputCls}
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select
        name="category"
        value={current.category ?? ''}
        onChange={(e) => apply({ category: e.target.value })}
        className={inputCls}
      >
        <option value="">All categories</option>
        <option value="__uncategorised">— Uncategorised only —</option>
        {categories.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
      <select
        name="type"
        value={current.type ?? ''}
        onChange={(e) => apply({ type: e.target.value })}
        className={inputCls}
      >
        <option value="">All types</option>
        <option value="credit">Credits</option>
        <option value="debit">Debits</option>
      </select>
      <input
        name="from"
        type="date"
        value={current.from ?? ''}
        onChange={(e) => apply({ from: e.target.value })}
        className={inputCls}
      />
      <input
        name="to"
        type="date"
        value={current.to ?? ''}
        onChange={(e) => apply({ to: e.target.value })}
        className={inputCls}
      />
      {hasFilters && (
        <Link
          href="/transactions"
          className="px-3 py-1.5 text-sm text-secondary hover:text-on-surface transition-colors"
        >
          Clear
        </Link>
      )}
    </div>
  )
}

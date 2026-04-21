'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingDown, ShoppingBag, Calendar, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AnalyticsPeriod = 'this_month' | '3_months' | '6_months' | 'this_year'

interface CategoryRow {
  name:   string
  colour: string
  total:  number
  count:  number
}

interface MerchantRow {
  merchant: string
  count:    number
  total:    number
}

interface Props {
  rows:         CategoryRow[]
  totalSpent:   number
  topCategory:  CategoryRow | null
  avgPerDay:    number
  period:       AnalyticsPeriod
  from:         string
  to:           string
  initialCategory: string | null
}

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'this_month',  label: 'This month'  },
  { value: '3_months',    label: '3 months'    },
  { value: '6_months',    label: '6 months'    },
  { value: 'this_year',   label: 'This year'   },
]

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon:  React.ElementType
  label: string
  value: string
  sub?:  string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-ambient p-6 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-secondary mb-1">
        <Icon className="size-4" strokeWidth={1.5} />
        <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold text-on-surface tracking-tight">{value}</p>
      {sub && <p className="text-xs text-secondary">{sub}</p>}
    </div>
  )
}

export function AnalyticsClient({
  rows,
  totalSpent,
  topCategory,
  avgPerDay,
  period,
  from,
  to,
  initialCategory,
}: Props) {
  const router = useRouter()

  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory)
  const [merchants, setMerchants]               = useState<MerchantRow[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(false)

  const maxTotal = rows[0]?.total ?? 1

  const fetchMerchants = useCallback(async (category: string) => {
    setLoadingMerchants(true)
    try {
      const params = new URLSearchParams({ category, from, to })
      const res  = await fetch(`/api/transactions/by-merchant?${params}`)
      if (!res.ok) {
        setMerchants([])
        return
      }
      const data = await res.json() as { merchants: MerchantRow[] }
      setMerchants(data.merchants ?? [])
    } catch {
      setMerchants([])
    } finally {
      setLoadingMerchants(false)
    }
  }, [from, to])

  useEffect(() => {
    if (selectedCategory) {
      void fetchMerchants(selectedCategory)
    } else {
      setMerchants([])
    }
  }, [selectedCategory, fetchMerchants])

  function selectPeriod(p: AnalyticsPeriod) {
    router.push(`/analytics?period=${p}`)
  }

  function handleCategoryClick(name: string) {
    if (selectedCategory === name) {
      setSelectedCategory(null)
    } else {
      setSelectedCategory(name)
    }
  }

  return (
    <div className="space-y-6">

      {/* Period selector */}
      <div className="inline-flex bg-white shadow-ambient rounded-full p-1 gap-0.5">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => selectPeriod(value)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              period === value
                ? 'bg-secondary-container text-on-surface'
                : 'text-secondary hover:text-on-surface hover:bg-surface-container-low',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={TrendingDown}
          label="Total spent"
          value={fmt(totalSpent)}
          sub={`${from} – ${to}`}
        />
        <StatCard
          icon={Calendar}
          label="Avg per day"
          value={fmt(avgPerDay)}
        />
        <StatCard
          icon={ShoppingBag}
          label="Top category"
          value={topCategory?.name ?? '—'}
          sub={topCategory ? fmt(topCategory.total) : undefined}
        />
      </div>

      {/* Main content: categories + merchant panel */}
      <div className="grid grid-cols-5 gap-4">

        {/* Category bars — 3 cols */}
        <div className="col-span-3 bg-white rounded-2xl shadow-ambient p-6">
          <h3 className="text-sm font-semibold text-on-surface mb-4">Spending by category</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-secondary py-8 text-center">No spend data for this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((row) => {
                const pct    = (row.total / maxTotal) * 100
                const active = selectedCategory === row.name
                return (
                  <li key={row.name}>
                    <button
                      onClick={() => handleCategoryClick(row.name)}
                      className={cn(
                        'w-full text-left group rounded-xl px-3 py-2 transition-all duration-150',
                        active
                          ? 'bg-surface-container-low ring-1 ring-inset ring-outline-variant'
                          : 'hover:bg-surface-container-low',
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ background: row.colour }}
                          />
                          <span className="text-sm font-medium text-on-surface">{row.name}</span>
                          <span className="text-xs text-secondary">{row.count} txn{row.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-on-surface">{fmt(row.total)}</span>
                          <ChevronRight
                            className={cn(
                              'size-3.5 text-secondary transition-transform duration-150',
                              active ? 'rotate-90' : 'group-hover:translate-x-0.5',
                            )}
                            strokeWidth={1.5}
                          />
                        </div>
                      </div>
                      <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, background: row.colour }}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Merchant panel — 2 cols */}
        <div className="col-span-2 bg-white rounded-2xl shadow-ambient p-6">
          {!selectedCategory ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <ShoppingBag className="size-8 text-secondary/40 mb-3" strokeWidth={1} />
              <p className="text-sm font-medium text-secondary">Select a category</p>
              <p className="text-xs text-secondary/60 mt-1">to see top merchants</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">{selectedCategory}</h3>
                  <p className="text-xs text-secondary mt-0.5">Top merchants</p>
                </div>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-secondary hover:text-on-surface transition-colors"
                >
                  Clear
                </button>
              </div>

              {loadingMerchants ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 text-secondary animate-spin" />
                </div>
              ) : merchants.length === 0 ? (
                <p className="text-sm text-secondary text-center py-8">No merchants found.</p>
              ) : (
                <ul className="space-y-1.5">
                  {merchants.map((m, i) => {
                    const merchantMax = merchants[0]?.total ?? 1
                    const pct = (m.total / merchantMax) * 100
                    return (
                      <li key={m.merchant} className="flex flex-col gap-1 px-2 py-1.5 rounded-lg hover:bg-surface-container-low transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-secondary/50 tabular-nums w-4 shrink-0">{i + 1}</span>
                            <span className="text-sm text-on-surface truncate">{m.merchant}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-xs text-secondary">{m.count}×</span>
                            <span className="text-sm font-semibold text-on-surface">{fmt(m.total)}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-surface-container-low rounded-full overflow-hidden ml-6">
                          <div
                            className="h-full rounded-full bg-secondary-container"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}

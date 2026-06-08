'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingDown, ShoppingBag, Calendar, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryPanel } from '@/components/category-panel'
import type { CategoryRow } from '@/components/category-panel'

export type { CategoryRow }
export type AnalyticsPeriod = 'this_month' | '3_months' | '6_months' | 'this_year' | 'custom'

interface Props {
  rows:            CategoryRow[]
  totalSpent:      number
  topCategory:     CategoryRow | null
  avgPerDay:       number
  period:          AnalyticsPeriod
  from:            string
  to:              string
  initialCategory: string | null
}

const PRESET_PERIODS: { value: Exclude<AnalyticsPeriod, 'custom'>; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: '3_months',   label: '3 months'   },
  { value: '6_months',   label: '6 months'   },
  { value: 'this_year',  label: 'This year'  },
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

  const [showCustom, setShowCustom] = useState(period === 'custom')
  const [customFrom, setCustomFrom] = useState(period === 'custom' ? from : '')
  const [customTo,   setCustomTo]   = useState(period === 'custom' ? to   : '')

  const inputCls =
    'bg-surface-container-low border border-secondary-container px-2.5 py-1 text-sm text-on-surface rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-[#C5C2BC] transition-all w-32'

  function selectPreset(p: Exclude<AnalyticsPeriod, 'custom'>) {
    setShowCustom(false)
    router.push(`/analytics?period=${p}`)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    router.push(`/analytics?period=custom&from=${customFrom}&to=${customTo}`)
  }

  return (
    <div className="space-y-6">

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex bg-white shadow-ambient rounded-full p-1 gap-0.5">
          {PRESET_PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => selectPreset(value)}
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
          <button
            onClick={() => setShowCustom((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              period === 'custom'
                ? 'bg-secondary-container text-on-surface'
                : 'text-secondary hover:text-on-surface hover:bg-surface-container-low',
            )}
          >
            <CalendarDays className="size-3.5 shrink-0" />
            {period === 'custom' ? formatRange(from, to) : 'Custom'}
          </button>
        </div>

        {/* Inline date inputs — shown when custom is toggled */}
        {showCustom && (
          <div className="flex items-center gap-2 bg-white shadow-ambient rounded-full px-4 py-1.5">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">From</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={inputCls}
            />
            <span className="text-secondary/40 text-sm">–</span>
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">To</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className={inputCls}
            />
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="ml-1 px-4 py-1 bg-primary text-on-primary text-xs font-semibold rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        )}
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

      {/* Category list + merchant drill-down */}
      <CategoryPanel rows={rows} from={from} to={to} initialCategory={initialCategory} />

    </div>
  )
}

function formatRange(from: string, to: string): string {
  if (!from || !to) return 'Custom'
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const fromStr = f.toLocaleDateString('en-AU', opts)
  const toStr   = t.toLocaleDateString('en-AU', {
    ...opts,
    year: f.getFullYear() !== t.getFullYear() ? 'numeric' : undefined,
  })
  return `${fromStr}–${toStr} ${t.getFullYear()}`
}

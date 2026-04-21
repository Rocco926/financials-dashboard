'use client'

import { useState } from 'react'
import { RefreshCw, Calendar, TrendingDown, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DetectedSubscription } from './page'

interface Props {
  subscriptions: DetectedSubscription[]
  totalMonthly:  number
}

const FREQUENCY_LABEL: Record<DetectedSubscription['frequency'], string> = {
  weekly:      'Weekly',
  fortnightly: 'Fortnightly',
  monthly:     'Monthly',
  quarterly:   'Quarterly',
  annual:      'Annual',
}

const FREQUENCY_ORDER: DetectedSubscription['frequency'][] = [
  'monthly', 'weekly', 'fortnightly', 'quarterly', 'annual',
]

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 })
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

export function SubscriptionsClient({ subscriptions, totalMonthly }: Props) {
  const [filter, setFilter] = useState<DetectedSubscription['frequency'] | 'all'>('all')

  const annualEquiv = totalMonthly * 12

  const filtered = filter === 'all'
    ? subscriptions
    : subscriptions.filter((s) => s.frequency === filter)

  const counts = FREQUENCY_ORDER.reduce<Record<string, number>>((acc, f) => {
    acc[f] = subscriptions.filter((s) => s.frequency === f).length
    return acc
  }, {})

  if (subscriptions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-ambient p-16 text-center">
        <RefreshCw className="size-10 text-secondary/30 mx-auto mb-4" strokeWidth={1} />
        <p className="font-medium text-on-surface mb-1">No recurring transactions detected</p>
        <p className="text-sm text-secondary">Import more transaction history to detect patterns.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-ambient p-6">
          <div className="flex items-center gap-2 text-secondary mb-2">
            <CreditCard className="size-4" strokeWidth={1.5} />
            <span className="text-xs font-medium uppercase tracking-widest">Monthly cost</span>
          </div>
          <p className="text-2xl font-bold text-on-surface tabular-nums">{fmt(totalMonthly)}</p>
          <p className="text-xs text-secondary mt-1">across {subscriptions.length} recurring charges</p>
        </div>
        <div className="bg-white rounded-2xl shadow-ambient p-6">
          <div className="flex items-center gap-2 text-secondary mb-2">
            <TrendingDown className="size-4" strokeWidth={1.5} />
            <span className="text-xs font-medium uppercase tracking-widest">Annual cost</span>
          </div>
          <p className="text-2xl font-bold text-on-surface tabular-nums">{fmt(annualEquiv)}</p>
          <p className="text-xs text-secondary mt-1">estimated yearly spend</p>
        </div>
        <div className="bg-white rounded-2xl shadow-ambient p-6">
          <div className="flex items-center gap-2 text-secondary mb-2">
            <Calendar className="size-4" strokeWidth={1.5} />
            <span className="text-xs font-medium uppercase tracking-widest">Due this week</span>
          </div>
          <p className="text-2xl font-bold text-on-surface tabular-nums">
            {subscriptions.filter((s) => { const d = daysUntil(s.nextExpected); return d >= 0 && d <= 7 }).length}
          </p>
          <p className="text-xs text-secondary mt-1">payments expected</p>
        </div>
      </div>

      {/* Frequency filter tabs */}
      <div className="inline-flex bg-white shadow-ambient rounded-full p-1 gap-0.5">
        {([
          { value: 'all' as const, label: `All (${subscriptions.length})` },
          ...FREQUENCY_ORDER
            .filter((f) => (counts[f] ?? 0) > 0)
            .map((f) => ({ value: f, label: `${FREQUENCY_LABEL[f]} (${counts[f]})` })),
        ]).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
              filter === value
                ? 'bg-secondary-container text-on-surface'
                : 'text-secondary hover:text-on-surface hover:bg-surface-container-low',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Subscriptions table */}
      <div className="bg-white rounded-2xl shadow-ambient overflow-hidden">
        <table className="w-full text-left">
          <thead className="border-b border-surface-container-low">
            <tr>
              <th className="py-4 px-6 text-[10px] font-bold text-secondary uppercase tracking-widest">Merchant</th>
              <th className="py-4 px-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Frequency</th>
              <th className="py-4 px-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Amount</th>
              <th className="py-4 px-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Monthly equiv.</th>
              <th className="py-4 px-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Next expected</th>
              <th className="py-4 px-4 text-[10px] font-bold text-secondary uppercase tracking-widest">Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low">
            {filtered.map((sub) => {
              const days    = daysUntil(sub.nextExpected)
              const overdue = days < 0
              return (
                <tr key={`${sub.merchant}-${sub.category ?? ''}-${sub.frequency}`} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {sub.colour && (
                        <span className="size-2.5 rounded-full shrink-0" style={{ background: sub.colour }} />
                      )}
                      <div>
                        <p className="text-sm font-medium text-on-surface">{sub.merchant}</p>
                        {sub.category && (
                          <p className="text-xs text-secondary mt-0.5">{sub.category}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-secondary-container text-secondary">
                      <RefreshCw className="size-2.5" strokeWidth={2} />
                      {FREQUENCY_LABEL[sub.frequency]}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm font-semibold text-on-surface tabular-nums">
                    {fmt(sub.avgAmount)}
                  </td>
                  <td className="py-4 px-4 text-sm text-secondary tabular-nums">
                    {fmt(sub.monthlyEquiv)}
                  </td>
                  <td className="py-4 px-4">
                    <p className={cn(
                      'text-sm font-medium tabular-nums',
                      overdue ? 'text-tertiary' : days <= 7 ? 'text-primary' : 'text-on-surface',
                    )}>
                      {fmtDate(sub.nextExpected)}
                    </p>
                    <p className={cn('text-xs mt-0.5', overdue ? 'text-tertiary' : 'text-secondary')}>
                      {overdue
                        ? `${Math.abs(days)}d overdue`
                        : days === 0 ? 'Today'
                        : days === 1 ? 'Tomorrow'
                        : `in ${days}d`}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-xs text-secondary tabular-nums">
                    {sub.count}×
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}

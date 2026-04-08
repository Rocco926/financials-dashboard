'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { Plus, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { NetWorthChart } from '@/components/net-worth-chart'
import { HoldingForm } from './holding-form'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldingRow = {
  id: string
  name: string
  institution: string
  type: 'cash' | 'etf' | 'stock' | 'other'
  ticker: string | null
  units: number | null
  avgCostPerUnit: number | null
  manualBalance: number | null
  currency: string
  notes: string | null
  sortOrder: number
  linkedAccountId: string | null
  currentValue: number | null
  costBase: number | null
  gainLoss: number | null
  gainLossPct: number | null
  livePrice: number | null
  changePct: number | null
}

export type SnapshotRow = {
  date: string
  totalValue: number
}

interface Props {
  initialHoldings: HoldingRow[]
  initialSnapshots: SnapshotRow[]
}

// ─── Type badge styles ────────────────────────────────────────────────────────

const typeStyles: Record<HoldingRow['type'], { avatar: string; badge: string }> = {
  etf:   { avatar: 'bg-[#e8f5e9] text-[#2e7d32]', badge: 'bg-[#e8f5e9] text-[#2e7d32]' },
  stock: { avatar: 'bg-blue-50 text-blue-600',     badge: 'bg-blue-50 text-blue-600'     },
  cash:  { avatar: 'bg-secondary-container text-secondary', badge: 'bg-secondary-container text-secondary' },
  other: { avatar: 'bg-surface-container-highest text-on-surface-variant', badge: 'bg-surface-container-highest text-on-surface-variant' },
}

const typeLabel: Record<HoldingRow['type'], string> = {
  cash:  'CASH',
  etf:   'ETF',
  stock: 'STOCK',
  other: 'OTHER',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HoldingsClient({ initialHoldings, initialSnapshots }: Props) {
  const [holdings, setHoldings] = useState<HoldingRow[]>(initialHoldings)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>(initialSnapshots)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<HoldingRow | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [refreshing, startRefresh] = useTransition()

  const initialHoldingsRef = useRef(initialHoldings)

  useEffect(() => {
    fetch('/api/holdings/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          const newSnap = json.data as { date: string; totalValue: number }
          setSnapshots((prev) => {
            const without = prev.filter((s) => s.date !== newSnap.date)
            return [...without, { date: newSnap.date, totalValue: newSnap.totalValue }]
              .sort((a, b) => a.date.localeCompare(b.date))
          })
        }
      })
      .catch(() => {})

    const tickers = initialHoldingsRef.current
      .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
      .map((h) => h.ticker as string)

    if (tickers.length > 0) {
      fetch(`/api/holdings/prices?tickers=${tickers.join(',')}`)
        .then((r) => r.json())
        .then((json) => {
          const prices = json.prices as Record<string, { price: number; changePct: number | null }>
          setHoldings((prev) =>
            prev.map((h) => {
              if (!h.ticker || !prices[h.ticker]) return h
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const p = prices[h.ticker]!
              const units = h.units
              const currentValue = units != null ? units * p.price : h.currentValue
              const costBase = h.costBase
              const gainLoss = currentValue != null && costBase != null ? currentValue - costBase : h.gainLoss
              const gainLossPct =
                gainLoss != null && costBase != null && costBase !== 0
                  ? (gainLoss / costBase) * 100
                  : h.gainLossPct
              return { ...h, livePrice: p.price, changePct: p.changePct, currentValue, gainLoss, gainLossPct }
            }),
          )
        })
        .catch(() => {})
    }
  }, [])

  function handleRefresh() {
    startRefresh(async () => {
      const tickers = holdings
        .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
        .map((h) => h.ticker as string)

      if (tickers.length === 0) return

      const res = await fetch(`/api/holdings/prices?tickers=${tickers.join(',')}`)
      const json = await res.json()
      const prices = json.prices as Record<string, { price: number; changePct: number | null }>

      setHoldings((prev) =>
        prev.map((h) => {
          if (!h.ticker || !prices[h.ticker]) return h
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const p = prices[h.ticker]!
          const units = h.units
          const currentValue = units != null ? units * p.price : h.currentValue
          const costBase = h.costBase
          const gainLoss = currentValue != null && costBase != null ? currentValue - costBase : h.gainLoss
          const gainLossPct =
            gainLoss != null && costBase != null && costBase !== 0
              ? (gainLoss / costBase) * 100
              : h.gainLossPct
          return { ...h, livePrice: p.price, changePct: p.changePct, currentValue, gainLoss, gainLossPct }
        }),
      )
    })
  }

  function handleFormSuccess(updated: HoldingRow) {
    setHoldings((prev) => {
      const idx = prev.findIndex((h) => h.id === updated.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updated
        return next
      }
      return [...prev, updated]
    })
    setShowForm(false)
    setEditTarget(null)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    setHoldings((prev) => prev.filter((h) => h.id !== id))
    setDeleteConfirmId(null)
  }

  // ─── Summary computations (derived from live holdings state) ────────────────

  const totalValue    = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0)
  const totalCostBase = holdings.reduce((sum, h) => sum + (h.costBase ?? 0), 0)
  const totalGainLoss = totalValue - totalCostBase
  const totalGainLossPct =
    totalCostBase > 0 ? (totalGainLoss / totalCostBase) * 100 : null
  const gainColour    = totalGainLoss >= 0 ? 'text-primary' : 'text-tertiary'

  return (
    <div className="space-y-8">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-on-surface">Holdings</h2>
          <p className="text-sm text-secondary mt-1">Portfolio performance as of today</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="bg-primary hover:opacity-90 transition-all text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold active:scale-95"
        >
          <Plus className="size-5" />
          Add Holding
        </button>
      </header>

      {/* ── Portfolio summary bar ────────────────────────────────────────────── */}
      {holdings.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {/* Total net worth */}
          <div className="md:col-span-1 bg-white rounded-2xl p-6 shadow-ambient">
            <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">
              Total Net Worth
            </p>
            <h3 className="text-3xl font-black tracking-tighter tabular-nums">
              {formatCurrency(totalValue)}
            </h3>
          </div>

          {/* Cost base */}
          <div className="bg-white rounded-2xl p-6 shadow-ambient flex flex-col justify-center">
            <p className="text-xs font-medium text-secondary mb-1">Cost base</p>
            <p className="text-xl font-bold tabular-nums text-on-surface">
              {formatCurrency(totalCostBase)}
            </p>
          </div>

          {/* Total gain */}
          <div className="bg-white rounded-2xl p-6 shadow-ambient flex flex-col justify-center">
            <p className="text-xs font-medium text-secondary mb-1">Total gain</p>
            <p className={`text-xl font-bold tabular-nums ${gainColour}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
              {totalGainLossPct != null && (
                <span className="text-sm font-medium ml-1">
                  ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(1)}%)
                </span>
              )}
            </p>
          </div>

          {/* Unrealised % */}
          <div className="bg-white rounded-2xl p-6 shadow-ambient flex flex-col justify-center">
            <p className="text-xs font-medium text-secondary mb-1">Unrealised %</p>
            <p className={`text-xl font-bold tabular-nums ${gainColour}`}>
              {totalGainLossPct != null
                ? `${totalGainLossPct >= 0 ? '+' : ''}${totalGainLossPct.toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </section>
      )}

      {/* ── Net Worth Chart ──────────────────────────────────────────────────── */}
      {snapshots.length > 1 && (
        <div className="bg-white rounded-2xl shadow-ambient p-6">
          <p className="text-sm font-medium text-secondary mb-4">Net worth over time</p>
          <NetWorthChart data={snapshots} />
        </div>
      )}

      {/* ── Holdings table card ──────────────────────────────────────────────── */}
      {holdings.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-ambient px-6 py-16 text-center">
          <p className="text-sm text-secondary">No holdings yet.</p>
          <button
            onClick={() => { setEditTarget(null); setShowForm(true) }}
            className="mt-3 text-sm text-primary font-medium hover:opacity-70 transition-opacity"
          >
            Add your first holding
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-ambient overflow-hidden">

          {/* Table header panel */}
          <div className="p-6 bg-surface-container-low flex justify-between items-end">
            <div>
              <h4 className="text-lg font-bold tracking-tight text-on-surface">Active Assets</h4>
              <p className="text-[10px] text-secondary uppercase tracking-widest mt-1">
                Portfolio positions
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh live prices"
                className="flex items-center gap-1.5 text-xs text-secondary hover:text-on-surface transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => { setEditTarget(null); setShowForm(true) }}
                className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary px-5 py-2.5 hover:opacity-90 transition-all rounded-2xl active:scale-95"
              >
                <Plus className="size-4" />
                Add Holding
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[11px] font-bold text-secondary uppercase tracking-wider bg-surface-container-low/50">
                <tr>
                  <th className="px-6 py-4">Holding</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Units</th>
                  <th className="px-6 py-4">Avg Cost</th>
                  <th className="px-6 py-4">Current Price</th>
                  <th className="px-6 py-4">Current Value</th>
                  <th className="px-6 py-4">Cost Base</th>
                  <th className="px-6 py-4">Gain / Loss</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low/60">
                {holdings.map((h) => {
                  const isCash = h.type === 'cash' || h.type === 'other'
                  const styles = typeStyles[h.type]
                  const initial = h.name.charAt(0).toUpperCase()

                  return (
                    <tr key={h.id} className="group hover:bg-surface-container-low/30 transition-colors">

                      {/* Holding name + avatar */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${styles.avatar}`}>
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-on-surface">{h.name}</p>
                            {h.ticker && (
                              <p className="text-xs text-secondary">{h.ticker}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type badge */}
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${styles.badge}`}>
                          {typeLabel[h.type]}
                        </span>
                      </td>

                      {/* Units */}
                      <td className="px-6 py-5 text-sm font-medium text-on-surface tabular-nums">
                        {h.units != null
                          ? h.units.toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : <span className="text-secondary">—</span>}
                      </td>

                      {/* Avg cost */}
                      <td className="px-6 py-5 text-sm text-secondary tabular-nums">
                        {h.avgCostPerUnit != null ? formatCurrency(h.avgCostPerUnit) : <span>—</span>}
                      </td>

                      {/* Current price */}
                      <td className="px-6 py-5 text-sm tabular-nums">
                        {isCash ? (
                          <span className="text-secondary">—</span>
                        ) : h.livePrice != null ? (
                          <span className="font-bold text-on-surface">
                            {formatCurrency(h.livePrice)}
                            {h.changePct != null && (
                              <span className={`ml-1 text-xs font-bold ${h.changePct >= 0 ? 'text-primary' : 'text-tertiary'}`}>
                                {h.changePct >= 0 ? '+' : ''}{h.changePct.toFixed(2)}%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>

                      {/* Current value */}
                      <td className="px-6 py-5 text-sm font-bold text-on-surface tabular-nums">
                        {h.currentValue != null ? formatCurrency(h.currentValue) : <span className="text-secondary font-normal">—</span>}
                      </td>

                      {/* Cost base */}
                      <td className="px-6 py-5 text-sm text-secondary tabular-nums">
                        {h.costBase != null ? formatCurrency(h.costBase) : <span>—</span>}
                      </td>

                      {/* Gain / Loss */}
                      <td className="px-6 py-5 text-sm tabular-nums">
                        {h.gainLoss != null ? (
                          <span className={`font-bold ${h.gainLoss >= 0 ? 'text-primary' : 'text-tertiary'}`}>
                            {h.gainLoss >= 0 ? '+' : ''}{formatCurrency(h.gainLoss)}
                            {h.gainLossPct != null && (
                              <span className="ml-1 text-xs font-medium opacity-80">
                                ({h.gainLossPct >= 0 ? '+' : ''}{h.gainLossPct.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditTarget(h); setShowForm(true) }}
                            aria-label={`Edit ${h.name}`}
                            className="text-secondary hover:text-on-surface transition-colors text-xs font-medium"
                          >
                            Edit
                          </button>
                          {deleteConfirmId === h.id ? (
                            <span className="flex items-center gap-1 text-xs">
                              <button onClick={() => handleDelete(h.id)} className="text-tertiary hover:underline">Confirm</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="text-secondary hover:underline">Cancel</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(h.id)}
                              aria-label={`Delete ${h.name}`}
                              className="text-secondary hover:text-tertiary transition-colors text-xs font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit form drawer ───────────────────────────────────────────── */}
      {showForm && (
        <HoldingForm
          initial={editTarget}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

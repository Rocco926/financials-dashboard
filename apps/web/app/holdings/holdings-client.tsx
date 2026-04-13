'use client'

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { Plus, RefreshCw, Sparkles } from 'lucide-react'
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

// ─── Type badge / avatar styles ───────────────────────────────────────────────

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

// ─── Allocation strategy bar ──────────────────────────────────────────────────

const ALLOC_SEGMENTS: { key: HoldingRow['type'][]; label: string; colour: string }[] = [
  { key: ['etf'],          label: 'ETF',   colour: '#006c44' },
  { key: ['stock'],        label: 'Stock', colour: '#4caf7d' },
  { key: ['cash', 'other'], label: 'Cash', colour: '#cbc6bd' },
]

function AllocationBar({ holdings }: { holdings: HoldingRow[] }) {
  const total = holdings.reduce((s, h) => s + (h.currentValue ?? 0), 0)
  if (total === 0 || holdings.length < 2) return null

  const segments = ALLOC_SEGMENTS
    .map((seg) => ({
      ...seg,
      value: holdings
        .filter((h) => (seg.key as string[]).includes(h.type))
        .reduce((s, h) => s + (h.currentValue ?? 0), 0),
    }))
    .filter((s) => s.value > 0)

  return (
    <div className="bg-white rounded-[24px] shadow-ambient p-8">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-lg font-semibold text-on-surface">Allocation Strategy</h4>
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">
          On Track
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px mb-6">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.colour }}
            className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.colour }} />
            <span className="text-xs text-secondary">{s.label}</span>
            <span className="text-xs font-bold text-on-surface tabular-nums">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-secondary tabular-nums">{formatCurrency(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Market Insights card ────────────────────────────────────────────────────

function MarketInsights({ hasHoldings }: { hasHoldings: boolean }) {
  const [content,     setContent]     = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true)
    try {
      const res  = await fetch('/api/holdings/insights', { method: force ? 'POST' : 'GET' })
      const json = await res.json() as { content: string }
      setContent(json.content)
    } catch {
      // non-critical — silently hide the card on error
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (hasHoldings) load()
  }, [hasHoldings, load])

  if (!hasHoldings || (!loading && !content)) return null

  return (
    <div className="bg-white rounded-[24px] shadow-ambient p-8">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} />
          <h4 className="text-lg font-semibold text-on-surface">Market Insights</h4>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          aria-label="Regenerate insight"
          className="flex items-center gap-1.5 text-xs text-secondary hover:text-on-surface transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 bg-surface-container-low rounded-full animate-pulse w-full" />
          <div className="h-3 bg-surface-container-low rounded-full animate-pulse w-5/6" />
          <div className="h-3 bg-surface-container-low rounded-full animate-pulse w-4/6" />
        </div>
      ) : (
        <p className="text-sm text-secondary leading-relaxed">{content}</p>
      )}
    </div>
  )
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

  // ─── Derived state ────────────────────────────────────────────────────────

  const investmentHoldings = holdings.filter((h) => h.type === 'etf' || h.type === 'stock')
  const cashHoldings       = holdings.filter((h) => h.type === 'cash' || h.type === 'other')

  const totalValue    = holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0)
  const totalCostBase = holdings.reduce((sum, h) => sum + (h.costBase ?? 0), 0)
  const totalGainLoss = totalValue - totalCostBase
  const totalGainLossPct = totalCostBase > 0 ? (totalGainLoss / totalCostBase) * 100 : null
  const gainColour    = totalGainLoss >= 0 ? 'text-primary' : 'text-tertiary'

  return (
    <div className="space-y-8">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-on-surface">Holdings</h2>
          <p className="text-sm text-secondary mt-1">Portfolio performance as of today</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-3xl font-semibold text-sm hover:bg-primary-dim transition-all active:scale-95 shadow-ambient"
        >
          <Plus className="size-4" />
          Add Holding
        </button>
      </header>

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white rounded-[24px] p-6 shadow-ambient">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Total Net Worth</p>
            <h3 className="text-3xl font-bold tracking-tight tabular-nums text-on-surface">
              {formatCurrency(totalValue)}
            </h3>
          </div>
          <div className="bg-white rounded-[24px] p-6 shadow-ambient">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Cost Base</p>
            <p className="text-2xl font-bold tabular-nums text-on-surface">
              {formatCurrency(totalCostBase)}
            </p>
          </div>
          <div className="bg-white rounded-[24px] p-6 shadow-ambient">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Total Gain</p>
            <p className={`text-2xl font-bold tabular-nums ${gainColour}`}>
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
            </p>
          </div>
          <div className="bg-white rounded-[24px] p-6 shadow-ambient">
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3">Unrealised</p>
            <p className={`text-2xl font-bold tabular-nums ${gainColour}`}>
              {totalGainLossPct != null
                ? `${totalGainLossPct >= 0 ? '+' : ''}${totalGainLossPct.toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* ── Net Worth Chart ───────────────────────────────────────────────────── */}
      {snapshots.length > 1 && (
        <div className="bg-white rounded-[24px] shadow-ambient p-8">
          <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-6">Net worth over time</p>
          <NetWorthChart data={snapshots} />
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {holdings.length === 0 && (
        <div className="bg-white rounded-[24px] shadow-ambient px-6 py-16 text-center">
          <p className="text-sm text-secondary">No holdings yet.</p>
          <button
            onClick={() => { setEditTarget(null); setShowForm(true) }}
            className="mt-3 text-sm text-primary font-medium hover:opacity-70 transition-opacity"
          >
            Add your first holding
          </button>
        </div>
      )}

      {/* ── Investments table ─────────────────────────────────────────────────── */}
      {investmentHoldings.length > 0 && (
        <div className="bg-white rounded-[24px] shadow-ambient overflow-hidden">
          <div className="px-8 py-6 flex justify-between items-center">
            <div>
              <h4 className="text-lg font-semibold text-on-surface">Active Assets</h4>
              <p className="text-[10px] text-secondary uppercase tracking-widest mt-0.5">Portfolio positions</p>
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
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[11px] font-bold text-secondary uppercase tracking-wider border-t border-surface-container-low">
                <tr>
                  <th className="px-8 py-4">Holding</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Units</th>
                  <th className="px-6 py-4">Avg Cost</th>
                  <th className="px-6 py-4">Current Price</th>
                  <th className="px-6 py-4">Current Value</th>
                  <th className="px-6 py-4">Cost Base</th>
                  <th className="px-6 py-4">Gain / Loss</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low/60">
                {investmentHoldings.map((h) => {
                  const styles  = typeStyles[h.type]
                  const initial = h.name.charAt(0).toUpperCase()

                  return (
                    <tr key={h.id} className="group hover:bg-surface-container-low/30 transition-colors">

                      {/* Holding name */}
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${styles.avatar}`}>
                            {initial}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-on-surface">{h.name}</p>
                            {h.ticker && <p className="text-xs text-secondary">{h.ticker}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${styles.badge}`}>
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
                        {h.livePrice != null ? (
                          <span className="font-semibold text-on-surface">
                            {formatCurrency(h.livePrice)}
                            {h.changePct != null && (
                              <span className={`ml-1.5 text-xs font-bold ${h.changePct >= 0 ? 'text-primary' : 'text-tertiary'}`}>
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
                            className="text-xs text-secondary hover:text-on-surface transition-colors"
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
                              className="text-xs text-secondary hover:text-tertiary transition-colors"
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

      {/* ── Cash & other — grey box ───────────────────────────────────────────── */}
      {cashHoldings.length > 0 && (
        <div className="bg-surface-container-low rounded-[24px] overflow-hidden">
          <div className="px-8 py-5 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-secondary uppercase tracking-widest">Cash & Other</h4>
              <p className="text-xs text-secondary mt-0.5 tabular-nums">
                {formatCurrency(cashHoldings.reduce((s, h) => s + (h.currentValue ?? 0), 0))} total
              </p>
            </div>
          </div>
          <div className="divide-y divide-surface-container">
            {cashHoldings.map((h) => {
              const styles = typeStyles[h.type]
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-4 px-8 py-4 group hover:bg-surface-container transition-colors"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${styles.avatar}`}>
                    {h.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface">{h.name}</p>
                    <p className="text-xs text-secondary">{h.institution}</p>
                  </div>
                  {h.notes && (
                    <p className="text-xs text-secondary italic max-w-xs truncate hidden lg:block">{h.notes}</p>
                  )}
                  <p className="text-sm font-bold text-on-surface tabular-nums">
                    {h.currentValue != null ? formatCurrency(h.currentValue) : '—'}
                  </p>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2 w-24 justify-end">
                    <button
                      onClick={() => { setEditTarget(h); setShowForm(true) }}
                      className="text-xs text-secondary hover:text-on-surface transition-colors"
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
                        className="text-xs text-secondary hover:text-tertiary transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Allocation strategy ───────────────────────────────────────────────── */}
      <AllocationBar holdings={holdings} />

      {/* ── Market insights ───────────────────────────────────────────────────── */}
      <MarketInsights hasHoldings={holdings.length > 0} />

      {/* ── Add / Edit form drawer ────────────────────────────────────────────── */}
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

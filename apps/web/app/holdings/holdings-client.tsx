'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
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

// ─── Component ────────────────────────────────────────────────────────────────

export function HoldingsClient({ initialHoldings, initialSnapshots }: Props) {
  const [holdings, setHoldings] = useState<HoldingRow[]>(initialHoldings)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>(initialSnapshots)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<HoldingRow | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [refreshing, startRefresh] = useTransition()

  // Capture initial holdings in a ref so the mount effect never needs a dep on the prop.
  // This is a true "run once on mount" effect — we intentionally read the server-rendered
  // snapshot and don't need to react to prop changes (the parent doesn't re-render this).
  const initialHoldingsRef = useRef(initialHoldings)

  // On mount: trigger today's snapshot save + refresh live prices
  useEffect(() => {
    // Save today's snapshot (idempotent — server uses ON CONFLICT DO UPDATE)
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
      .catch(() => {/* snapshot failure is non-critical */})

    // Refresh live prices for ETF/stock holdings
    const tickers = initialHoldingsRef.current
      .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
      .map((h) => h.ticker as string)

    if (tickers.length > 0) {
      fetch(`/api/holdings/prices?tickers=${tickers.join(',')}`)
        .then((r) => r.json())
        .then((json) => {
          const prices = json.prices as Record<
            string,
            { price: number; changePct: number | null }
          >
          setHoldings((prev) =>
            prev.map((h) => {
              if (!h.ticker || !prices[h.ticker]) return h
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const p = prices[h.ticker]!
              const units = h.units
              const currentValue =
                units != null ? units * p.price : h.currentValue
              const costBase = h.costBase
              const gainLoss =
                currentValue != null && costBase != null
                  ? currentValue - costBase
                  : h.gainLoss
              const gainLossPct =
                gainLoss != null && costBase != null && costBase !== 0
                  ? (gainLoss / costBase) * 100
                  : h.gainLossPct
              return {
                ...h,
                livePrice:    p.price,
                changePct:    p.changePct,
                currentValue,
                gainLoss,
                gainLossPct,
              }
            }),
          )
        })
        .catch(() => {/* price refresh failure is non-critical */})
    }
  }, [])

  function handleRefresh() {
    startRefresh(async () => {
      const tickers = holdings
        .filter((h) => (h.type === 'etf' || h.type === 'stock') && h.ticker)
        .map((h) => h.ticker as string)

      if (tickers.length === 0) return

      // Force fresh — invalidate cache by calling prices endpoint
      const res = await fetch(`/api/holdings/prices?tickers=${tickers.join(',')}`)
      const json = await res.json()
      const prices = json.prices as Record<
        string,
        { price: number; changePct: number | null }
      >

      setHoldings((prev) =>
        prev.map((h) => {
          if (!h.ticker || !prices[h.ticker]) return h
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const p = prices[h.ticker]!
          const units = h.units
          const currentValue = units != null ? units * p.price : h.currentValue
          const costBase = h.costBase
          const gainLoss =
            currentValue != null && costBase != null
              ? currentValue - costBase
              : h.gainLoss
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

  const typeLabel: Record<HoldingRow['type'], string> = {
    cash:  'Cash',
    etf:   'ETF',
    stock: 'Stock',
    other: 'Other',
  }

  // Group by institution
  const institutions = Array.from(new Set(holdings.map((h) => h.institution)))

  return (
    <div className="space-y-8">

      {/* Net Worth Chart */}
      {snapshots.length > 1 && (
        <div className="border border-[#E9E7E2] bg-white rounded-lg">
          <div className="px-6 pt-5 pb-2 border-b border-[#E9E7E2]">
            <p className="section-label text-[#787774]">Net worth over time</p>
          </div>
          <div className="px-6 py-4">
            <NetWorthChart data={snapshots} />
          </div>
        </div>
      )}

      {/* Holdings table */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="section-label text-[#787774]">Positions</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh live prices"
              className="flex items-center gap-1.5 text-xs text-[#787774] hover:text-[#37352F] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh prices
            </button>
            <button
              onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="flex items-center gap-1.5 text-sm text-[#37352F] border border-[#37352F] px-3 py-1.5 hover:bg-[#37352F] hover:text-white transition-colors"
            >
              <Plus className="size-[14px]" />
              Add holding
            </button>
          </div>
        </div>

        {holdings.length === 0 ? (
          <div className="border border-[#E9E7E2] bg-white rounded-lg px-6 py-16 text-center">
            <p className="text-sm text-[#787774]">No holdings yet.</p>
            <button
              onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="mt-3 text-sm text-[#37352F] underline hover:no-underline"
            >
              Add your first holding
            </button>
          </div>
        ) : (
          <div className="border border-[#E9E7E2] bg-white rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E9E7E2]">
                  <th className="px-4 py-2.5 text-left section-label font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left section-label font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">Units</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">Value</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">Cost base</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">G/L</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => {
                  const rows = holdings.filter((h) => h.institution === inst)
                  const instTotal = rows.reduce((s, h) => s + (h.currentValue ?? 0), 0)
                  return (
                    <React.Fragment key={`inst-${inst}`}>
                      {/* Institution sub-header */}
                      <tr className="border-b border-[#EDE9E3] bg-[#F7F6F3]">
                        <td
                          colSpan={8}
                          className="px-4 py-1.5 section-label text-[#787774]"
                        >
                          {inst}
                          <span className="ml-2 text-[#37352F] font-medium tabular-nums">
                            {formatCurrency(instTotal)}
                          </span>
                        </td>
                      </tr>

                      {rows.map((h) => (
                        <tr
                          key={h.id}
                          className="border-b border-[#EDE9E3] last:border-0 hover:bg-[#F7F6F3] transition-colors group"
                        >
                          <td className="px-4 py-2.5">
                            <p className="text-[#37352F] font-medium">{h.name}</p>
                            {h.ticker && (
                              <p className="text-xs text-[#ACABA8] mt-0.5">{h.ticker}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[#787774] text-xs">
                            {typeLabel[h.type]}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#787774] tabular-nums text-xs">
                            {h.units != null ? h.units.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                            {h.livePrice != null ? (
                              <span>
                                <span className="text-[#37352F]">
                                  {formatCurrency(h.livePrice)}
                                </span>
                                {h.changePct != null && (
                                  <span
                                    className={`ml-1.5 ${
                                      h.changePct >= 0
                                        ? 'text-[#4CAF7D]'
                                        : 'text-[#E5534B]'
                                    }`}
                                  >
                                    {h.changePct >= 0 ? '+' : ''}
                                    {h.changePct.toFixed(2)}%
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[#ACABA8]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                            {h.currentValue != null
                              ? formatCurrency(h.currentValue)
                              : <span className="text-[#ACABA8]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[#787774] text-xs">
                            {h.costBase != null
                              ? formatCurrency(h.costBase)
                              : <span className="text-[#ACABA8]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                            {h.gainLoss != null ? (
                              <span className={h.gainLoss >= 0 ? 'text-[#4CAF7D]' : 'text-[#E5534B]'}>
                                <span className="flex items-center justify-end gap-1">
                                  {h.gainLoss >= 0
                                    ? <TrendingUp className="size-3" />
                                    : <TrendingDown className="size-3" />}
                                  {h.gainLoss >= 0 ? '+' : ''}
                                  {formatCurrency(h.gainLoss)}
                                  {h.gainLossPct != null && (
                                    <span className="text-[10px] opacity-70">
                                      ({h.gainLossPct >= 0 ? '+' : ''}{h.gainLossPct.toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[#ACABA8]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditTarget(h); setShowForm(true) }}
                                aria-label={`Edit ${h.name}`}
                                className="text-[#787774] hover:text-[#37352F] transition-colors"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              {deleteConfirmId === h.id ? (
                                <span className="flex items-center gap-1 text-xs">
                                  <button
                                    onClick={() => handleDelete(h.id)}
                                    className="text-[#E5534B] hover:underline"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="text-[#787774] hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(h.id)}
                                  aria-label={`Delete ${h.name}`}
                                  className="text-[#787774] hover:text-[#E5534B] transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit form drawer */}
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

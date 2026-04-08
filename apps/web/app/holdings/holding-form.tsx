'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import type { HoldingRow } from './holdings-client'

interface TickerResult {
  ticker: string
  name: string
  exchange: string
  type: string
}

interface AccountOption {
  id: string
  name: string
  institution: string
}

interface Props {
  initial: HoldingRow | null
  onSuccess: (row: HoldingRow) => void
  onCancel: () => void
}

const inputCls = "w-full bg-surface-container-low border border-secondary-container px-3 py-2 text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all rounded-xl"

export function HoldingForm({ initial, onSuccess, onCancel }: Props) {
  const isEdit = initial != null

  const [type, setType] = useState<HoldingRow['type']>(initial?.type ?? 'cash')
  const [name, setName] = useState(initial?.name ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [units, setUnits] = useState(initial?.units != null ? String(initial.units) : '')
  const [avgCost, setAvgCost] = useState(
    initial?.avgCostPerUnit != null ? String(initial.avgCostPerUnit) : '',
  )
  const [manualBalance, setManualBalance] = useState(
    initial?.manualBalance != null ? String(initial.manualBalance) : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [linkedAccountId, setLinkedAccountId] = useState<string>(
    initial?.linkedAccountId ?? '',
  )
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json: AccountOption[]) => setAccounts(json))
      .catch(() => {/* non-critical */})
  }, [])

  const [tickerQuery, setTickerQuery] = useState(initial?.ticker ?? '')
  const [tickerResults, setTickerResults] = useState<TickerResult[]>([])
  const [tickerSearching, setTickerSearching] = useState(false)
  const tickerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTickerQueryChange(val: string) {
    setTickerQuery(val)
    if (tickerDebounce.current) clearTimeout(tickerDebounce.current)
    if (val.length < 1) { setTickerResults([]); return }
    tickerDebounce.current = setTimeout(async () => {
      setTickerSearching(true)
      try {
        const res = await fetch(`/api/holdings/ticker-lookup?q=${encodeURIComponent(val)}`)
        const json = await res.json()
        setTickerResults(json.results ?? [])
      } finally {
        setTickerSearching(false)
      }
    }, 300)
  }

  function selectTicker(result: TickerResult) {
    setTicker(result.ticker)
    setTickerQuery(result.ticker)
    if (!name) setName(result.name)
    setTickerResults([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      institution,
      type,
      ticker:          (type === 'etf' || type === 'stock') ? (ticker || null) : null,
      units:           (type === 'etf' || type === 'stock') && units ? parseFloat(units) : null,
      avgCostPerUnit:  (type === 'etf' || type === 'stock') && avgCost ? parseFloat(avgCost) : null,
      manualBalance:   isCashLike && manualBalance ? parseFloat(manualBalance) : null,
      notes:           notes || null,
      sortOrder:       initial?.sortOrder ?? 0,
      linkedAccountId: isCashLike && linkedAccountId ? linkedAccountId : null,
    }

    try {
      const url = isEdit ? `/api/holdings/${initial!.id}` : '/api/holdings'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.')
        return
      }

      const row = json.data
      const u = row.units != null ? parseFloat(String(row.units)) : null
      const ac = row.avgCostPerUnit != null ? parseFloat(String(row.avgCostPerUnit)) : null
      const mb = row.manualBalance != null ? parseFloat(String(row.manualBalance)) : null
      let currentValue: number | null = null
      if ((row.type === 'etf' || row.type === 'stock') && u != null && ac != null) {
        currentValue = u * ac
      } else {
        currentValue = mb
      }
      const costBase = u != null && ac != null ? u * ac : null
      const gainLoss = currentValue != null && costBase != null ? currentValue - costBase : null
      const gainLossPct =
        gainLoss != null && costBase != null && costBase !== 0
          ? (gainLoss / costBase) * 100
          : null

      onSuccess({
        ...row,
        units:           u,
        avgCostPerUnit:  ac,
        manualBalance:   mb,
        linkedAccountId: row.linkedAccountId ?? null,
        currentValue,
        costBase,
        gainLoss,
        gainLossPct,
        livePrice:       null,
        changePct:       null,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isCashLike = type === 'cash' || type === 'other'
  const isInvestment = type === 'etf' || type === 'stock'

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-low bg-surface-container-low">
        <p className="text-sm font-medium text-on-surface">
          {isEdit ? 'Edit holding' : 'Add holding'}
        </p>
        <button
          onClick={onCancel}
          aria-label="Close form"
          className="text-secondary hover:text-on-surface transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

        {/* Type toggle */}
        <div>
          <label className="block section-label mb-2">Type</label>
          <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl">
            {(['cash', 'etf', 'stock', 'other'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors rounded-lg capitalize ${
                  type === t
                    ? 'bg-white text-on-surface shadow-sm'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Name + Institution */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block section-label mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={isInvestment ? 'e.g. Diversified All Growth' : 'e.g. HISA'}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block section-label mb-1.5">Institution</label>
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
              placeholder="e.g. Betashares"
              className={inputCls}
            />
          </div>
        </div>

        {/* ETF/Stock fields */}
        {isInvestment && (
          <>
            <div>
              <label className="block section-label mb-1.5">Ticker</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-secondary" />
                <input
                  value={tickerQuery}
                  onChange={(e) => handleTickerQueryChange(e.target.value)}
                  placeholder="Search e.g. DHHF or Betashares"
                  className={`${inputCls} pl-8`}
                />
                {tickerSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary">…</span>
                )}
              </div>
              {tickerResults.length > 0 && (
                <ul className="mt-1 bg-white border border-secondary-container rounded-xl shadow-sm divide-y divide-surface-container-low overflow-hidden">
                  {tickerResults.map((r) => (
                    <li key={r.ticker}>
                      <button
                        type="button"
                        onClick={() => selectTicker(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-container-low transition-colors"
                      >
                        <span className="text-sm font-medium text-on-surface">{r.ticker}</span>
                        <span className="text-xs text-secondary ml-2">{r.name}</span>
                        {r.exchange && (
                          <span className="text-xs text-secondary ml-1">· {r.exchange}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {ticker && tickerQuery !== ticker && (
                <p className="text-xs text-secondary mt-1">
                  Selected: <span className="text-on-surface font-medium">{ticker}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block section-label mb-1.5">Units held</label>
                <input
                  type="number"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  step="any"
                  min="0"
                  placeholder="e.g. 142.538"
                  className={`${inputCls} tabular-nums`}
                />
              </div>
              <div>
                <label className="block section-label mb-1.5">Avg cost / unit</label>
                <input
                  type="number"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  step="any"
                  min="0"
                  placeholder="e.g. 32.50"
                  className={`${inputCls} tabular-nums`}
                />
              </div>
            </div>
          </>
        )}

        {/* Cash/Other fields */}
        {isCashLike && (
          <>
            <div>
              <label className="block section-label mb-1.5">Balance (AUD)</label>
              <input
                type="number"
                value={manualBalance}
                onChange={(e) => setManualBalance(e.target.value)}
                step="0.01"
                placeholder="e.g. 45000"
                className={`${inputCls} tabular-nums`}
              />
            </div>

            {accounts.length > 0 && (
              <div>
                <label className="block section-label mb-1.5">Link to imported account</label>
                <select
                  value={linkedAccountId}
                  onChange={(e) => setLinkedAccountId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">None — update balance manually</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.institution})
                    </option>
                  ))}
                </select>
                {linkedAccountId && (
                  <p className="text-xs text-secondary mt-1.5">
                    Balance will auto-update from the most recent transaction whenever you import a statement for this account.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block section-label mb-1.5">Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes…"
            className={inputCls}
          />
        </div>

        {error && (
          <p className="text-sm text-tertiary bg-tertiary-container border border-tertiary/30 px-3 py-2 rounded-xl">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 text-sm bg-primary text-white hover:bg-primary-dim transition-colors disabled:opacity-50 rounded-xl"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add holding'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-sm text-secondary hover:text-on-surface bg-surface-container-low hover:bg-surface-container transition-colors rounded-xl"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

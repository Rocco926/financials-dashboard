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

  // Fetch bank accounts for the "Link to account" dropdown
  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json: AccountOption[]) => setAccounts(json))
      .catch(() => {/* non-critical */})
  }, [])

  // Ticker search
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

      // Compute derived values client-side for immediate UI update
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
    <div className="border border-[#E9E7E2] bg-white rounded-lg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E9E7E2]">
        <p className="text-sm font-medium text-[#37352F]">
          {isEdit ? 'Edit holding' : 'Add holding'}
        </p>
        <button
          onClick={onCancel}
          aria-label="Close form"
          className="text-[#787774] hover:text-[#37352F] transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
        {/* Type */}
        <div>
          <label className="block section-label text-[#787774] mb-2">Type</label>
          <div className="flex gap-0 border border-[#E9E7E2]">
            {(['cash', 'etf', 'stock', 'other'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-sm transition-colors capitalize ${
                  type === t
                    ? 'bg-[#37352F] text-white'
                    : 'text-[#787774] hover:text-[#37352F] hover:bg-[#F7F6F3]'
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
            <label className="block section-label text-[#787774] mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={isInvestment ? 'e.g. Diversified All Growth' : 'e.g. HISA'}
              className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors"
            />
          </div>
          <div>
            <label className="block section-label text-[#787774] mb-1.5">Institution</label>
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
              placeholder="e.g. Betashares"
              className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors"
            />
          </div>
        </div>

        {/* ETF/Stock specific fields */}
        {isInvestment && (
          <>
            <div>
              <label className="block section-label text-[#787774] mb-1.5">Ticker</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#ACABA8]" />
                <input
                  value={tickerQuery}
                  onChange={(e) => handleTickerQueryChange(e.target.value)}
                  placeholder="Search e.g. DHHF or Betashares"
                  className="w-full border border-[#E9E7E2] pl-8 pr-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors"
                />
                {tickerSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#ACABA8]">
                    …
                  </span>
                )}
              </div>
              {tickerResults.length > 0 && (
                <ul className="border border-[#E9E7E2] border-t-0 bg-white divide-y divide-[#EDE9E3]">
                  {tickerResults.map((r) => (
                    <li key={r.ticker}>
                      <button
                        type="button"
                        onClick={() => selectTicker(r)}
                        className="w-full text-left px-3 py-2 hover:bg-[#F7F6F3] transition-colors"
                      >
                        <span className="text-sm font-medium text-[#37352F]">{r.ticker}</span>
                        <span className="text-xs text-[#787774] ml-2">{r.name}</span>
                        {r.exchange && (
                          <span className="text-xs text-[#ACABA8] ml-1">· {r.exchange}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {ticker && tickerQuery !== ticker && (
                <p className="text-xs text-[#ACABA8] mt-1">
                  Selected: <span className="text-[#37352F] font-medium">{ticker}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block section-label text-[#787774] mb-1.5">Units held</label>
                <input
                  type="number"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  step="any"
                  min="0"
                  placeholder="e.g. 142.538"
                  className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors tabular-nums"
                />
              </div>
              <div>
                <label className="block section-label text-[#787774] mb-1.5">
                  Avg cost / unit
                </label>
                <input
                  type="number"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  step="any"
                  min="0"
                  placeholder="e.g. 32.50"
                  className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors tabular-nums"
                />
              </div>
            </div>
          </>
        )}

        {/* Cash / Other: manual balance + optional account link */}
        {isCashLike && (
          <>
            <div>
              <label className="block section-label text-[#787774] mb-1.5">
                Balance (AUD)
              </label>
              <input
                type="number"
                value={manualBalance}
                onChange={(e) => setManualBalance(e.target.value)}
                step="0.01"
                placeholder="e.g. 45000"
                className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors tabular-nums"
              />
            </div>

            {accounts.length > 0 && (
              <div>
                <label className="block section-label text-[#787774] mb-1.5">
                  Link to imported account
                </label>
                <select
                  value={linkedAccountId}
                  onChange={(e) => setLinkedAccountId(e.target.value)}
                  className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors bg-white"
                >
                  <option value="">None — update balance manually</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.institution})
                    </option>
                  ))}
                </select>
                {linkedAccountId && (
                  <p className="text-xs text-[#ACABA8] mt-1">
                    Balance will auto-update from the most recent transaction whenever you import a statement for this account.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block section-label text-[#787774] mb-1.5">Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes…"
            className="w-full border border-[#E9E7E2] px-3 py-1.5 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-[#E5534B] bg-red-50 border border-red-200 px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm bg-[#37352F] text-white hover:bg-[#4A4643] transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add holding'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[#787774] hover:text-[#37352F] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

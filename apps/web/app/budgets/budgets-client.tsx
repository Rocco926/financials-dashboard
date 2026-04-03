'use client'

import { useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export type BudgetRow = {
  id:            string
  name:          string
  colour:        string
  monthlyBudget: number | null
  spent:         number
}

interface Props {
  initialRows: BudgetRow[]
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const over = spent > budget

  const barColour = over
    ? 'bg-[#E5534B]'
    : pct >= 75
    ? 'bg-[#F0A500]'
    : 'bg-[#4CAF7D]'

  return (
    <div className="w-full h-1.5 bg-[#EDE9E3] rounded-none overflow-hidden">
      <div
        className={`h-full transition-all ${barColour}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Inline budget editor ─────────────────────────────────────────────────────

function BudgetEditor({
  row,
  onSave,
  onCancel,
}: {
  row: BudgetRow
  onSave: (id: string, value: number | null) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(
    row.monthlyBudget != null ? String(row.monthlyBudget) : '',
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const parsed = value.trim() === '' ? null : parseFloat(value)
    await onSave(row.id, parsed && parsed > 0 ? parsed : null)
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[#ACABA8] text-sm">$</span>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onCancel()
        }}
        step="1"
        min="0"
        placeholder="e.g. 500"
        autoFocus
        className="w-24 border border-[#37352F] px-2 py-0.5 text-sm text-[#37352F] tabular-nums focus:outline-none"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        aria-label="Save budget"
        className="text-[#4CAF7D] hover:text-[#3a9e6a] transition-colors disabled:opacity-40"
      >
        <Check className="size-3.5" />
      </button>
      <button
        onClick={onCancel}
        aria-label="Cancel"
        className="text-[#ACABA8] hover:text-[#37352F] transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BudgetsClient({ initialRows }: Props) {
  const [rows, setRows] = useState<BudgetRow[]>(initialRows)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleSave(id: string, monthlyBudget: number | null) {
    const res = await fetch(`/api/categories/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ monthlyBudget }),
    })
    if (!res.ok) return

    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, monthlyBudget } : r)),
    )
    setEditingId(null)
  }

  const withBudget    = rows.filter((r) => r.monthlyBudget != null)
  const withoutBudget = rows.filter((r) => r.monthlyBudget == null)

  const totalBudgeted = withBudget.reduce((s, r) => s + r.monthlyBudget!, 0)
  const totalSpent    = withBudget.reduce((s, r) => s + r.spent, 0)
  const remaining     = totalBudgeted - totalSpent

  return (
    <div className="space-y-8">

      {/* Summary */}
      {withBudget.length > 0 && (
        <div className="grid grid-cols-3 gap-0 border border-[#E9E7E2] divide-x divide-[#E9E7E2]">
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Total budgeted</p>
            <p className="text-2xl font-medium text-[#37352F] tabular-nums mt-1">
              {formatCurrency(totalBudgeted)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Spent this month</p>
            <p className="text-2xl font-medium text-[#37352F] tabular-nums mt-1">
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="section-label text-[#787774]">Remaining</p>
            <p
              className={`text-2xl font-medium tabular-nums mt-1 ${
                remaining >= 0 ? 'text-[#4CAF7D]' : 'text-[#E5534B]'
              }`}
            >
              {remaining >= 0 ? '' : '-'}{formatCurrency(Math.abs(remaining))}
            </p>
          </div>
        </div>
      )}

      {/* Categories with budgets */}
      {withBudget.length > 0 && (
        <div className="space-y-1">
          <p className="section-label text-[#787774]">Budgets</p>
          <div className="border border-[#E9E7E2] bg-white rounded-lg divide-y divide-[#EDE9E3]">
            {withBudget.map((row) => {
              const over       = row.spent > row.monthlyBudget!
              const pct        = row.monthlyBudget! > 0
                ? (row.spent / row.monthlyBudget!) * 100
                : 0
              const isEditing  = editingId === row.id

              return (
                <div key={row.id} className="px-5 py-4 group">
                  <div className="flex items-center justify-between mb-2">
                    {/* Left: colour dot + name */}
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.colour }}
                      />
                      <span className="text-sm font-medium text-[#37352F]">
                        {row.name}
                      </span>
                    </div>

                    {/* Right: spent / budget + edit */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums text-[#787774]">
                        <span className={over ? 'text-[#E5534B] font-medium' : 'text-[#37352F]'}>
                          {formatCurrency(row.spent)}
                        </span>
                        {' / '}
                        {isEditing ? (
                          <BudgetEditor
                            row={row}
                            onSave={handleSave}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <span>{formatCurrency(row.monthlyBudget!)}</span>
                        )}
                      </span>
                      {!isEditing && (
                        <button
                          onClick={() => setEditingId(row.id)}
                          aria-label={`Edit budget for ${row.name}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#787774] hover:text-[#37352F]"
                        >
                          <Pencil className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <ProgressBar spent={row.spent} budget={row.monthlyBudget!} />

                  {/* Over-budget label */}
                  {over && (
                    <p className="text-xs text-[#E5534B] mt-1.5">
                      {formatCurrency(row.spent - row.monthlyBudget!)} over budget
                      {' '}({pct.toFixed(0)}%)
                    </p>
                  )}
                  {!over && pct > 0 && (
                    <p className="text-xs text-[#ACABA8] mt-1.5">
                      {formatCurrency(row.monthlyBudget! - row.spent)} remaining
                      {' '}· {pct.toFixed(0)}% used
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Categories without budgets */}
      {withoutBudget.length > 0 && (
        <div className="space-y-1">
          <p className="section-label text-[#787774]">
            {withBudget.length > 0 ? 'No budget set' : 'Categories'}
          </p>
          <p className="text-xs text-[#ACABA8] -mt-0.5 mb-2">
            Click &ldquo;Set budget&rdquo; to start tracking a category.
          </p>
          <div className="border border-[#E9E7E2] bg-white rounded-lg divide-y divide-[#EDE9E3]">
            {withoutBudget.map((row) => {
              const isEditing = editingId === row.id
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between px-5 py-3 group hover:bg-[#F7F6F3] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: row.colour }}
                    />
                    <span className="text-sm text-[#37352F]">{row.name}</span>
                    {row.spent > 0 && (
                      <span className="text-xs text-[#ACABA8] tabular-nums">
                        {formatCurrency(row.spent)} this month
                      </span>
                    )}
                  </div>
                  <div>
                    {isEditing ? (
                      <BudgetEditor
                        row={row}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingId(row.id)}
                        className="text-xs text-[#787774] hover:text-[#37352F] transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Set budget
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="border border-[#E9E7E2] bg-white rounded-lg px-6 py-16 text-center">
          <p className="text-sm text-[#787774]">No spending categories found.</p>
          <p className="text-xs text-[#ACABA8] mt-1">
            Run <code className="font-mono">pnpm db:seed</code> to seed default categories.
          </p>
        </div>
      )}
    </div>
  )
}

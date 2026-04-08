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
    ? 'bg-tertiary'
    : pct >= 90
    ? 'bg-tertiary'
    : pct >= 65
    ? 'bg-[#f59e0b]'
    : 'bg-primary-container'

  return (
    <div className="h-2 w-full bg-surface-container-low rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-300 rounded-full ${barColour}`}
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
      <span className="text-secondary text-sm">$</span>
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
        className="w-24 border border-secondary-container bg-surface-container-low px-2 py-0.5 text-sm text-on-surface tabular-nums focus:outline-none focus:ring-1 focus:ring-primary rounded-lg"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        aria-label="Save budget"
        className="text-primary hover:opacity-70 transition-opacity disabled:opacity-40"
      >
        <Check className="size-3.5" />
      </button>
      <button
        onClick={onCancel}
        aria-label="Cancel"
        className="text-secondary hover:text-on-surface transition-colors"
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
    <div>

      {/* ── Summary row ── */}
      {withBudget.length > 0 && (
        <div className="grid grid-cols-3 gap-6 mb-10">
          {/* Total budgeted */}
          <div className="bg-white p-6 rounded-3xl shadow-ambient flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-medium text-secondary uppercase tracking-wider">Total budgeted</p>
            <div>
              <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
                {formatCurrency(totalBudgeted)}
              </h3>
              <p className="text-[10px] text-secondary mt-1">
                Across {withBudget.length} active {withBudget.length === 1 ? 'category' : 'categories'}
              </p>
            </div>
          </div>

          {/* Total spent — always red per design */}
          <div className="bg-white p-6 rounded-3xl shadow-ambient flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-medium text-secondary uppercase tracking-wider">Total spent</p>
            <div>
              <h3 className="text-3xl font-bold text-tertiary tracking-tight tabular-nums">
                {formatCurrency(totalSpent)}
              </h3>
            </div>
          </div>

          {/* Remaining */}
          <div className="bg-white p-6 rounded-3xl shadow-ambient flex flex-col justify-between min-h-[140px]">
            <p className="text-xs font-medium text-secondary uppercase tracking-wider">Remaining</p>
            <div>
              <h3 className={`text-3xl font-bold tracking-tight tabular-nums ${remaining >= 0 ? 'text-primary-container' : 'text-tertiary'}`}>
                {remaining >= 0 ? '' : '-'}{formatCurrency(Math.abs(remaining))}
              </h3>
              {remaining >= 0 && totalBudgeted > 0 && (
                <p className="text-[10px] text-primary-container font-medium mt-1">
                  {Math.round((remaining / totalBudgeted) * 100)}% of budget available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Budget list card ── */}
      {withBudget.length > 0 && (
        <div className="bg-white rounded-3xl shadow-ambient p-8 mb-6">
          <div className="mb-8 flex justify-between items-end">
            <h4 className="text-xs font-bold text-secondary uppercase tracking-widest">Monthly budgets</h4>
          </div>

          <div className="space-y-10">
            {withBudget.map((row) => {
              const over      = row.spent > row.monthlyBudget!
              const isEditing = editingId === row.id

              return (
                <div key={row.id} className="flex items-center group">
                  {/* Icon box */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mr-6 text-sm font-bold"
                    style={{
                      backgroundColor: over ? '#ffdad6' : row.colour + '22',
                      color: over ? '#b02d29' : row.colour,
                    }}
                  >
                    {row.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-2">
                      <div className="flex items-center gap-3">
                        <h5 className="text-sm font-bold text-on-surface">{row.name}</h5>
                        {over && (
                          <span className="bg-tertiary/10 text-tertiary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Over budget
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <BudgetEditor
                          row={row}
                          onSave={handleSave}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <span className={`text-xs font-medium tabular-nums ${over ? 'text-tertiary' : 'text-secondary'}`}>
                          <b className={over ? 'text-tertiary' : 'text-on-surface'}>{formatCurrency(row.spent)}</b>
                          {' of '}
                          {formatCurrency(row.monthlyBudget!)}
                        </span>
                      )}
                    </div>
                    <ProgressBar spent={row.spent} budget={row.monthlyBudget!} />
                  </div>

                  {/* Hover actions */}
                  {!isEditing && (
                    <div className="ml-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => setEditingId(row.id)}
                        aria-label={`Edit budget for ${row.name}`}
                        className="text-secondary hover:text-on-surface transition-colors"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Categories without budgets ── */}
      {withoutBudget.length > 0 && (
        <div className="bg-white rounded-2xl shadow-ambient divide-y divide-surface-container-low">
          {withoutBudget.map((row) => {
            const isEditing = editingId === row.id
            return (
              <div
                key={row.id}
                className="flex items-center justify-between px-6 py-3.5 group hover:bg-surface-container-low/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: row.colour }}
                  />
                  <span className="text-sm text-on-surface">{row.name}</span>
                  {row.spent > 0 && (
                    <span className="text-xs text-secondary tabular-nums">
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
                      className="text-xs text-secondary hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Set budget
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="bg-white rounded-3xl shadow-ambient px-6 py-16 text-center">
          <p className="text-sm text-secondary">No spending categories found.</p>
          <p className="text-xs text-secondary mt-1">
            Run <code className="font-mono">pnpm db:seed</code> to seed default categories.
          </p>
        </div>
      )}
    </div>
  )
}

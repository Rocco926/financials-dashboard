'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil, Check, X, ListFilter, Plus, TrendingUp, TrendingDown,
  ShoppingCart, Utensils, Car, Film, Tag, Zap, Coffee, Leaf,
  Heart, Dumbbell, Plane, Shield, Smartphone, House, PawPrint,
  Fuel, Wifi, Tv, Receipt, FolderOpen, ShoppingBag, Pill, Shirt,
  Gift, Baby, Bike, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Period = 'this_month' | '3_months' | 'all_time'

export type BudgetRow = {
  id:             string   // category id
  budgetId:       string | null
  name:           string
  colour:         string
  monthlyBudget:  number | null
  spent:          number
  spentLastMonth: number
}

interface Props {
  initialRows: BudgetRow[]
  period:      Period
  trendPct:    number | null
}

// ─── Category icon map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Groceries':          ShoppingCart,
  'Dining':             Utensils,
  'Dining & Takeaway':  Utensils,
  'Takeaway':           Utensils,
  'Transport':          Car,
  'Entertainment':      Film,
  'Shopping':           Tag,
  'Utilities':          Zap,
  'Coffee':             Coffee,
  'Coffee & Cafes':     Coffee,
  'Personal Care':      Leaf,
  'Health':             Heart,
  'Fitness':            Dumbbell,
  'Travel':             Plane,
  'Insurance':          Shield,
  'Subscriptions':      Smartphone,
  'Clothing':           Shirt,
  'Gifts':              Gift,
  'Home':               House,
  'Pets':               PawPrint,
  'Alcohol':            ShoppingBag,
  'Pharmacy':           Pill,
  'Medical':            Heart,
  'Fuel':               Fuel,
  'Public Transport':   Bike,
  'Internet':           Wifi,
  'Streaming':          Tv,
  'Tax':                Receipt,
  'Childcare':          Baby,
  'Education':          BookOpen,
}

function CategoryIcon({ name }: { name: string }) {
  const Icon = CATEGORY_ICONS[name] ?? FolderOpen
  return <Icon className="size-[18px] text-secondary" strokeWidth={1.75} />
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ spent, budget }: { spent: number; budget: number }) {
  const pct  = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const over = spent > budget

  const barColour = over || pct >= 90
    ? 'bg-tertiary'
    : pct >= 65
    ? 'bg-[#f59e0b]'
    : 'bg-primary-container'

  return (
    <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-500 rounded-full ${barColour}`}
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
  row:      BudgetRow
  onSave:   (id: string, budgetId: string | null, value: number | null) => Promise<void>
  onCancel: () => void
}) {
  const [value,  setValue]  = useState(row.monthlyBudget != null ? String(row.monthlyBudget) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const parsed = value.trim() === '' ? null : parseFloat(value)
    await onSave(row.id, row.budgetId, parsed && parsed > 0 ? parsed : null)
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
          if (e.key === 'Enter')  handleSave()
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

// ─── Add Budget Modal ─────────────────────────────────────────────────────────

function AddBudgetModal({
  unbudgeted,
  onSave,
  onClose,
}: {
  unbudgeted: BudgetRow[]
  onSave:     (categoryId: string, amount: number) => Promise<void>
  onClose:    () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [categoryId, setCategoryId] = useState(unbudgeted[0]?.id ?? '')
  const [amount,     setAmount]     = useState('')
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
    return () => dialogRef.current?.close()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0 || !categoryId) return
    setSaving(true)
    await onSave(categoryId, parsed)
    setSaving(false)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }}
      className="rounded-2xl shadow-ambient-lg p-0 backdrop:bg-on-surface/20 backdrop:backdrop-blur-sm w-full max-w-sm"
    >
      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-bold text-on-surface">Add Budget</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-on-surface transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-secondary uppercase tracking-widest mb-1.5">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-secondary-container bg-surface-container-low px-3 py-2 text-sm text-on-surface rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {unbudgeted.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-secondary uppercase tracking-widest mb-1.5">
              Monthly amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="1"
                min="1"
                placeholder="0"
                autoFocus
                className="w-full border border-secondary-container bg-surface-container-low pl-7 pr-3 py-2 text-sm text-on-surface tabular-nums rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-secondary-container text-secondary text-sm font-medium px-4 py-2 rounded-xl hover:bg-surface-container-low transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !amount || !categoryId}
            className="flex-1 bg-primary text-on-primary text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary-dim transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Add Budget'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

// ─── Period tabs ──────────────────────────────────────────────────────────────

const PERIODS: { key: Period; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: '3_months',   label: '3 months' },
  { key: 'all_time',   label: 'All time' },
]

function PeriodTabs({ current }: { current: Period }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-0.5 bg-surface-container-low rounded-xl p-1">
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => router.push(`/budgets?period=${key}`)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            current === key
              ? 'bg-white text-on-surface shadow-ambient'
              : 'text-secondary hover:text-on-surface'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BudgetsClient({ initialRows, period, trendPct }: Props) {
  const [rows,              setRows]              = useState<BudgetRow[]>(initialRows)
  const [editingId,         setEditingId]         = useState<string | null>(null)
  const [sortByUtilization, setSortByUtilization] = useState(false)
  const [showModal,         setShowModal]         = useState(false)

  // ── Shared create helper (used by inline editor + modal) ─────────────────

  async function createBudget(categoryId: string, amount: number): Promise<string | null> {
    const res = await fetch('/api/budgets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ categoryId, amount }),
    })
    if (!res.ok) return null
    const { data } = await res.json()
    setRows((prev) =>
      prev.map((r) => r.id === categoryId ? { ...r, budgetId: data.id, monthlyBudget: amount } : r),
    )
    return data.id
  }

  // ── Save handler (create / update / delete) ──────────────────────────────

  async function handleSave(
    categoryId: string,
    budgetId:   string | null,
    amount:     number | null,
  ) {
    if (amount === null) {
      // Removing the budget — DELETE the row
      if (budgetId) {
        const res = await fetch(`/api/budgets/${budgetId}`, { method: 'DELETE' })
        if (!res.ok) return
      }
      setRows((prev) =>
        prev.map((r) => r.id === categoryId ? { ...r, budgetId: null, monthlyBudget: null } : r),
      )
    } else if (budgetId) {
      // Updating existing budget — PATCH
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount }),
      })
      if (!res.ok) return
      setRows((prev) =>
        prev.map((r) => r.id === categoryId ? { ...r, monthlyBudget: amount } : r),
      )
    } else {
      await createBudget(categoryId, amount)
    }
    setEditingId(null)
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const withBudget    = rows.filter((r) => r.monthlyBudget != null)
  const withoutBudget = rows.filter((r) => r.monthlyBudget == null)

  const sortedWithBudget = sortByUtilization
    ? [...withBudget].sort((a, b) => {
        const aUtil = a.monthlyBudget! > 0 ? a.spent / a.monthlyBudget! : 0
        const bUtil = b.monthlyBudget! > 0 ? b.spent / b.monthlyBudget! : 0
        return bUtil - aUtil
      })
    : withBudget

  const totalBudgeted = withBudget.reduce((s, r) => s + r.monthlyBudget!, 0)
  const totalSpent    = withBudget.reduce((s, r) => s + r.spent, 0)
  const remaining     = totalBudgeted - totalSpent

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Top controls ── */}
      <div className="flex justify-between items-center mb-8">
        <PeriodTabs current={period} />
        <button
          onClick={() => setShowModal(true)}
          disabled={withoutBudget.length === 0}
          className="flex items-center gap-1.5 bg-primary text-on-primary text-xs font-semibold px-4 py-2 rounded-xl hover:bg-primary-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="size-3.5" />
          Add Budget
        </button>
      </div>

      {/* ── Summary cards ── */}
      {withBudget.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">

          {/* Total budgeted */}
          <div className="bg-white p-5 rounded-2xl shadow-ambient">
            <p className="text-[10px] font-semibold text-secondary uppercase tracking-widest mb-3">Total budgeted</p>
            <h3 className="text-2xl font-bold text-on-surface tabular-nums">
              {formatCurrency(totalBudgeted)}
            </h3>
            <p className="text-[10px] text-secondary mt-1">
              Across {withBudget.length} active {withBudget.length === 1 ? 'category' : 'categories'}
            </p>
          </div>

          {/* Total spent */}
          <div className="bg-white p-5 rounded-2xl shadow-ambient">
            <p className="text-[10px] font-semibold text-secondary uppercase tracking-widest mb-3">Total spent</p>
            <h3 className="text-2xl font-bold text-tertiary tabular-nums">
              {formatCurrency(totalSpent)}
            </h3>
            {trendPct !== null && (
              <p className={`text-[10px] mt-1 flex items-center gap-0.5 font-medium ${trendPct > 0 ? 'text-tertiary' : 'text-primary-container'}`}>
                {trendPct > 0
                  ? <TrendingUp className="size-3" />
                  : <TrendingDown className="size-3" />
                }
                {Math.abs(trendPct)}% {trendPct > 0 ? 'more' : 'less'} than last month
              </p>
            )}
          </div>

          {/* Remaining */}
          <div className="bg-white p-5 rounded-2xl shadow-ambient">
            <p className="text-[10px] font-semibold text-secondary uppercase tracking-widest mb-3">Remaining</p>
            <h3 className={`text-2xl font-bold tabular-nums ${remaining >= 0 ? 'text-primary' : 'text-tertiary'}`}>
              {remaining >= 0 ? '' : '-'}{formatCurrency(Math.abs(remaining))}
            </h3>
            {totalBudgeted > 0 && (
              <p className={`text-[10px] mt-1 font-medium ${remaining >= 0 ? 'text-primary-container' : 'text-tertiary'}`}>
                {remaining >= 0
                  ? `${Math.round((remaining / totalBudgeted) * 100)}% of budget available`
                  : 'Over total budget'
                }
              </p>
            )}
          </div>

        </div>
      )}

      {/* ── Budget list card ── */}
      {withBudget.length > 0 && (
        <div className="bg-white rounded-2xl shadow-ambient p-6 mb-6">
          <div className="mb-6 flex justify-between items-center">
            <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest">Monthly Budgets</h4>
            <button
              onClick={() => setSortByUtilization((s) => !s)}
              className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                sortByUtilization ? 'text-primary' : 'text-secondary hover:text-on-surface'
              }`}
            >
              <ListFilter className="size-3" />
              Sort by utilization
            </button>
          </div>

          <div className="space-y-5">
            {sortedWithBudget.map((row) => {
              const over      = row.spent > row.monthlyBudget!
              const isEditing = editingId === row.id

              return (
                <div key={row.id} className="flex items-center gap-4 group">

                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0">
                    <CategoryIcon name={row.name} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-semibold text-on-surface">{row.name}</h5>
                        {over && (
                          <span className="bg-tertiary/10 text-tertiary text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
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
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs tabular-nums text-secondary">
                            <span className={`font-bold ${over ? 'text-tertiary' : 'text-on-surface'}`}>
                              {formatCurrency(row.spent)}
                            </span>
                            {' of '}
                            {formatCurrency(row.monthlyBudget!)}
                          </span>
                          <button
                            onClick={() => setEditingId(row.id)}
                            aria-label={`Edit budget for ${row.name}`}
                            className="text-secondary hover:text-on-surface transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <ProgressBar spent={row.spent} budget={row.monthlyBudget!} />
                  </div>

                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Categories without budgets ── */}
      {withoutBudget.length > 0 && (
        <div className="bg-white rounded-2xl shadow-ambient overflow-hidden">
          <div className="px-6 py-3.5 border-b border-surface-container-low">
            <h4 className="text-[10px] font-bold text-secondary uppercase tracking-widest">Unbudgeted Categories</h4>
          </div>
          <div className="divide-y divide-surface-container-low">
            {withoutBudget.map((row) => {
              const isEditing = editingId === row.id
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between px-6 py-3 group hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: row.colour }} />
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
        </div>
      )}

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="bg-white rounded-2xl shadow-ambient px-6 py-16 text-center">
          <p className="text-sm text-secondary">No spending categories found.</p>
          <p className="text-xs text-secondary mt-1">
            Run <code className="font-mono">pnpm db:seed</code> to seed default categories.
          </p>
        </div>
      )}

      {/* ── Add Budget modal ── */}
      {showModal && withoutBudget.length > 0 && (
        <AddBudgetModal
          unbudgeted={withoutBudget}
          onSave={createBudget}
          onClose={() => setShowModal(false)}
        />
      )}

    </div>
  )
}

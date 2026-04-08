'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  transactionId: string
  currentCategory: string | null
  categories: { name: string; colour: string }[]
  /** Raw bank description — used to find similar uncategorised transactions. */
  description: string
}

export function CategoryEditor({ transactionId, currentCategory, categories, description }: Props) {
  const [value, setValue] = useState(currentCategory ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [isPending, startTransition] = useTransition()

  // "Apply to all similar" prompt state
  const [showPrompt, setShowPrompt]       = useState(false)
  const [similarCount, setSimilarCount]   = useState(0)
  const [appliedCategory, setAppliedCategory] = useState<string | null>(null)
  const [applying, setApplying]           = useState(false)

  const router = useRouter()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const prev = value
    setValue(next)
    setSaving(true)
    setSaveError(false)
    setShowPrompt(false)

    const res = await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: next || null }),
    })

    if (!res.ok) {
      setValue(prev)   // revert optimistic update
      setSaveError(true)
      setSaving(false)
      return
    }

    setSaving(false)

    // After saving, check whether there are other uncategorised transactions
    // with the same description. The PATCH above already wrote the category_rule
    // and updated this transaction — so the count query only returns others.
    if (next) {
      const pattern = description.toUpperCase().trim()
      try {
        const res = await fetch(
          `/api/transactions/bulk-categorise?pattern=${encodeURIComponent(pattern)}`,
        )
        const json = await res.json() as { count: number }
        if (json.count > 0) {
          setSimilarCount(json.count)
          setAppliedCategory(next)
          setShowPrompt(true)
        }
      } catch {
        // Non-critical — if the count check fails, skip the prompt silently.
      }
    }

    startTransition(() => {
      router.refresh()
    })
  }

  async function handleApplyAll() {
    if (!appliedCategory) return
    setApplying(true)
    const pattern = description.toUpperCase().trim()
    await fetch('/api/transactions/bulk-categorise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, category: appliedCategory }),
    })
    setApplying(false)
    setShowPrompt(false)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div>
      <select
        value={value}
        onChange={handleChange}
        disabled={saving || isPending}
        title={saveError ? 'Save failed — please try again' : undefined}
        className={`text-xs border rounded-lg px-2 py-1 bg-transparent focus:outline-none focus:border-[#C5C2BC] cursor-pointer disabled:opacity-50 max-w-[160px] ${
          saveError
            ? 'border-tertiary text-tertiary'
            : 'border-transparent hover:border-secondary-container'
        }`}
      >
        <option value="">Uncategorised</option>
        {categories.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>

      {showPrompt && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs bg-surface-container-low border border-secondary-container rounded-xl px-3 py-2 max-w-[340px]">
          <span className="text-secondary">
            Apply{' '}
            <span className="font-medium text-on-surface">{appliedCategory}</span>
            {' '}to {similarCount} other uncategorised{' '}
            {similarCount === 1 ? 'transaction' : 'transactions'}?
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleApplyAll}
              disabled={applying}
              className="text-on-surface font-medium hover:underline disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply all'}
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="text-secondary hover:text-secondary"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

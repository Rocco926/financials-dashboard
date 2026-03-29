/**
 * CategoryEditor — inline category selector for the transactions table.
 *
 * WHAT IT RENDERS
 * ────────────────
 * A <select> dropdown that appears inline in the category column of the
 * transactions table. The selected value is displayed directly in the cell.
 * Changing the selection immediately sends a PATCH request to update the
 * transaction's category in the database.
 *
 * USER EXPERIENCE
 * ────────────────
 * 1. User clicks on a category cell → the <select> opens (native browser dropdown)
 * 2. User picks a category
 * 3. The component immediately calls PATCH /api/transactions/[id]
 * 4. While the PATCH is in-flight, the select is disabled (prevents double-updates)
 * 5. On success, router.refresh() is called inside useTransition to re-render
 *    the Server Component with fresh data — the table updates without a full reload.
 *
 * OPTIMISTIC UPDATE NOTE
 * ───────────────────────
 * We use local state (useState) to immediately reflect the selected value in the
 * dropdown BEFORE the server responds. This makes the UI feel instant even if
 * the network round-trip takes 200-500ms.
 *
 * USETRANSITION
 * ─────────────
 * router.refresh() triggers a Server Component re-render. Wrapping it in
 * startTransition() marks it as a non-urgent update — React continues rendering
 * the current UI while the refresh happens in the background. This prevents
 * the table from going blank while data reloads.
 *
 * CLIENT COMPONENT
 * ─────────────────
 * Must be 'use client' because it uses useState, useTransition, useRouter,
 * and calls fetch() on user interaction.
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** UUID of the transaction being edited */
  transactionId: string
  /** Current category name, or null if uncategorised */
  currentCategory: string | null
  /** All available categories from the database (for the dropdown options) */
  categories: { name: string; colour: string }[]
}

/**
 * Inline category dropdown for a single transaction row.
 *
 * Renders as a minimal, borderless select that gains a border on hover/focus.
 * This keeps the table visually clean until the user interacts with a cell.
 */
export function CategoryEditor({ transactionId, currentCategory, categories }: Props) {
  // Local state mirrors the current selection for immediate UI feedback
  const [value, setValue] = useState(currentCategory ?? '')

  // `saving` controls the disabled state during the PATCH request
  const [saving, setSaving] = useState(false)

  // useTransition allows router.refresh() to happen without blocking the UI
  const [isPending, startTransition] = useTransition()

  const router = useRouter()

  /**
   * Handles the <select> onChange event.
   * 1. Updates local state immediately (optimistic)
   * 2. Sends PATCH to update the DB
   * 3. On success, triggers a server-side refresh
   */
  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setValue(next)     // Immediately update the displayed value
    setSaving(true)

    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Send null when the user selects "Uncategorised" (empty string option)
      body: JSON.stringify({ category: next || null }),
    })

    setSaving(false)

    // Refresh the Server Component to re-render the table with fresh data.
    // startTransition prevents the UI from showing a loading state.
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving || isPending}
      className="text-xs border border-transparent hover:border-gray-200 rounded px-2 py-1 bg-transparent focus:outline-none focus:border-gray-300 cursor-pointer disabled:opacity-50 max-w-[160px]"
    >
      {/* Empty value = uncategorised */}
      <option value="">Uncategorised</option>

      {/* One option per category from the database */}
      {categories.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

interface Account {
  id: string
  name: string
}

interface Props {
  accounts: Account[]
}

type DeleteMode = 'transactions' | 'account'

export function ClearAccountButton({ accounts }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<DeleteMode>('transactions')
  const [pending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      el.showModal()
    } else {
      el.close()
    }
  }, [open])

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const onClose = () => {
      setOpen(false)
      setSelectedId('')
      setMode('transactions')
    }
    el.addEventListener('close', onClose)
    return () => el.removeEventListener('close', onClose)
  }, [])

  function handleConfirm() {
    if (!selectedId) return
    startTransition(async () => {
      if (mode === 'account') {
        // Deleting the account cascades to all its transactions via FK
        await fetch(`/api/accounts/${selectedId}`, { method: 'DELETE' })
      } else {
        await fetch(`/api/transactions?accountId=${selectedId}`, { method: 'DELETE' })
      }
      setOpen(false)
      setSelectedId('')
      setMode('transactions')
      router.refresh()
    })
  }

  const selectedAccount = accounts.find((a) => a.id === selectedId)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-secondary hover:text-tertiary transition-colors"
      >
        Clear transactions…
      </button>

      <dialog
        ref={dialogRef}
        className="rounded-2xl border border-secondary-container shadow-xl p-0 w-[400px] backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false)
        }}
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEF2F2]">
              <Trash2 className="size-4 text-tertiary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Clear account data</h2>
              <p className="mt-1 text-xs text-secondary leading-relaxed">
                Choose what to delete. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Account selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary">Account</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              autoFocus
              className="w-full bg-surface-container-low border border-secondary-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all rounded-xl"
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Mode selector — only shown once an account is picked */}
          {selectedId && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary">What to delete</label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-secondary-container px-4 py-3 transition-colors hover:border-on-surface has-[:checked]:border-tertiary has-[:checked]:bg-tertiary-container">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="transactions"
                    checked={mode === 'transactions'}
                    onChange={() => setMode('transactions')}
                    className="mt-0.5 accent-tertiary"
                  />
                  <div>
                    <p className="text-sm font-medium text-on-surface">Transactions only</p>
                    <p className="text-xs text-secondary mt-0.5">
                      Keep the account entry, remove all imported transactions.
                      You can re-import later.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-secondary-container px-4 py-3 transition-colors hover:border-on-surface has-[:checked]:border-tertiary has-[:checked]:bg-tertiary-container">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="account"
                    checked={mode === 'account'}
                    onChange={() => setMode('account')}
                    className="mt-0.5 accent-tertiary"
                  />
                  <div>
                    <p className="text-sm font-medium text-on-surface">Account + all transactions</p>
                    <p className="text-xs text-secondary mt-0.5">
                      Remove the account entirely, including every transaction linked to it.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2 text-sm text-secondary hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId || pending}
              className="px-4 py-2 text-sm bg-tertiary text-white hover:bg-red-700 transition-colors rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pending
                ? 'Deleting…'
                : mode === 'account'
                  ? 'Delete account'
                  : 'Delete transactions'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

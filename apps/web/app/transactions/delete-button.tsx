'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  transactionId: string
}

export function DeleteButton({ transactionId }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    startTransition(async () => {
      await fetch(`/api/transactions/${transactionId}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1 text-xs">
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-tertiary hover:underline disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-secondary hover:text-secondary"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      aria-label="Delete transaction"
      className="text-secondary hover:text-tertiary transition-colors"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

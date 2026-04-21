'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

interface Filters {
  accountId?: string
  from?:      string
  to?:        string
  category?:  string
  type?:      string
  search?:    string
}

export function ExportButton({ filters }: { filters: Filters }) {
  const [loading, setLoading] = useState(false)

  function handleExport() {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v)
    }
    setLoading(true)
    // Trigger browser download — the response has Content-Disposition: attachment
    const url = `/api/transactions/export?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.click()
    // Give the browser a moment to start the download before re-enabling
    setTimeout(() => setLoading(false), 1500)
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 border border-secondary-container text-secondary px-4 py-2.5 rounded-3xl font-semibold text-sm hover:bg-surface-container-low transition-all active:scale-95 disabled:opacity-40"
    >
      <Download className="size-4" />
      {loading ? 'Exporting…' : 'Export CSV'}
    </button>
  )
}

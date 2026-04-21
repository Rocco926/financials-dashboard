'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** YYYY-MM string for the current month to summarise */
  month: string
  /** Pre-fetched content from the server (may be null if no data yet) */
  initialContent: string | null
}

export function MonthlySummary({ month, initialContent }: Props) {
  const [content,     setContent]     = useState<string | null>(initialContent)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function regenerate() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/summaries?month=${month}`, { method: 'POST' })
      const data = await res.json() as { content?: string; error?: string }
      if (!res.ok || !data.content) {
        setError(data.error ?? 'Failed to generate summary.')
      } else {
        setContent(data.content)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white p-8 rounded-[24px] shadow-ambient mb-8">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-5 text-secondary" strokeWidth={1.5} />
          <div>
            <h4 className="text-sm font-semibold text-on-surface">Monthly Summary</h4>
            <p className="text-xs text-secondary mt-0.5">AI-generated overview of your month</p>
          </div>
        </div>

        <button
          onClick={() => void regenerate()}
          disabled={loading}
          className={cn(
            'flex items-center gap-1.5 text-xs text-secondary hover:text-on-surface transition-colors rounded-full px-3 py-1.5 hover:bg-surface-container-low',
            loading && 'opacity-50 pointer-events-none',
          )}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} strokeWidth={1.5} />
          {loading ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : content ? (
        <p className="text-sm text-on-surface leading-relaxed">{content}</p>
      ) : (
        <p className="text-sm text-secondary italic">
          No summary yet — click Regenerate to generate one.
        </p>
      )}

      <p className="text-[10px] text-secondary/50 mt-4 flex items-center gap-1">
        <Sparkles className="size-2.5" />
        Powered by Claude
      </p>
    </section>
  )
}

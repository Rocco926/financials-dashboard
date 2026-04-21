'use client'

import { useState } from 'react'
import { AlertTriangle, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Anomaly } from './page'

interface Props {
  anomalies: Anomaly[]
}

const SEVERITY_CONFIG = {
  high:   { label: 'High',   bg: 'bg-tertiary-container',  text: 'text-tertiary',  dot: 'bg-tertiary'  },
  medium: { label: 'Medium', bg: 'bg-[#fff3e0]',           text: 'text-[#e65100]', dot: 'bg-[#ff6d00]' },
  low:    { label: 'Low',    bg: 'bg-secondary-container', text: 'text-secondary', dot: 'bg-secondary'  },
} as const

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 })
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function AnomaliesClient({ anomalies }: Props) {
  const [dismissed,     setDismissed]     = useState<Set<string>>(new Set())
  const [showDismissed, setShowDismissed] = useState(false)

  const highCount   = anomalies.filter((a) => a.severity === 'high'   && !dismissed.has(a.txId)).length
  const mediumCount = anomalies.filter((a) => a.severity === 'medium' && !dismissed.has(a.txId)).length
  const lowCount    = anomalies.filter((a) => a.severity === 'low'    && !dismissed.has(a.txId)).length
  const visible     = anomalies.filter((a) => showDismissed || !dismissed.has(a.txId))

  function dismiss(txId: string) {
    setDismissed((prev) => new Set([...prev, txId]))
  }

  function undismiss(txId: string) {
    setDismissed((prev) => { const s = new Set(prev); s.delete(txId); return s })
  }

  if (anomalies.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-ambient p-16 text-center">
        <ShieldCheck className="size-10 text-primary/40 mx-auto mb-4" strokeWidth={1} />
        <p className="font-medium text-on-surface mb-1">No anomalies detected</p>
        <p className="text-sm text-secondary">Your last 30 days of spending looks normal.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        {highCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-tertiary-container">
            <span className="size-2 rounded-full bg-tertiary" />
            <span className="text-sm font-semibold text-tertiary">{highCount} high</span>
          </div>
        )}
        {mediumCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#fff3e0]">
            <span className="size-2 rounded-full bg-[#ff6d00]" />
            <span className="text-sm font-semibold text-[#e65100]">{mediumCount} medium</span>
          </div>
        )}
        {lowCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-container">
            <span className="size-2 rounded-full bg-secondary" />
            <span className="text-sm font-semibold text-secondary">{lowCount} low</span>
          </div>
        )}
        {dismissed.size > 0 && (
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className="flex items-center gap-1.5 ml-auto text-xs text-secondary hover:text-on-surface transition-colors"
          >
            {showDismissed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showDismissed ? 'Hide' : 'Show'} {dismissed.size} dismissed
          </button>
        )}
      </div>

      {/* Anomaly cards */}
      <div className="space-y-3">
        {visible.map((anomaly) => {
          const cfg         = SEVERITY_CONFIG[anomaly.severity]
          const isDismissed = dismissed.has(anomaly.txId)

          return (
            <div
              key={anomaly.txId}
              className={cn(
                'bg-white rounded-2xl shadow-ambient p-5 flex items-start gap-4 transition-opacity duration-200',
                isDismissed && 'opacity-40',
              )}
            >
              {/* Severity icon */}
              <div className={cn('mt-0.5 size-8 rounded-full flex items-center justify-center shrink-0', cfg.bg)}>
                <AlertTriangle className={cn('size-4', cfg.text)} strokeWidth={1.5} />
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-on-surface truncate">{anomaly.merchant}</p>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0',
                        cfg.bg, cfg.text,
                      )}>
                        <span className={cn('size-1.5 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-0.5">{anomaly.reason}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-on-surface tabular-nums">{fmt(anomaly.amount)}</p>
                    <p className="text-xs text-secondary mt-0.5">{fmtDate(anomaly.date)}</p>
                  </div>
                </div>

                {/* Footer: category + dismiss */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5">
                    {anomaly.colour && (
                      <span className="size-2 rounded-full shrink-0" style={{ background: anomaly.colour }} />
                    )}
                    <span className="text-xs text-secondary">{anomaly.category ?? 'Uncategorised'}</span>
                  </div>
                  <button
                    onClick={() => isDismissed ? undismiss(anomaly.txId) : dismiss(anomaly.txId)}
                    className="text-xs text-secondary hover:text-on-surface transition-colors"
                  >
                    {isDismissed ? 'Restore' : 'Dismiss'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

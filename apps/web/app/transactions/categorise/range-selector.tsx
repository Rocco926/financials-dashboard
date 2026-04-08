'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'

const PRESETS = [
  { value: '30days',  label: 'Last 30 days' },
  { value: '3months', label: '3 months'     },
  { value: '6months', label: '6 months'     },
  { value: 'year',    label: 'This year'    },
  { value: 'all',     label: 'All time'     },
] as const

const inputCls =
  'w-full bg-surface-container-low border border-secondary-container px-3 py-1.5 text-sm text-on-surface rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all'

export function CategoriseRangeSelector() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const current      = searchParams.get('range') ?? 'all'
  const isCustom     = current === 'custom'

  const [showPicker, setShowPicker] = useState(false)
  // Pre-populate from URL when custom is already active
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') ?? '')
  const [customTo,   setCustomTo]   = useState(searchParams.get('to')   ?? '')

  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on click-outside
  useEffect(() => {
    if (!showPicker) return
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showPicker])

  function selectPreset(value: string) {
    setShowPicker(false)
    const params = new URLSearchParams()
    if (value !== 'all') params.set('range', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    setShowPicker(false)
    const params = new URLSearchParams()
    params.set('range', 'custom')
    params.set('from', customFrom)
    params.set('to', customTo)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Human-readable label for the Custom button when a range is active
  const customLabel = isCustom
    ? formatDateRange(searchParams.get('from'), searchParams.get('to'))
    : 'Custom'

  return (
    <div className="flex items-center gap-1 bg-white shadow-sm rounded-xl p-1 border border-secondary-container">
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => selectPreset(value)}
          className={cn(
            'text-sm px-3 py-1 rounded-lg transition-colors whitespace-nowrap',
            current === value
              ? 'bg-surface-container-low text-on-surface font-medium'
              : 'text-secondary hover:text-on-surface',
          )}
        >
          {label}
        </button>
      ))}

      {/* Custom range button + dropdown */}
      <div ref={pickerRef} className="relative">
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 text-sm px-3 py-1 rounded-lg transition-colors whitespace-nowrap',
            isCustom
              ? 'bg-surface-container-low text-on-surface font-medium'
              : 'text-secondary hover:text-on-surface',
          )}
        >
          <CalendarDays className="size-3.5 shrink-0" />
          {customLabel}
        </button>

        {showPicker && (
          <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-secondary-container rounded-2xl shadow-xl p-4 w-60">
            <p className="text-xs font-medium text-secondary mb-3">Custom date range</p>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs text-secondary mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
                className="w-full mt-1 py-2 text-sm bg-primary text-white rounded-xl hover:bg-primary-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Formats two YYYY-MM-DD strings into a compact label like "1 Jan – 31 Mar 2026". */
function formatDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return 'Custom'
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const fromStr = f.toLocaleDateString('en-AU', opts)
  const toStr   = t.toLocaleDateString('en-AU', {
    ...opts,
    year: f.getFullYear() !== t.getFullYear() ? 'numeric' : undefined,
  })
  return `${fromStr} – ${toStr} ${t.getFullYear()}`
}

'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronDown, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import type { MerchantGroup, ReviewItem } from './page'
import { cn } from '@/lib/utils'

interface Props {
  groups:      MerchantGroup[]
  categories:  { name: string; colour: string }[]
  reviewItems: ReviewItem[]
  /** When set, bulk-categorise only updates transactions within this range. */
  from?: string
  to?:   string
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

interface CategoryPickerProps {
  categories:  { name: string; colour: string }[]
  onSelect:    (category: string) => void
  disabled?:   boolean
  hasError?:   boolean
}

function CategoryPicker({ categories, onSelect, disabled, hasError }: CategoryPickerProps) {
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState('')
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 288 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  function openPicker() {
    if (disabled || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const panelWidth = 288
    const left = rect.left + panelWidth > window.innerWidth
      ? rect.right - panelWidth
      : rect.left
    setPanelPos({ top: rect.bottom + 6, left, width: panelWidth })
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())

    function onMouseDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    function onScroll() { close() }

    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const filtered = query
    ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 rounded-full bg-surface-container-low text-secondary text-xs font-medium hover:bg-surface-container transition-colors',
          hasError   ? 'ring-2 ring-tertiary' : '',
          open       ? 'ring-2 ring-primary/20' : '',
          disabled   ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <span className="flex-1 truncate text-left">Select category…</span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
          className="fixed z-50 bg-white border border-secondary-container rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-surface-container-low">
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') close()
                if (e.key === 'Enter' && filtered.length === 1) {
                  onSelect(filtered[0]!.name)
                  close()
                }
              }}
              className="w-full bg-surface-container-low border border-secondary-container rounded-xl px-3 py-1.5 text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <div className="p-1.5 grid grid-cols-2 gap-0.5 max-h-64 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => { onSelect(c.name); close() }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-surface-container-low transition-colors text-left"
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: c.colour }}
                />
                <span className="text-xs text-on-surface truncate leading-tight">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-2 py-4 text-center text-xs text-secondary">No matches</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: ReviewItem['source'] }) {
  if (source === 'claude') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-bold border border-violet-200">
        <Sparkles className="size-2.5" />
        AI
      </span>
    )
  }
  if (source === 'keyword') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 text-[10px] font-bold border border-sky-200">
        Keyword
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-surface-container text-secondary text-[10px] font-bold border border-secondary-container">
      Bank
    </span>
  )
}

// ─── ReviewSection ────────────────────────────────────────────────────────────

interface ReviewSectionProps {
  items:       ReviewItem[]
  categories:  { name: string; colour: string }[]
  onComplete:  () => void
}

function ReviewSection({ items: initialItems, categories, onComplete }: ReviewSectionProps) {
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set())
  const [saving, setSaving]         = useState<Set<string>>(new Set())
  const [errors, setErrors]         = useState<Set<string>>(new Set())
  const [, startTransition]         = useTransition()
  const router                      = useRouter()

  const visible = initialItems.filter(item => !dismissed.has(item.pattern))

  async function confirmItem(item: ReviewItem, confirmedCategory: string) {
    const key = item.pattern
    setSaving(prev => new Set(prev).add(key))
    setErrors(prev => { const s = new Set(prev); s.delete(key); return s })

    const res = await fetch('/api/transactions/review', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pattern: item.pattern, confirmedCategory }),
    })

    setSaving(prev => { const s = new Set(prev); s.delete(key); return s })
    if (res.ok) {
      setDismissed(prev => new Set(prev).add(key))
      startTransition(() => router.refresh())
    } else {
      setErrors(prev => new Set(prev).add(key))
    }
  }

  if (visible.length === 0) {
    onComplete()
    return null
  }

  return (
    <section className="bg-white rounded-2xl shadow-ambient overflow-hidden mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-surface-container-low">
        <div>
          <h2 className="text-sm font-bold text-on-surface">Review auto-categorised transactions</h2>
          <p className="text-xs text-secondary mt-0.5">
            Accept to confirm, or pick a different category. Accepted rules are remembered for future imports.
          </p>
        </div>
        <span className="text-xs font-bold text-secondary tabular-nums bg-surface-container-low px-2.5 py-1 rounded-full">
          {visible.length} remaining
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1.5fr_80px_1fr_1.5fr_160px] gap-4 px-8 py-3 bg-surface-container-low/60 text-[10px] uppercase tracking-widest font-bold text-secondary">
        <span>Merchant</span>
        <span className="text-center">Txns</span>
        <span>Source</span>
        <span>Suggested Category</span>
        <span className="text-right">Actions</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-surface-container-low/60">
        {visible.map(item => {
          const isSaving   = saving.has(item.pattern)
          const hasError   = errors.has(item.pattern)
          const merchant   = item.displayMerchant ?? item.displayDescription
          const initial    = merchant.charAt(0).toUpperCase()
          const catColour  = categories.find(c => c.name === item.suggestedCategory)?.colour

          return (
            <div
              key={item.pattern}
              className="grid grid-cols-[1.5fr_80px_1fr_1.5fr_160px] items-center gap-4 px-8 py-4"
            >
              {/* Merchant */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 text-sm font-bold text-secondary">
                  {initial}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-on-surface truncate">{merchant}</p>
                  {item.displayMerchant &&
                   item.displayMerchant.toUpperCase() !== item.displayDescription.toUpperCase() && (
                    <p className="text-xs text-secondary truncate mt-0.5">{item.displayDescription}</p>
                  )}
                </div>
              </div>

              {/* Count */}
              <div className="flex justify-center">
                <span className="text-xs font-bold text-secondary tabular-nums">{item.count}</span>
              </div>

              {/* Source badge */}
              <div>
                <SourceBadge source={item.source} />
              </div>

              {/* Suggested category */}
              <div className="flex items-center gap-2">
                {catColour && (
                  <span className="size-2 rounded-full shrink-0" style={{ background: catColour }} />
                )}
                <span className="text-sm font-medium text-on-surface truncate">
                  {item.suggestedCategory}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                {hasError && (
                  <span className="text-[10px] text-tertiary">Failed</span>
                )}
                {isSaving ? (
                  <Loader2 className="size-4 text-secondary animate-spin" />
                ) : (
                  <>
                    <button
                      onClick={() => confirmItem(item, item.suggestedCategory)}
                      className="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-all active:scale-95"
                    >
                      Accept
                    </button>
                    <div className="w-28">
                      <CategoryPicker
                        categories={categories}
                        onSelect={(cat) => confirmItem(item, cat)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── AutoCategoriseButton ─────────────────────────────────────────────────────

function AutoCategoriseButton() {
  const [state, setState]       = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult]     = useState<{ categorised: number; skipped: number } | null>(null)
  const [, startTransition]     = useTransition()
  const router                  = useRouter()

  async function run() {
    setState('loading')
    try {
      const res = await fetch('/api/transactions/auto-categorise', { method: 'POST' })
      if (!res.ok) { setState('error'); return }
      const json = await res.json() as { categorised: number; skipped: number }
      setResult(json)
      setState('done')
      startTransition(() => router.refresh())
    } catch {
      setState('error')
    }
  }

  if (state === 'done' && result) {
    return (
      <span className="text-xs font-medium text-primary">
        {result.categorised > 0
          ? `${result.categorised} transaction${result.categorised !== 1 ? 's' : ''} categorised — review below`
          : 'Nothing new to categorise'}
      </span>
    )
  }

  return (
    <button
      onClick={run}
      disabled={state === 'loading'}
      className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
    >
      {state === 'loading' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Sparkles className="size-3.5" />
      )}
      {state === 'loading' ? 'Running AI…' : state === 'error' ? 'Try again' : 'Auto-categorise with AI'}
    </button>
  )
}

// ─── CategoriseClient ─────────────────────────────────────────────────────────

export function CategoriseClient({ groups: initialGroups, categories, reviewItems: initialReviewItems, from, to }: Props) {
  const [sessionGroups] = useState(initialGroups)
  const [reviewItems, setReviewItems] = useState(initialReviewItems)

  // Pending = selected but not yet submitted
  const [pending, setPending]   = useState<Map<string, string>>(new Map())
  // Done = successfully saved
  const [done, setDone]         = useState<Set<string>>(new Set())
  // Fading = saved, still briefly visible before hiding
  const [fading, setFading]     = useState<Set<string>>(new Set())
  // Skipped = hidden from list
  const [skipped, setSkipped]   = useState<Set<string>>(new Set())
  // Error patterns
  const [errors, setErrors]     = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition]         = useTransition()
  const router                      = useRouter()

  const fadeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = fadeTimers.current
    return () => { timers.forEach(clearTimeout) }
  }, [])

  const visible = sessionGroups.filter(
    g => (!done.has(g.pattern) || fading.has(g.pattern)) && !skipped.has(g.pattern),
  )
  const doneCount    = done.size
  const pendingCount = pending.size
  const total        = sessionGroups.length
  const pct          = total > 0 ? Math.round((doneCount / total) * 100) : 0

  function handleSelect(pattern: string, category: string) {
    setPending(prev => new Map(prev).set(pattern, category))
    setErrors(prev => { const s = new Set(prev); s.delete(pattern); return s })
  }

  function handleSkip(pattern: string) {
    setPending(prev => { const m = new Map(prev); m.delete(pattern); return m })
    setSkipped(prev => new Set(prev).add(pattern))
  }

  async function submitOne(pattern: string, category: string): Promise<boolean> {
    const res = await fetch('/api/transactions/bulk-categorise', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pattern, category, from, to }),
    })
    return res.ok
  }

  async function handleSubmit() {
    if (pending.size === 0 || submitting) return
    setSubmitting(true)

    const entries = Array.from(pending.entries())
    const results = await Promise.allSettled(
      entries.map(([pattern, category]) => submitOne(pattern, category)),
    )

    const newErrors = new Set<string>()
    const newDone   = new Set(done)
    const newFading = new Set(fading)
    const newPending = new Map(pending)

    results.forEach((result, i) => {
      const [pattern] = entries[i]!
      if (result.status === 'fulfilled' && result.value) {
        newDone.add(pattern)
        newFading.add(pattern)
        newPending.delete(pattern)

        const timer = setTimeout(() => {
          setFading(prev => { const s = new Set(prev); s.delete(pattern); return s })
          fadeTimers.current.delete(pattern)
        }, 700)
        fadeTimers.current.set(pattern, timer)
      } else {
        newErrors.add(pattern)
      }
    })

    setDone(newDone)
    setFading(newFading)
    setPending(newPending)
    setErrors(newErrors)
    setSubmitting(false)

    startTransition(() => router.refresh())
  }

  function handleMarkAll(category: string) {
    const unassigned = visible.filter(
      g => !pending.has(g.pattern) && !done.has(g.pattern),
    )
    setPending(prev => {
      const m = new Map(prev)
      unassigned.forEach(g => m.set(g.pattern, category))
      return m
    })
  }

  // ── All done state ─────────────────────────────────────────────────────────
  if (visible.length === 0 && reviewItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-ambient px-6 py-16 text-center">
        <CheckCircle2 className="size-8 text-primary mx-auto mb-3" />
        <p className="text-sm font-medium text-on-surface">Session complete!</p>
        <p className="text-xs text-secondary mt-1">
          {skipped.size > 0
            ? `${skipped.size} merchant${skipped.size !== 1 ? 's' : ''} skipped — reload the page to review them.`
            : 'Every merchant in this batch has been categorised.'}
        </p>
      </div>
    )
  }

  const firstCategory = categories[0]?.name

  return (
    <div className="flex flex-col gap-8">

      {/* Auto-categorise button */}
      <div className="flex justify-end">
        <AutoCategoriseButton />
      </div>

      {/* Review section — auto-categorised items needing confirmation */}
      {reviewItems.length > 0 && (
        <ReviewSection
          items={reviewItems}
          categories={categories}
          onComplete={() => setReviewItems([])}
        />
      )}

      {/* Uncategorised section */}
      {visible.length > 0 && (
        <section className="bg-white rounded-2xl shadow-ambient overflow-hidden">

          {/* Table header */}
          <div className="grid grid-cols-[1.5fr_1fr_1.5fr_60px] gap-4 px-8 py-4 bg-surface-container-low text-[11px] uppercase tracking-widest font-bold text-secondary">
            <span>Merchant Name</span>
            <span className="text-center">Count</span>
            <span>Category Mapping</span>
            <span className="text-right">Action</span>
          </div>

          {/* Progress bar (shown once any row is done) */}
          {doneCount > 0 && (
            <div className="flex items-center gap-3 px-8 py-3 border-b border-surface-container-low">
              <div className="w-48 h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-container rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-primary">
                {doneCount} of {total} done
              </span>
            </div>
          )}

          {/* Rows */}
          <div className="px-8 py-4 flex flex-col gap-4">
            {visible.map((group) => {
              const isFading   = fading.has(group.pattern)
              const hasError   = errors.has(group.pattern)
              const selected   = pending.get(group.pattern)
              const merchant   = group.displayMerchant ?? group.displayDescription
              const initial    = merchant.charAt(0).toUpperCase()

              return (
                <div
                  key={group.pattern}
                  className={cn(
                    'grid grid-cols-[1.5fr_1fr_1.5fr_60px] items-center gap-4 py-2 transition-opacity duration-500',
                    isFading ? 'opacity-30 pointer-events-none' : '',
                  )}
                >
                  {/* Merchant */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 text-sm font-bold text-secondary">
                      {isFading
                        ? <CheckCircle2 className="size-4 text-primary" />
                        : initial
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold tracking-tight text-on-surface truncate">{merchant}</p>
                      {group.displayMerchant &&
                       group.displayMerchant.toUpperCase() !== group.displayDescription.toUpperCase() && (
                        <p className="text-xs text-secondary truncate mt-0.5">
                          {group.displayDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Count */}
                  <div className="flex justify-center">
                    {isFading ? (
                      <span className="px-3 py-1 rounded-full bg-surface-container text-xs font-bold text-secondary">
                        {group.uncategorisedCount}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-tertiary-container/60 text-tertiary text-[10px] font-extrabold tracking-tight">
                        {group.uncategorisedCount} UNCATEGORISED
                      </span>
                    )}
                  </div>

                  {/* Category */}
                  <div>
                    {hasError && (
                      <p className="text-xs text-tertiary mb-1">Save failed — try again</p>
                    )}
                    {selected ? (
                      <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-container/20 text-primary text-xs font-bold">
                        {selected}
                      </div>
                    ) : (
                      <CategoryPicker
                        categories={categories}
                        onSelect={(category) => handleSelect(group.pattern, category)}
                        disabled={isFading}
                        hasError={hasError}
                      />
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSkip(group.pattern)}
                      title="Skip for now"
                      className="text-secondary hover:text-on-surface transition-colors"
                    >
                      <ArrowRight className="size-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-surface-container-low flex justify-between items-center">
            {firstCategory ? (
              <button
                onClick={() => handleMarkAll(firstCategory)}
                className="text-xs font-bold text-secondary hover:text-on-surface underline decoration-dotted underline-offset-4 transition-colors"
              >
                Mark all remaining as &lsquo;{firstCategory}&rsquo;
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/transactions')}
                className="px-6 py-3 rounded-full bg-secondary-container text-secondary text-sm font-bold hover:bg-secondary-fixed-dim transition-all active:scale-95"
              >
                Save for later
              </button>
              <button
                onClick={handleSubmit}
                disabled={pendingCount === 0 || submitting}
                className="px-8 py-3 rounded-full bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary-dim hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
              >
                {submitting ? 'Saving…' : `Submit ${pendingCount} Change${pendingCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

        </section>
      )}

    </div>
  )
}

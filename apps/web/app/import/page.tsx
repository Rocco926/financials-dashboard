'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { FileText, X, ArrowRight, CheckCircle, AlertCircle, Upload } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type AccountType = 'transaction' | 'savings' | 'credit_card' | 'loan'

interface Account {
  id:          string
  name:        string
  institution: string
  type:        AccountType
}

interface PreviewTransaction {
  date:        string
  description: string
  amount:      number
  type:        'credit' | 'debit'
  balance:     number | null
}

interface PreviewResult {
  format:       string
  totalCount:   number
  accountName?: string
  currency:     string
  parseErrors:  string[]
  preview:      PreviewTransaction[]
}

interface ImportResult {
  imported: number
  skipped:  number
  errors:   string[]
}

type AccountType2 = AccountType

const ACCOUNT_TYPE_LABELS: Record<AccountType2, string> = {
  transaction:  'Transaction / Everyday',
  savings:      'Savings',
  credit_card:  'Credit Card',
  loan:         'Loan',
}

const ACCEPTED_EXTENSIONS = '.csv,.qif,.ofx,.qbo'

const HOW_IT_WORKS = [
  {
    title: 'Export CSV from your bank',
    body:  'Download your monthly activity statement from internet banking.',
  },
  {
    title: 'Upload here',
    body:  'Duplicates are automatically skipped. We scan for transaction IDs.',
  },
  {
    title: 'Categorise',
    body:  'Review your transactions and apply tags or budget categories.',
  },
]

export default function ImportPage() {
  const [files,      setFiles]      = useState<File[]>([])
  const [dragging,   setDragging]   = useState(false)
  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [accountId,  setAccountId]  = useState<string>('')
  const [isNew,      setIsNew]      = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', institution: '', type: 'transaction' as AccountType })
  const [preview,    setPreview]    = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState<ImportResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [accountsLoaded, setAccountsLoaded] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Load accounts immediately on mount so the selector is always visible
  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.ok ? r.json() : [])
      .then((data: Account[]) => {
        setAccounts(data)
        if (data.length === 0) setIsNew(true)
        setAccountsLoaded(true)
      })
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) { setFiles(dropped); setPreview(null) }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length > 0) { setFiles(selected); setPreview(null) }
  }

  async function handlePreview() {
    if (files.length === 0) return
    setError(null)
    setPreviewing(true)
    const form = new FormData()
    form.append('file', files[0]!)
    const res = await fetch('/api/import/preview', { method: 'POST', body: form })
    setPreviewing(false)
    if (!res.ok) {
      const { error: e } = (await res.json()) as { error: string }
      setError(e)
      return
    }
    setPreview(await res.json() as PreviewResult)
  }

  async function handleImport() {
    setError(null)
    setImporting(true)
    const form = new FormData()
    for (const file of files) form.append('files', file)
    if (isNew) {
      form.append('accountName', newAccount.name)
      form.append('institution', newAccount.institution)
      form.append('accountType', newAccount.type)
    } else {
      form.append('accountId', accountId)
    }
    try {
      const res  = await fetch('/api/import', { method: 'POST', body: form })
      const data = (await res.json()) as ImportResult | { error: string }
      if (!res.ok) { setError('error' in data ? data.error : 'Import failed'); return }
      setResult(data as ImportResult)
    } catch {
      setError('Request failed. Check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setFiles([])
    setPreview(null)
    setResult(null)
    setError(null)
    setAccountId('')
    setIsNew(false)
    setNewAccount({ name: '', institution: '', type: 'transaction' })
  }

  const accountValid = isNew
    ? newAccount.name.trim() !== '' && newAccount.institution.trim() !== ''
    : !!accountId

  // ── Done state ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div>
        <header className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-on-surface">Import complete</h1>
            <p className="text-secondary mt-1 font-medium">Your transactions have been added.</p>
          </div>
          <Link href="/import/history" className="flex items-center gap-1 text-secondary font-medium hover:text-on-surface transition-colors text-sm">
            View History <ArrowRight className="size-4" />
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-6 max-w-xl mb-8">
          <div className="bg-white rounded-3xl p-8 shadow-ambient-lg">
            <p className="text-4xl font-bold tabular-nums text-primary mb-2">{result.imported}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Transactions imported</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-ambient-lg">
            <p className="text-4xl font-bold tabular-nums text-secondary mb-2">{result.skipped}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Duplicates skipped</p>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div className="max-w-xl mb-6 border border-[#F0C040]/50 bg-[#FFFDF0] p-4 rounded-2xl">
            <p className="text-xs font-semibold text-[#7A6000] mb-1">{result.errors.length} warnings</p>
            <ul className="text-xs text-[#7A6000] space-y-0.5">
              {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="flex gap-4 max-w-xl">
          <button
            onClick={reset}
            className="flex-1 bg-white border border-secondary-container py-4 rounded-3xl text-sm font-semibold text-secondary hover:text-on-surface transition-colors shadow-ambient"
          >
            Import more
          </button>
          <Link
            href="/transactions"
            className="flex-1 bg-primary text-on-primary py-4 rounded-3xl text-sm font-bold text-center hover:bg-primary-dim transition-colors shadow-ambient"
          >
            View transactions →
          </Link>
        </div>
      </div>
    )
  }

  // ── Main import layout ─────────────────────────────────────────────────────
  return (
    <div>

      {/* Page header */}
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-on-surface">Import Transactions</h1>
          <p className="text-secondary mt-1 font-medium">Add your latest financial data from external sources.</p>
        </div>
        <Link
          href="/import/history"
          className="flex items-center gap-1 text-secondary font-medium hover:text-on-surface transition-colors text-sm"
        >
          View History <ArrowRight className="size-4" />
        </Link>
      </header>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-tertiary-container border border-tertiary/20 px-4 py-3 text-sm text-tertiary rounded-2xl mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-8 items-start">

        {/* ── Left column: upload + preview ── */}
        <div className="col-span-12 lg:col-span-7">
          <section className="bg-white rounded-3xl p-8 shadow-ambient-lg border border-white/40">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-on-surface tracking-tight">Upload CSV files</h3>
              <Upload className="size-5 text-secondary" strokeWidth={1.5} />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high',
              )}
            >
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary-container">
                <Upload className="size-7" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-on-surface font-semibold text-lg">Drag &amp; drop CSV files here</p>
                <p className="text-secondary text-sm mt-1">
                  or <span className="text-primary font-bold">click to browse</span> your folders
                </p>
              </div>
              <span className="text-xs text-on-surface-variant font-medium px-3 py-1 bg-white/70 rounded-full">
                CSV · QIF · OFX · QBO
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {/* Staged files */}
            {files.length > 0 && (
              <div className="mt-8 space-y-3">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest px-1">
                  Selected Files ({files.length})
                </p>
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${f.size}`}
                    className="bg-white border border-surface-container rounded-2xl p-4 flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary-container shrink-0">
                        <FileText className="size-5" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-on-surface font-semibold text-sm">{f.name}</p>
                        <p className="text-secondary text-xs">{(f.size / 1024).toFixed(0)} KB · Ready to import</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, j) => j !== i)); setPreview(null) }}
                      aria-label={`Remove ${f.name}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-tertiary-container hover:text-tertiary transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Preview toggle */}
                {!preview && (
                  <button
                    onClick={handlePreview}
                    disabled={previewing}
                    className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors disabled:opacity-40 px-1"
                  >
                    {previewing ? 'Loading preview…' : 'Preview transactions →'}
                  </button>
                )}
              </div>
            )}

            {/* Transaction preview table */}
            {preview && (
              <div className="mt-8 space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs text-secondary">
                    <span className="font-mono uppercase bg-surface-container-low px-2 py-0.5 rounded-md tracking-widest text-on-surface">
                      {preview.format}
                    </span>
                    <span>{preview.totalCount} transactions · {preview.currency}</span>
                  </div>
                  <button onClick={() => setPreview(null)} className="text-xs text-secondary hover:text-on-surface transition-colors">
                    Hide
                  </button>
                </div>

                {preview.parseErrors.length > 0 && (
                  <div className="border border-[#F0C040]/50 bg-[#FFFDF0] p-3 rounded-xl">
                    <p className="text-xs font-medium text-[#7A6000] mb-1">Parse warnings</p>
                    <ul className="text-xs text-[#7A6000] space-y-0.5">
                      {preview.parseErrors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                      {preview.parseErrors.length > 5 && <li>…and {preview.parseErrors.length - 5} more</li>}
                    </ul>
                  </div>
                )}

                <div className="bg-white rounded-2xl overflow-hidden border border-surface-container-low">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-low">
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-secondary uppercase tracking-widest">Date</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-secondary uppercase tracking-widest">Description</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold text-secondary uppercase tracking-widest">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((tx, i) => (
                        <tr key={i} className="border-t border-surface-container-low hover:bg-surface-container-low/40 transition-colors">
                          <td className="px-5 py-3 text-secondary whitespace-nowrap text-xs">{formatDate(tx.date)}</td>
                          <td className="px-5 py-3 text-on-surface truncate max-w-[200px] text-xs">{tx.description}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold text-xs">
                            <span className={tx.type === 'credit' ? 'text-primary' : 'text-on-surface'}>
                              {tx.type === 'credit' ? '+' : ''}{formatCurrency(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.totalCount > preview.preview.length && (
                    <p className="text-xs text-secondary px-5 py-2.5 border-t border-surface-container-low">
                      Showing {preview.preview.length} of {preview.totalCount} transactions
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Right column: account + how it works ── */}
        <div className="col-span-12 lg:col-span-5 space-y-8">

          {/* Account assignment card */}
          <section className="bg-white rounded-3xl p-8 shadow-ambient-lg border border-white/40">
            <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-4">
              Assign to account
            </label>

            {/* Existing accounts as a styled select, or new account form */}
            {!isNew && accounts.length > 0 ? (
              <div className="relative mb-6">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full appearance-none bg-surface-container-low border-none rounded-2xl py-4 px-6 text-on-surface font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/10 pr-10"
                >
                  <option value="">Select account…</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — {acc.institution}
                    </option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-secondary">
                  <svg className="size-4" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <button
                  onClick={() => { setIsNew(true); setAccountId('') }}
                  className="mt-2 text-xs text-secondary hover:text-on-surface transition-colors font-medium"
                >
                  + Add new account
                </button>
              </div>
            ) : accounts.length === 0 && accountsLoaded ? (
              /* No accounts yet — show creation form directly */
              <div className="space-y-3 mb-6">
                {[
                  { label: 'Account name', key: 'name',        placeholder: 'e.g. Westpac Everyday' },
                  { label: 'Institution',  key: 'institution', placeholder: 'e.g. Westpac'          },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-secondary mb-1.5">{label}</label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={newAccount[key as 'name' | 'institution']}
                      onChange={(e) => setNewAccount((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-surface-container-low border-0 rounded-2xl py-4 px-6 text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-secondary mb-1.5">Account type</label>
                  <select
                    value={newAccount.type}
                    onChange={(e) => setNewAccount((p) => ({ ...p, type: e.target.value as AccountType }))}
                    className="w-full appearance-none bg-surface-container-low border-0 rounded-2xl py-4 px-6 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/10"
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : isNew ? (
              <div className="space-y-3 mb-6">
                {[
                  { label: 'Account name', key: 'name',        placeholder: 'e.g. Westpac Everyday' },
                  { label: 'Institution',  key: 'institution', placeholder: 'e.g. Westpac'          },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-secondary mb-1.5">{label}</label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={newAccount[key as 'name' | 'institution']}
                      onChange={(e) => setNewAccount((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-surface-container-low border-0 rounded-2xl py-4 px-6 text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                  </div>
                ))}
                <select
                  value={newAccount.type}
                  onChange={(e) => setNewAccount((p) => ({ ...p, type: e.target.value as AccountType }))}
                  className="w-full appearance-none bg-surface-container-low border-0 rounded-2xl py-4 px-6 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/10"
                >
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                {accounts.length > 0 && (
                  <button
                    onClick={() => setIsNew(false)}
                    className="text-xs text-secondary hover:text-on-surface transition-colors font-medium"
                  >
                    ← Choose existing account
                  </button>
                )}
              </div>
            ) : (
              /* Not loaded yet — placeholder */
              <div className="mb-6 bg-surface-container-low rounded-2xl py-4 px-6 text-secondary text-sm">
                Select a file first to choose an account
              </div>
            )}

            {/* Import Now button */}
            <button
              onClick={handleImport}
              disabled={!accountValid || files.length === 0 || importing}
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary py-5 rounded-3xl font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
            >
              {importing
                ? 'Importing…'
                : preview
                ? `Import ${preview.totalCount} transactions`
                : 'Import Now'}
            </button>

            {files.length === 0 && !importing && (
              <p className="text-center text-xs text-secondary mt-3">Upload a file on the left to continue</p>
            )}
          </section>

          {/* How it works card */}
          <section className="bg-white rounded-3xl p-8 shadow-ambient-lg border border-white/40 relative overflow-hidden">
            {/* Decorative glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

            <h3 className="text-xl font-bold text-on-surface tracking-tight mb-8">How it works</h3>
            <div className="space-y-6">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-on-surface font-semibold leading-snug">{step.title}</p>
                    <p className="text-secondary text-sm mt-1">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 pt-6 border-t border-surface-container">
              <div className="flex items-start gap-3 p-4 bg-surface-container-low rounded-2xl">
                <CheckCircle className="size-4 text-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
                <p className="text-secondary text-sm leading-relaxed">
                  <span className="font-bold text-on-surface">Supports NAB format.</span>{' '}
                  Macquarie, CommBank, and Westpac formats coming soon.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

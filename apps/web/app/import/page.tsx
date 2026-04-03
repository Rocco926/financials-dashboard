'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'
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

type Step = 'upload' | 'configure' | 'preview' | 'done'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  transaction:  'Transaction / Everyday',
  savings:      'Savings',
  credit_card:  'Credit Card',
  loan:         'Loan',
}

const ACCEPTED_EXTENSIONS = '.csv,.qif,.ofx,.qbo'

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload',    label: 'Upload'    },
  { key: 'configure', label: 'Configure' },
  { key: 'preview',   label: 'Preview'   },
  { key: 'done',      label: 'Done'      },
]

export default function ImportPage() {
  const [step,       setStep]       = useState<Step>('upload')
  const [files,      setFiles]      = useState<File[]>([])
  const [dragging,   setDragging]   = useState(false)
  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [accountId,  setAccountId]  = useState<string>('')
  const [isNew,      setIsNew]      = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', institution: '', type: 'transaction' as AccountType })
  const [preview,    setPreview]    = useState<PreviewResult | null>(null)
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState<ImportResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  async function loadAccounts() {
    const res = await fetch('/api/accounts')
    if (res.ok) {
      const data = (await res.json()) as Account[]
      setAccounts(data)
      if (data.length === 0) setIsNew(true)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) setFiles(dropped)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length > 0) setFiles(selected)
  }

  async function handleContinueToConfig() {
    setError(null)
    await loadAccounts()
    setStep('configure')
  }

  async function handlePreview() {
    setError(null)
    if (files.length === 0) return

    const form = new FormData()
    form.append('file', files[0]!)

    const res = await fetch('/api/import/preview', { method: 'POST', body: form })
    if (!res.ok) {
      const { error: e } = (await res.json()) as { error: string }
      setError(e)
      return
    }
    const data = (await res.json()) as PreviewResult
    setPreview(data)
    setStep('preview')
  }

  async function handleImport() {
    setError(null)
    setImporting(true)

    const form = new FormData()
    for (const file of files) form.append('files', file)

    if (isNew) {
      form.append('accountName',  newAccount.name)
      form.append('institution',  newAccount.institution)
      form.append('accountType',  newAccount.type)
    } else {
      form.append('accountId', accountId)
    }

    try {
      const res  = await fetch('/api/import', { method: 'POST', body: form })
      const data = (await res.json()) as ImportResult | { error: string }

      if (!res.ok) {
        setError('error' in data ? data.error : 'Import failed')
        return
      }

      setResult(data as ImportResult)
      setStep('done')
    } catch {
      setError('Request failed. Check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep('upload')
    setFiles([])
    setPreview(null)
    setResult(null)
    setError(null)
    setAccountId('')
    setIsNew(false)
    setNewAccount({ name: '', institution: '', type: 'transaction' })
  }

  const accountValid = isNew
    ? newAccount.name.trim() && newAccount.institution.trim()
    : !!accountId

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="px-10 py-8 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium text-[#37352F] text-balance">Import transactions</h1>
        <Link
          href="/import/history"
          className="text-xs text-[#787774] hover:text-[#37352F] transition-colors"
        >
          View history →
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs font-medium transition-colors',
                  i < stepIndex  ? 'text-[#4CAF7D]'  :
                  i === stepIndex ? 'text-[#37352F]'  :
                                   'text-[#ACABA8]',
                )}
              >
                {i < stepIndex ? '✓' : String(i + 1)}
              </span>
              <span
                className={cn(
                  'text-xs transition-colors',
                  i === stepIndex ? 'text-[#37352F] font-medium' : 'text-[#ACABA8]',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="mx-3 text-[#E9E7E2] text-xs">—</span>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 border border-[#E5534B] bg-[#FFF5F5] px-4 py-3 text-sm text-[#E5534B]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed p-12 text-center cursor-pointer transition-colors',
              dragging
                ? 'border-[#37352F] bg-[#F7F6F3]'
                : 'border-[#E9E7E2] hover:border-[#ACABA8] hover:bg-[#F7F6F3]',
            )}
          >
            <Upload className="w-6 h-6 text-[#ACABA8] mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-[#37352F]">Drop files here or click to browse</p>
            <p className="text-xs text-[#ACABA8] mt-1">CSV · QIF · OFX · QBO</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-white border border-[#E9E7E2] px-4 py-2.5"
                >
                  <FileText className="w-4 h-4 text-[#ACABA8] shrink-0" strokeWidth={1.5} />
                  <span className="text-sm text-[#37352F] flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-[#ACABA8]">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, j) => j !== i)) }}
                    aria-label={`Remove ${f.name}`}
                    className="text-[#ACABA8] hover:text-[#37352F] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleContinueToConfig}
                className="w-full bg-[#37352F] text-white py-2.5 text-sm font-medium hover:bg-[#4A4643] transition-colors rounded-md mt-2"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Configure ── */}
      {step === 'configure' && (
        <div className="space-y-6">
          <div>
            <p className="section-label mb-3">Which account do these transactions belong to?</p>

            {accounts.length > 0 && (
              <div className="space-y-1 mb-3">
                {accounts.map((acc) => (
                  <label
                    key={acc.id}
                    className={cn(
                      'flex items-center gap-3 border px-4 py-3 cursor-pointer transition-colors',
                      accountId === acc.id && !isNew
                        ? 'border-[#37352F] bg-white'
                        : 'border-[#E9E7E2] bg-white hover:border-[#ACABA8]',
                    )}
                  >
                    <input
                      type="radio"
                      name="account"
                      value={acc.id}
                      checked={accountId === acc.id && !isNew}
                      onChange={() => { setAccountId(acc.id); setIsNew(false) }}
                      className="accent-[#37352F]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#37352F]">{acc.name}</p>
                      <p className="text-xs text-[#787774]">
                        {acc.institution} · {ACCOUNT_TYPE_LABELS[acc.type]}
                      </p>
                    </div>
                  </label>
                ))}
                <label
                  className={cn(
                    'flex items-center gap-3 border px-4 py-3 cursor-pointer transition-colors',
                    isNew ? 'border-[#37352F] bg-white' : 'border-[#E9E7E2] bg-white hover:border-[#ACABA8]',
                  )}
                >
                  <input
                    type="radio"
                    name="account"
                    checked={isNew}
                    onChange={() => { setIsNew(true); setAccountId('') }}
                    className="accent-[#37352F]"
                  />
                  <span className="text-sm font-medium text-[#37352F]">New account…</span>
                </label>
              </div>
            )}

            {isNew && (
              <div className="border border-[#E9E7E2] bg-white rounded-lg p-4 space-y-4">
                {[
                  { label: 'Account name', key: 'name',        placeholder: 'e.g. Westpac Everyday' },
                  { label: 'Institution',  key: 'institution', placeholder: 'e.g. Westpac'          },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block section-label mb-1.5">{label}</label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={newAccount[key as 'name' | 'institution']}
                      onChange={(e) => setNewAccount((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-[#E9E7E2] px-3 py-2 text-sm text-[#37352F] placeholder:text-[#ACABA8] focus:outline-none focus:border-[#37352F] transition-colors bg-white"
                    />
                  </div>
                ))}
                <div>
                  <label className="block section-label mb-1.5">Account type</label>
                  <select
                    value={newAccount.type}
                    onChange={(e) => setNewAccount((p) => ({ ...p, type: e.target.value as AccountType }))}
                    className="w-full border border-[#E9E7E2] px-3 py-2 text-sm text-[#37352F] focus:outline-none focus:border-[#37352F] transition-colors bg-white"
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="flex-1 border border-[#E9E7E2] py-2.5 text-sm text-[#787774] hover:border-[#37352F] hover:text-[#37352F] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={!accountValid}
              className="flex-1 bg-[#37352F] text-white py-2.5 text-sm font-medium hover:bg-[#4A4643] transition-colors rounded-md disabled:opacity-30"
            >
              Preview
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 'preview' && preview && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-sm text-[#787774]">
            <span className="bg-[#EDE9E3] px-2 py-0.5 text-xs font-mono uppercase tracking-wider text-[#37352F]">
              {preview.format}
            </span>
            <span>{preview.totalCount} transactions</span>
            <span>·</span>
            <span>{preview.currency}</span>
          </div>

          {preview.parseErrors.length > 0 && (
            <div className="border border-[#F0C040] bg-[#FFFDF0] p-3">
              <p className="text-xs font-medium text-[#7A6000] mb-1">Parse warnings</p>
              <ul className="text-xs text-[#7A6000] space-y-0.5">
                {preview.parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {preview.parseErrors.length > 5 && (
                  <li>…and {preview.parseErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="border border-[#E9E7E2] bg-white rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E9E7E2]">
                  <th className="px-4 py-2.5 text-left section-label font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left section-label font-medium">Description</th>
                  <th className="px-4 py-2.5 text-right section-label font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((tx, i) => (
                  <tr key={i} className="border-b border-[#EDE9E3] last:border-0">
                    <td className="px-4 py-2.5 text-[#787774] whitespace-nowrap text-xs">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-2.5 text-[#37352F] truncate max-w-[240px]">
                      {tx.description}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      <span className={tx.type === 'credit' ? 'text-[#4CAF7D]' : 'text-[#37352F]'}>
                        {tx.type === 'credit' ? '+' : ''}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.totalCount > 5 && (
              <p className="text-xs text-[#ACABA8] px-4 py-2 border-t border-[#EDE9E3]">
                Showing 5 of {preview.totalCount} transactions
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('configure')}
              className="flex-1 border border-[#E9E7E2] py-2.5 text-sm text-[#787774] hover:border-[#37352F] hover:text-[#37352F] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 bg-[#37352F] text-white py-2.5 text-sm font-medium hover:bg-[#4A4643] transition-colors rounded-md disabled:opacity-40"
            >
              {importing ? 'Importing…' : `Import ${preview.totalCount} transactions`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === 'done' && result && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-[#4CAF7D]" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-[#37352F]">Import complete</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#E9E7E2] bg-white rounded-lg p-5">
              <p className="text-2xl font-semibold tabular-nums text-[#4CAF7D]">{result.imported}</p>
              <p className="section-label mt-1">transactions imported</p>
            </div>
            <div className="border border-[#E9E7E2] bg-white rounded-lg p-5">
              <p className="text-2xl font-semibold tabular-nums text-[#ACABA8]">{result.skipped}</p>
              <p className="section-label mt-1">duplicates skipped</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="border border-[#F0C040] bg-[#FFFDF0] p-3">
              <p className="text-xs font-medium text-[#7A6000] mb-1">{result.errors.length} warnings</p>
              <ul className="text-xs text-[#7A6000] space-y-0.5">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border border-[#E9E7E2] py-2.5 text-sm text-[#787774] hover:border-[#37352F] hover:text-[#37352F] transition-colors"
            >
              Import more
            </button>
            <a
              href="/transactions"
              className="flex-1 bg-[#37352F] text-white py-2.5 text-sm font-medium hover:bg-[#4A4643] transition-colors rounded-md text-center"
            >
              View transactions →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

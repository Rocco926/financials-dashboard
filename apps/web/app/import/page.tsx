'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type AccountType = 'transaction' | 'savings' | 'credit_card' | 'loan'

interface Account {
  id: string
  name: string
  institution: string
  type: AccountType
}

interface PreviewTransaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  balance: number | null
}

interface PreviewResult {
  format: string
  totalCount: number
  accountName?: string
  currency: string
  parseErrors: string[]
  preview: PreviewTransaction[]
}

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

type Step = 'upload' | 'configure' | 'preview' | 'done'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  transaction: 'Transaction / Everyday',
  savings: 'Savings',
  credit_card: 'Credit Card',
  loan: 'Loan',
}

const ACCEPTED_EXTENSIONS = '.csv,.qif,.ofx,.qbo'

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [isNew, setIsNew] = useState(false)
  const [newAccount, setNewAccount] = useState({
    name: '',
    institution: '',
    type: 'transaction' as AccountType,
  })
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Load accounts when the user proceeds to configure
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
      form.append('accountName', newAccount.name)
      form.append('institution', newAccount.institution)
      form.append('accountType', newAccount.type)
    } else {
      form.append('accountId', accountId)
    }

    const res = await fetch('/api/import', { method: 'POST', body: form })
    const data = (await res.json()) as ImportResult | { error: string }

    if (!res.ok) {
      setError('error' in data ? data.error : 'Import failed')
      setImporting(false)
      return
    }

    setResult(data as ImportResult)
    setImporting(false)
    setStep('done')
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

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-8">Import transactions</h1>

      {error && (
        <div className="mb-6 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
              dragging
                ? 'border-gray-400 bg-gray-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Supports .csv, .qif, .ofx, .qbo
            </p>
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
                  className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3"
                >
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFiles(files.filter((_, j) => j !== i))
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                onClick={handleContinueToConfig}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors mt-2"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Configure account ──────────────────────────────────── */}
      {step === 'configure' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Which account do these transactions belong to?
            </h2>

            {accounts.length > 0 && (
              <div className="space-y-2 mb-4">
                {accounts.map((acc) => (
                  <label
                    key={acc.id}
                    className={cn(
                      'flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors',
                      accountId === acc.id && !isNew
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="account"
                      value={acc.id}
                      checked={accountId === acc.id && !isNew}
                      onChange={() => { setAccountId(acc.id); setIsNew(false) }}
                      className="accent-gray-900"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                      <p className="text-xs text-gray-500">
                        {acc.institution} · {ACCOUNT_TYPE_LABELS[acc.type]}
                      </p>
                    </div>
                  </label>
                ))}

                <label
                  className={cn(
                    'flex items-center gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors',
                    isNew ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <input
                    type="radio"
                    name="account"
                    checked={isNew}
                    onChange={() => { setIsNew(true); setAccountId('') }}
                    className="accent-gray-900"
                  />
                  <span className="text-sm font-medium text-gray-900">New account…</span>
                </label>
              </div>
            )}

            {isNew && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Account name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Westpac Everyday"
                    value={newAccount.name}
                    onChange={(e) =>
                      setNewAccount((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Institution
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Westpac"
                    value={newAccount.institution}
                    onChange={(e) =>
                      setNewAccount((p) => ({ ...p, institution: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Account type
                  </label>
                  <select
                    value={newAccount.type}
                    onChange={(e) =>
                      setNewAccount((p) => ({
                        ...p,
                        type: e.target.value as AccountType,
                      }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={!accountValid}
              className="flex-1 bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              Preview
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="bg-gray-100 px-2.5 py-1 rounded font-mono text-xs uppercase tracking-wide">
              {preview.format}
            </span>
            <span>{preview.totalCount} transactions found</span>
            <span>·</span>
            <span>{preview.currency}</span>
          </div>

          {preview.parseErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">Parse warnings</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {preview.parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {preview.parseErrors.length > 5 && (
                  <li>…and {preview.parseErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((tx, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 truncate max-w-[200px]">
                      {tx.description}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      <span className={tx.type === 'credit' ? 'text-green-600' : 'text-gray-900'}>
                        {tx.type === 'credit' ? '+' : ''}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.totalCount > 5 && (
              <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
                Showing 5 of {preview.totalCount} transactions
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('configure')}
              className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${preview.totalCount} transactions`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ───────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-6 text-center">
          <div className="pt-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Import complete</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-2xl font-semibold text-green-700">{result.imported}</p>
              <p className="text-sm text-green-600 mt-0.5">transactions imported</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-2xl font-semibold text-gray-600">{result.skipped}</p>
              <p className="text-sm text-gray-500 mt-0.5">duplicates skipped</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">
                {result.errors.length} warnings
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Import more files
            </button>
            <a
              href="/transactions"
              className="flex-1 bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors text-center"
            >
              View transactions →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

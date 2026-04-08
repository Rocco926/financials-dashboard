import { db, importLog, accounts } from '@/lib/db'
import { eq, desc, sum, max, count } from 'drizzle-orm'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, XCircle, Plus } from 'lucide-react'

async function getHistory() {
  const [rows, [stats]] = await Promise.all([
    db
      .select({
        id:                   importLog.id,
        filename:             importLog.filename,
        format:               importLog.format,
        transactionsImported: importLog.transactionsImported,
        transactionsSkipped:  importLog.transactionsSkipped,
        parseErrors:          importLog.parseErrors,
        importedAt:           importLog.importedAt,
        accountName:          accounts.name,
        institution:          accounts.institution,
      })
      .from(importLog)
      .leftJoin(accounts, eq(importLog.accountId, accounts.id))
      .orderBy(desc(importLog.importedAt))
      .limit(200),

    db
      .select({
        totalImports:      count(),
        totalTransactions: sum(importLog.transactionsImported),
        lastImportAt:      max(importLog.importedAt),
      })
      .from(importLog),
  ])

  return { rows, stats }
}

function formatDate(ts: Date | string) {
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(ts: Date | string) {
  return new Date(ts)
    .toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toLowerCase()
}

function timeAgo(ts: Date | string): string {
  const diff  = Date.now() - new Date(ts).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(mins  / 60)
  const days  = Math.floor(hours / 24)
  if (days  > 0) return `${days} day${days   !== 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (mins  > 0) return `${mins} min${mins   !== 1 ? 's' : ''} ago`
  return 'just now'
}

export default async function ImportHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const { rows, stats } = await getHistory()

  const totalImports      = Number(stats?.totalImports ?? 0)
  const totalTransactions = Number(stats?.totalTransactions ?? 0)
  const lastImportAt      = stats?.lastImportAt

  return (
    <div>

      {/* Header */}
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-6">
          <Link
            href="/import"
            className="flex items-center gap-1.5 text-sm text-secondary hover:text-on-surface transition-colors font-medium"
          >
            <ArrowLeft className="size-3.5" />
            Import
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Import History</h1>
        </div>
        <Link
          href="/import"
          className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-3xl font-semibold text-sm hover:bg-primary-dim transition-all active:scale-95 shadow-ambient"
        >
          <Plus className="size-4" />
          New Import
        </Link>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-3xl p-6 shadow-ambient-lg flex flex-col gap-1">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total imports</span>
          <span className="text-4xl font-bold tracking-tighter text-on-surface tabular-nums">
            {totalImports.toLocaleString()}
          </span>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-ambient-lg flex flex-col gap-1">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Total transactions added</span>
          <span className="text-4xl font-bold tracking-tighter text-on-surface tabular-nums">
            {totalTransactions.toLocaleString()}
          </span>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-ambient-lg flex flex-col gap-1">
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Last import</span>
          <span className="text-4xl font-bold tracking-tighter text-on-surface">
            {lastImportAt ? timeAgo(lastImportAt) : '—'}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-ambient-lg px-8 py-16 text-center">
          <p className="text-sm font-semibold text-on-surface mb-1">No imports yet</p>
          <p className="text-sm text-secondary mb-4">Upload a CSV to get started.</p>
          <Link
            href="/import"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim transition-colors"
          >
            Import your first file →
          </Link>
        </div>
      ) : (
        <section className="bg-white rounded-3xl shadow-ambient-lg overflow-hidden">

          {/* Table header */}
          <div className="grid grid-cols-12 px-8 py-5 bg-surface-container-low text-[11px] font-bold uppercase tracking-widest text-secondary">
            <div className="col-span-2">Date &amp; Time</div>
            <div className="col-span-3">File Name</div>
            <div className="col-span-2">Account</div>
            <div className="col-span-2">Added</div>
            <div className="col-span-1">Skipped</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {/* Rows */}
          <div className="flex flex-col px-4 py-2">
            {rows.map((row) => {
              const hasErrors = row.parseErrors && row.parseErrors.length > 0

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-12 items-center px-4 py-4 rounded-2xl hover:bg-surface transition-all duration-200 my-1"
                >
                  {/* Date & Time — two lines */}
                  <div className="col-span-2">
                    <p className="text-sm text-on-surface font-medium">{formatDate(row.importedAt!)}</p>
                    <p className="text-xs text-secondary">{formatTime(row.importedAt!)}</p>
                  </div>

                  {/* File name + format badge */}
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[9px] uppercase bg-surface-container-low px-1.5 py-0.5 rounded-md tracking-widest text-on-surface shrink-0">
                      {row.format}
                    </span>
                    <span className="text-sm text-secondary font-medium truncate">{row.filename}</span>
                  </div>

                  {/* Account */}
                  <div className="col-span-2">
                    {row.accountName ? (
                      <>
                        <p className="text-sm text-secondary">{row.accountName}</p>
                        <p className="text-xs text-secondary/60">{row.institution}</p>
                      </>
                    ) : (
                      <span className="text-sm text-secondary">—</span>
                    )}
                  </div>

                  {/* Added */}
                  <div className="col-span-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-container/20 text-primary">
                      {row.transactionsImported} added
                    </span>
                  </div>

                  {/* Skipped */}
                  <div className="col-span-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-container text-secondary text-[10px] font-semibold">
                      {row.transactionsSkipped ?? 0}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2 flex justify-end">
                    {!hasErrors ? (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-container">
                        <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-tertiary">
                        <XCircle className="w-4 h-4" strokeWidth={1.5} />
                        {row.parseErrors!.length} warning{row.parseErrors!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-between px-8 py-5 border-t border-surface-container-low">
            <p className="text-xs text-secondary">
              Showing {rows.length} import{rows.length !== 1 ? 's' : ''}
            </p>
          </footer>
        </section>
      )}
    </div>
  )
}

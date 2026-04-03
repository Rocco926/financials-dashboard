import { db, importLog, accounts } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

async function getHistory() {
  const rows = await db
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
    .limit(200)

  return rows
}

function formatDateTime(ts: Date | string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-AU', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute: '2-digit',
  })
}

export default async function ImportHistoryPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const rows = await getHistory()

  return (
    <div className="px-10 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/import"
          className="flex items-center gap-1.5 text-sm text-[#787774] hover:text-[#37352F] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to import
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-medium text-[#37352F]">Import history</h1>
        <p className="text-sm text-[#787774] mt-0.5">
          Every file you&apos;ve imported, most recent first.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-[#E9E7E2] bg-white rounded-lg px-6 py-16 text-center">
          <p className="text-sm text-[#787774]">No imports yet.</p>
          <Link href="/import" className="mt-2 inline-block text-sm text-[#37352F] underline hover:no-underline">
            Import your first file
          </Link>
        </div>
      ) : (
        <div className="border border-[#E9E7E2] bg-white rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9E7E2]">
                <th className="px-4 py-2.5 text-left section-label font-medium">Date</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">File</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">Account</th>
                <th className="px-4 py-2.5 text-right section-label font-medium">Imported</th>
                <th className="px-4 py-2.5 text-right section-label font-medium">Skipped</th>
                <th className="px-4 py-2.5 text-left section-label font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#EDE9E3] last:border-0 hover:bg-[#F7F6F3] transition-colors"
                >
                  <td className="px-4 py-2.5 text-[#787774] text-xs whitespace-nowrap">
                    {formatDateTime(row.importedAt!)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide bg-[#EDE9E3] text-[#37352F] px-1.5 py-0.5">
                        {row.format}
                      </span>
                      <span className="text-[#37352F] truncate max-w-[200px]">{row.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.accountName ? (
                      <div>
                        <p className="text-[#37352F]">{row.accountName}</p>
                        <p className="text-xs text-[#ACABA8]">{row.institution}</p>
                      </div>
                    ) : (
                      <span className="text-[#ACABA8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#4CAF7D] font-medium">
                    {row.transactionsImported}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#ACABA8]">
                    {row.transactionsSkipped > 0 ? row.transactionsSkipped : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.parseErrors && row.parseErrors.length > 0 ? (
                      <span className="text-xs text-[#7A6000] bg-[#FFFDF0] border border-[#F0C040] px-2 py-0.5">
                        {row.parseErrors.length} warning{row.parseErrors.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[#ACABA8] text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

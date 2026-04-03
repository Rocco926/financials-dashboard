/**
 * GET /api/import-log
 *
 * Returns the import history — one row per file import, most recent first.
 * Joins accounts so the response includes the account name and institution
 * rather than just the UUID.
 *
 * Used by the /import/history page.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, importLog, accounts } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  return NextResponse.json({ data: rows })
}

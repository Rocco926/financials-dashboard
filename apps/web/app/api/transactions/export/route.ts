import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, transactions, accounts } from '@/lib/db'
import { and, eq, gte, lte, ilike, isNull, or, desc } from 'drizzle-orm'

// Characters that cause Excel/LibreOffice to interpret a cell as a formula
const FORMULA_PREFIX = /^[=+\-@|]/

function escapeCell(value: string | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  // Prefix formula-injection triggers with a tab so spreadsheets treat the cell as text
  if (FORMULA_PREFIX.test(s)) s = `\t${s}`
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.startsWith('\t')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowToCsv(cells: (string | null | undefined)[]): string {
  return cells.map(escapeCell).join(',')
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const accountId = searchParams.get('accountId')
  const from      = searchParams.get('from')
  const to        = searchParams.get('to')
  const category  = searchParams.get('category')
  const type      = searchParams.get('type')
  const search    = searchParams.get('search')

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const conditions = []
  if (accountId && UUID_REGEX.test(accountId)) conditions.push(eq(transactions.accountId, accountId))
  if (from && DATE_REGEX.test(from))           conditions.push(gte(transactions.date, from))
  if (to   && DATE_REGEX.test(to))             conditions.push(lte(transactions.date, to))
  if (category === '__uncategorised') {
    conditions.push(isNull(transactions.category))
  } else if (category) {
    conditions.push(eq(transactions.category, category))
  }
  if (type === 'credit' || type === 'debit') {
    conditions.push(eq(transactions.type, type))
  }
  if (search) {
    const term = `%${search}%`
    conditions.push(or(
      ilike(transactions.description, term),
      ilike(transactions.merchant,   term),
      ilike(transactions.notes,      term),
      ilike(transactions.category,   term),
    )!)
  }

  const rows = await db
    .select({
      date:        transactions.date,
      merchant:    transactions.merchant,
      description: transactions.description,
      category:    transactions.category,
      amount:      transactions.amount,
      balance:     transactions.balance,
      type:        transactions.type,
      notes:       transactions.notes,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .limit(50_000)

  const header = rowToCsv(['Date', 'Merchant', 'Description', 'Category', 'Amount', 'Balance', 'Type', 'Notes', 'Account'])
  const body = rows.map((r) =>
    rowToCsv([
      r.date,
      r.merchant,
      r.description,
      r.category,
      r.amount != null ? String(r.amount) : null,
      r.balance != null ? String(r.balance) : null,
      r.type,
      r.notes,
      r.accountName,
    ]),
  )

  const csv = [header, ...body].join('\n')
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

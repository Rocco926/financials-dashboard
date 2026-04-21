import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, transactions, categories } from '@/lib/db'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')

  if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 })

  const conditions = [
    sql`${transactions.amount}::numeric < 0`,
    eq(transactions.category, category),
  ]
  if (from && DATE_REGEX.test(from)) conditions.push(gte(transactions.date, from))
  if (to   && DATE_REGEX.test(to))   conditions.push(lte(transactions.date, to))

  // Exclude transfers
  const transferSubquery = sql`(SELECT name FROM ${categories} WHERE is_transfer = true)`

  const rows = await db
    .select({
      merchant: sql<string>`COALESCE(${transactions.merchant}, ${transactions.description})`,
      count:    sql<string>`COUNT(*)`,
      total:    sql<string>`ABS(SUM(${transactions.amount}::numeric))`,
    })
    .from(transactions)
    .where(and(
      ...conditions,
      sql`(${transactions.category} IS NULL OR ${transactions.category} NOT IN ${transferSubquery})`,
    ))
    .groupBy(sql`COALESCE(${transactions.merchant}, ${transactions.description})`)
    .orderBy(sql`ABS(SUM(${transactions.amount}::numeric)) DESC`)
    .limit(20)

  return NextResponse.json({
    merchants: rows.map((r) => ({
      merchant: r.merchant,
      count:    parseInt(r.count, 10),
      total:    parseFloat(r.total),
    })),
  })
}

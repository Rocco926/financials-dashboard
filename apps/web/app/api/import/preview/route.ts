import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { parse } from '@finance/parsers'

/**
 * POST /api/import/preview
 * Parses a file and returns the first 5 transactions — no DB writes.
 * Used by the import UI to show a preview before confirming.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  try {
    const content = await file.text()
    const result = parse(content, file.name)

    return NextResponse.json({
      format: result.format,
      totalCount: result.transactions.length,
      accountName: result.accountName,
      currency: result.currency,
      parseErrors: result.parseErrors,
      preview: result.transactions.slice(0, 5).map((tx) => ({
        date: tx.date.toISOString().split('T')[0],
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        balance: tx.balance ?? null,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Parse failed' },
      { status: 422 },
    )
  }
}

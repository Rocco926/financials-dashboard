/**
 * PATCH  /api/budgets/[id] — update the amount of an existing budget
 * DELETE /api/budgets/[id] — remove a budget entirely
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, budgets } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const patchSchema = z.object({
  amount: z.number().positive(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const [row] = await db
    .update(budgets)
    .set({ amount: String(parsed.data.amount), updatedAt: new Date() })
    .where(eq(budgets.id, params.id))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: row })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db
    .delete(budgets)
    .where(eq(budgets.id, params.id))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: row })
}

/**
 * PATCH /api/categories/[id]
 *
 * Partial update for a category. Currently only exposes monthlyBudget
 * since that's the only field the budgets page needs to change.
 *
 * Setting monthlyBudget to null removes the budget for that category.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, categories } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const patchSchema = z.object({
  monthlyBudget: z.number().positive().nullable(),
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
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { monthlyBudget } = parsed.data

  const [row] = await db
    .update(categories)
    .set({
      monthlyBudget: monthlyBudget != null ? String(monthlyBudget) : null,
    })
    .where(eq(categories.id, params.id))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: row })
}

/**
 * PATCH  /api/holdings/[id]  — update a holding (partial update)
 * DELETE /api/holdings/[id]  — delete a holding
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, holdings } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const patchSchema = z.object({
  name:            z.string().min(1).max(120).optional(),
  institution:     z.string().min(1).max(120).optional(),
  type:            z.enum(['cash', 'etf', 'stock', 'other']).optional(),
  ticker:          z.string().max(20).nullable().optional(),
  units:           z.number().positive().nullable().optional(),
  avgCostPerUnit:  z.number().positive().nullable().optional(),
  manualBalance:   z.number().nullable().optional(),
  currency:        z.string().length(3).optional(),
  notes:           z.string().max(500).nullable().optional(),
  sortOrder:       z.number().int().optional(),
  linkedAccountId: z.string().uuid().nullable().optional(),
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

  const update = parsed.data
  const dbUpdate: Record<string, unknown> = {}

  if (update.name !== undefined)           dbUpdate.name = update.name
  if (update.institution !== undefined)    dbUpdate.institution = update.institution
  if (update.type !== undefined)           dbUpdate.type = update.type
  if (update.ticker !== undefined)         dbUpdate.ticker = update.ticker
  if (update.currency !== undefined)       dbUpdate.currency = update.currency
  if (update.notes !== undefined)          dbUpdate.notes = update.notes
  if (update.sortOrder !== undefined)      dbUpdate.sortOrder = update.sortOrder
  if (update.units !== undefined)           dbUpdate.units = update.units != null ? String(update.units) : null
  if (update.avgCostPerUnit !== undefined)  dbUpdate.avgCostPerUnit = update.avgCostPerUnit != null ? String(update.avgCostPerUnit) : null
  if (update.manualBalance !== undefined)   dbUpdate.manualBalance = update.manualBalance != null ? String(update.manualBalance) : null
  if (update.linkedAccountId !== undefined) dbUpdate.linkedAccountId = update.linkedAccountId ?? null

  dbUpdate.updatedAt = new Date()

  const [row] = await db
    .update(holdings)
    .set(dbUpdate)
    .where(eq(holdings.id, params.id))
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
    .delete(holdings)
    .where(eq(holdings.id, params.id))
    .returning({ id: holdings.id })

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}

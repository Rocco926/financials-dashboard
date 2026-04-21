/**
 * PATCH /api/transactions/[id]
 *
 * Updates user-editable fields on a single transaction.
 * Called by the inline category editor on the transactions page.
 *
 * EDITABLE FIELDS
 * ────────────────
 * Only these three fields can be changed after import:
 *
 *   category  string | null  — The spending category (FK to categories.name).
 *                              null means "uncategorised".
 *   merchant  string | null  — Cleaned merchant name (defaults to description at import).
 *   notes     string | null  — Free-text note.
 *
 * All other transaction fields (date, amount, description, externalId, etc.)
 * are immutable after import — they're the raw data from the bank.
 *
 * REQUEST FORMAT
 * ──────────────
 * Content-Type: application/json
 * Body: { category?: string | null, merchant?: string | null, notes?: string | null }
 * At least one field must be present.
 *
 * RESPONSE FORMAT (200 OK)
 * ─────────────────────────
 * { success: true }
 *
 * HOW THE INLINE EDITOR USES THIS
 * ─────────────────────────────────
 * The CategoryEditor component (app/transactions/category-editor.tsx) calls this
 * via fetch on every <select> change. It uses useTransition + router.refresh()
 * to update the displayed value without a full page reload.
 *
 * PARTIAL UPDATES
 * ────────────────
 * We check which fields are present in the parsed body (using 'in' operator).
 * A field being present with value null means "clear this field".
 * A field being absent from the body means "don't touch this field".
 * This allows updating just category without accidentally clearing merchant/notes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transactions, categoryRules } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Validates the PATCH body.
 * All three fields are optional — the route requires at least one to be present.
 * `nullable()` allows explicit null (to clear a field).
 */
const patchSchema = z.object({
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  notes:    z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await request.json()
  const parsed = patchSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  // Build the updates object containing ONLY the fields that were sent.
  // Using 'in' operator distinguishes between "field not sent" (skip) and
  // "field sent as null" (clear). This prevents unintended field clears.
  const updates: Record<string, string | null> = {}
  if ('category' in parsed.data) updates['category'] = parsed.data.category ?? null
  if ('merchant' in parsed.data) updates['merchant'] = parsed.data.merchant ?? null
  if ('notes'    in parsed.data) updates['notes']    = parsed.data.notes    ?? null

  // When the user changes the category, stamp it as user-assigned so it exits
  // the review queue and the source is correctly attributed.
  if ('category' in parsed.data) {
    updates['categorySource'] = parsed.data.category ? 'user' : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // UPDATE ... RETURNING is used to detect 404 (no matching id).
  // If the transaction doesn't exist, .returning() returns an empty array.
  const [updated] = await db
    .update(transactions)
    .set(updates)
    .where(eq(transactions.id, params.id))
    .returning({ id: transactions.id, description: transactions.description })

  if (!updated) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // If the user changed the category, persist a category_rules entry so future
  // imports of the same merchant are automatically categorised the same way.
  // ON CONFLICT UPDATE ensures a later correction overwrites an earlier one.
  if ('category' in parsed.data && parsed.data.category) {
    const pattern = updated.description.toUpperCase().trim()
    await db
      .insert(categoryRules)
      .values({ merchantPattern: pattern, category: parsed.data.category, source: 'manual' })
      .onConflictDoUpdate({
        target:  categoryRules.merchantPattern,
        set:     { category: parsed.data.category, source: 'manual', updatedAt: new Date() },
      })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [deleted] = await db
    .delete(transactions)
    .where(eq(transactions.id, params.id))
    .returning({ id: transactions.id })

  if (!deleted) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}

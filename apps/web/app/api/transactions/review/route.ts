/**
 * POST /api/transactions/review
 *
 * Confirms or corrects an auto-categorised transaction group.
 * Called by the review queue on /transactions/categorise.
 *
 * DIFFERENCE FROM bulk-categorise
 * ─────────────────────────────────
 * bulk-categorise only updates rows where category IS NULL.
 * This endpoint targets rows that are ALREADY categorised by an automated
 * source (claude/keyword/bank) but not yet user-confirmed.
 *
 * BODY
 * ────
 * { pattern: string, confirmedCategory: string }
 *   pattern           — normalised description (upper-trimmed)
 *   confirmedCategory — the category to confirm or set (may differ from
 *                       suggested if the user is correcting it)
 *
 * WHAT IT DOES
 * ─────────────
 * 1. Updates all transactions where:
 *      upper(trim(description)) = pattern
 *      AND categorySource IN ('claude', 'keyword', 'bank')
 *    Sets category = confirmedCategory, categorySource = 'user'
 *
 * 2. Upserts a category_rules row so future imports auto-classify without AI.
 *
 * RESPONSE
 * ────────
 * { updated: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, transactions, categoryRules } from '@/lib/db'
import { and, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  pattern:           z.string().min(1),
  confirmedCategory: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: unknown = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  const { pattern, confirmedCategory } = parsed.data

  const [updated] = await Promise.all([
    // Update auto-categorised rows only (don't touch user-confirmed ones)
    db
      .update(transactions)
      .set({ category: confirmedCategory, categorySource: 'user' })
      .where(
        and(
          sql`upper(trim(${transactions.description})) = ${pattern}`,
          inArray(transactions.categorySource, ['claude', 'keyword', 'bank']),
        ),
      )
      .returning({ id: transactions.id }),

    // Write rule so next import auto-categorises without Claude
    db
      .insert(categoryRules)
      .values({ merchantPattern: pattern, category: confirmedCategory, source: 'manual' })
      .onConflictDoUpdate({
        target:  categoryRules.merchantPattern,
        set:     { category: confirmedCategory, source: 'manual', updatedAt: new Date() },
      }),
  ])

  return NextResponse.json({ updated: updated.length })
}

/**
 * POST /api/transactions/auto-categorise
 *
 * Retroactively categorises all uncategorised transactions using the same
 * pipeline as import: Claude Haiku classifies any descriptions that the
 * static keyword map and bank categories don't cover.
 *
 * WHAT IT DOES
 * ─────────────
 * 1. Fetches all distinct normalised descriptions where category IS NULL.
 * 2. Runs classifyWithClaude() on those descriptions.
 * 3. Bulk-updates matching transactions with category + categorySource.
 *
 * Note: this route does NOT write to category_rules — that's the user's job
 * via the review queue. Rules are written when the user accepts/corrects a
 * Claude-assigned category on the Categorise page.
 *
 * RESPONSE
 * ────────
 * { categorised: number, skipped: number }
 *   categorised — transactions that were assigned a category
 *   skipped     — transactions Claude couldn't classify (remain null)
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, transactions, categories } from '@/lib/db'
import { isNull, sql } from 'drizzle-orm'
import { classifyWithClaude } from '@/lib/categorise'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all known category names for the closed-list prompt
  const categoryRows = await db.select({ name: categories.name }).from(categories)
  const knownCategories = categoryRows.map(r => r.name)

  if (knownCategories.length === 0) {
    return NextResponse.json({ categorised: 0, skipped: 0 })
  }

  // Get all unique normalised descriptions that are currently uncategorised
  const rows = await db
    .selectDistinct({
      normDesc: sql<string>`upper(trim(${transactions.description}))`,
    })
    .from(transactions)
    .where(isNull(transactions.category))

  const uniqueDescs = rows.map(r => r.normDesc).filter(Boolean)

  if (uniqueDescs.length === 0) {
    return NextResponse.json({ categorised: 0, skipped: 0 })
  }

  // Classify with Claude
  const claudeMap = await classifyWithClaude(uniqueDescs, knownCategories)

  let categorised = 0
  let skipped = 0

  // Apply results: one UPDATE per unique description that got a category
  for (const [normDesc, category] of claudeMap.entries()) {
    if (!category) {
      skipped++
      continue
    }

    await db
      .update(transactions)
      .set({ category, categorySource: 'claude' })
      .where(
        sql`upper(trim(${transactions.description})) = ${normDesc} AND ${transactions.category} IS NULL`,
      )

    categorised++
  }

  return NextResponse.json({ categorised, skipped })
}

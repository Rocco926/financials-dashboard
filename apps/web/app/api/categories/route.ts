/**
 * GET /api/categories
 *
 * Returns all spending categories, ordered for display in the UI.
 * Used by the transactions page's inline category editor (CategoryEditor component)
 * to populate the <select> dropdown.
 *
 * ORDERING
 * ─────────
 * Income categories (isIncome=true) appear last, after all spending categories.
 * Within each group, categories are sorted alphabetically by name.
 *
 * WHY isIncome LAST?
 * ───────────────────
 * In the category dropdown on the transactions page, spending categories are
 * more commonly needed than income categories. Sorting income last puts the
 * most-used categories at the top of the list.
 *
 * RESPONSE FORMAT
 * ────────────────
 * Array of:
 * {
 *   id:            string (UUID)
 *   name:          string      — e.g. "Groceries"
 *   colour:        string      — hex colour e.g. "#f59e0b"
 *   isIncome:      boolean
 *   createdAt:     string      — ISO timestamp
 * }
 *
 * NOTE: The table is seeded with 16 Australian default categories via `pnpm db:seed`.
 * The user can add custom categories directly in the database (no UI for this yet).
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { categories } from '@/lib/db'
import { asc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select()
    .from(categories)
    // Sort: spending categories (isIncome=false → 0) before income (isIncome=true → 1)
    // Then alphabetically within each group
    .orderBy(asc(categories.isIncome), asc(categories.name))

  return NextResponse.json(rows)
}

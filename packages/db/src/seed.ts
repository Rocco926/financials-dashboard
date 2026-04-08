/**
 * Seeds the categories table with Australian defaults.
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 *
 * Usage: pnpm db:seed  (from monorepo root)
 */
import { db } from './client'
import { categories } from './schema'
import { sql } from 'drizzle-orm'

const DEFAULT_CATEGORIES: Array<{
  name: string
  colour: string
  isIncome: boolean
  isTransfer?: boolean
}> = [
  { name: 'Income',                colour: '#22c55e', isIncome: true  },
  { name: 'Interest Income',       colour: '#4ade80', isIncome: true  },
  { name: 'Transfers, Savings & Investments', colour: '#94a3b8', isIncome: false, isTransfer: true },
  { name: 'Groceries',             colour: '#f59e0b', isIncome: false },
  { name: 'Dining & Takeaway',     colour: '#f97316', isIncome: false },
  { name: 'Coffee & Cafes',        colour: '#92400e', isIncome: false },
  { name: 'Transport',             colour: '#3b82f6', isIncome: false },
  { name: 'Fuel',                  colour: '#6366f1', isIncome: false },
  { name: 'Utilities',             colour: '#8b5cf6', isIncome: false },
  { name: 'Rent/Mortgage',         colour: '#ec4899', isIncome: false },
  { name: 'Insurance',             colour: '#14b8a6', isIncome: false },
  { name: 'Health & Fitness',      colour: '#10b981', isIncome: false },
  { name: 'Medical',               colour: '#ef4444', isIncome: false },
  { name: 'Personal Care',         colour: '#f472b6', isIncome: false },
  { name: 'Entertainment',         colour: '#a855f7', isIncome: false },
  { name: 'Pets',                  colour: '#a78bfa', isIncome: false },
  { name: 'Education',             colour: '#60a5fa', isIncome: false },
  { name: 'Gifts & Donations',     colour: '#fb923c', isIncome: false },
  { name: 'Home & Garden',         colour: '#4ade80', isIncome: false },
  { name: 'Shopping',              colour: '#f43f5e', isIncome: false },
  { name: 'Subscriptions',         colour: '#0ea5e9', isIncome: false },
  { name: 'Travel',                colour: '#84cc16', isIncome: false },
  { name: 'ATM/Cash',              colour: '#78716c', isIncome: false },
  { name: 'Fees & Charges',        colour: '#dc2626', isIncome: false },
  { name: 'Other',                 colour: '#6b7280', isIncome: false },
]

// One-time renames: if an old name exists, update it to the new name.
// ON UPDATE CASCADE propagates the rename to all transactions.category FKs.
const RENAMES: Array<{ from: string; to: string }> = [
  { from: 'Transfers & Savings',  to: 'Transfers, Savings & Investments' },
  { from: 'Health & Medical',     to: 'Medical' },
]

async function seed() {
  console.log('Seeding categories...')

  // Apply renames. Check whether the target already exists first to avoid
  // unique-key conflicts (possible if seed was partially run before).
  for (const { from, to } of RENAMES) {
    const existing = await db.execute(
      sql`SELECT 1 FROM categories WHERE name = ${to} LIMIT 1`,
    )
    if ((existing as unknown[]).length > 0) {
      // Target already exists — just clean up the stale old row.
      // ON DELETE SET NULL cascades to transactions.category automatically.
      await db.execute(sql`DELETE FROM categories WHERE name = ${from}`)
    } else {
      // Safe to rename — ON UPDATE CASCADE propagates to transactions.
      await db.execute(sql`UPDATE categories SET name = ${to} WHERE name = ${from}`)
    }
  }

  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoNothing({ target: categories.name })
  }

  console.log(`Done — ${DEFAULT_CATEGORIES.length} categories seeded.`)
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

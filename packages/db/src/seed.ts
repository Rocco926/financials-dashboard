/**
 * Seeds the categories table with Australian defaults.
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 *
 * Usage: pnpm db:seed  (from monorepo root)
 */
import { db } from './client.js'
import { categories } from './schema.js'
import { sql } from 'drizzle-orm'

const DEFAULT_CATEGORIES = [
  { name: 'Income',            colour: '#22c55e', isIncome: true  },
  { name: 'Groceries',         colour: '#f59e0b', isIncome: false },
  { name: 'Dining & Takeaway', colour: '#f97316', isIncome: false },
  { name: 'Transport',         colour: '#3b82f6', isIncome: false },
  { name: 'Fuel',              colour: '#6366f1', isIncome: false },
  { name: 'Utilities',         colour: '#8b5cf6', isIncome: false },
  { name: 'Rent/Mortgage',     colour: '#ec4899', isIncome: false },
  { name: 'Insurance',         colour: '#14b8a6', isIncome: false },
  { name: 'Health & Medical',  colour: '#ef4444', isIncome: false },
  { name: 'Entertainment',     colour: '#a855f7', isIncome: false },
  { name: 'Shopping',          colour: '#f43f5e', isIncome: false },
  { name: 'Subscriptions',     colour: '#0ea5e9', isIncome: false },
  { name: 'Travel',            colour: '#84cc16', isIncome: false },
  { name: 'ATM/Cash',          colour: '#78716c', isIncome: false },
  { name: 'Fees & Charges',    colour: '#dc2626', isIncome: false },
  { name: 'Other',             colour: '#6b7280', isIncome: false },
] as const

async function seed() {
  console.log('Seeding categories...')

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

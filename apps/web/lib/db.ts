/**
 * Database re-exports for the web app.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * All database imports in API routes and Server Components use:
 *   import { db, transactions, accounts, ... } from '@/lib/db'
 *
 * Without this file, they'd need two separate imports:
 *   import { db } from '@finance/db'
 *   import { transactions, accounts, ... } from '@finance/db/schema'
 *
 * This re-export consolidates them so all DB-related imports come from
 * one place. If we ever change the underlying DB package structure,
 * we only update this one file.
 *
 * WHAT'S AVAILABLE
 * ─────────────────
 * From '@finance/db':
 *   db          — The Drizzle ORM instance (use for all queries)
 *
 * From '@finance/db/schema' (via * export):
 *   accounts    — accounts table reference
 *   categories  — categories table reference
 *   transactions — transactions table reference
 *   importLog   — import_log table reference
 *   accountTypeEnum, transactionTypeEnum — Postgres enum definitions
 *   Account, Category, Transaction, ... — TypeScript types inferred from schema
 */
export { db } from '@finance/db'
export * from '@finance/db/schema'

/**
 * Drizzle database client for Supabase.
 *
 * ARCHITECTURE
 * ────────────
 * We use Drizzle ORM with the `postgres` (postgres.js) driver talking directly
 * to Supabase's PostgreSQL database. We do NOT use the Supabase JS client
 * (@supabase/supabase-js) because we don't need Supabase's realtime,
 * storage, or auth features — just raw Postgres.
 *
 * TWO CONNECTION STRINGS
 * ──────────────────────
 * Supabase provides two connection URLs for different purposes:
 *
 *   DATABASE_URL (pooled, via PgBouncer)
 *   ─────────────────────────────────────
 *   Format: postgresql://postgres.[ref]:[pass]@aws-*.pooler.supabase.com:6543/postgres
 *   Used by: all runtime queries (API routes, Server Components)
 *   Why: PgBouncer maintains a connection pool, so each serverless invocation
 *        doesn't need to establish a new Postgres connection from scratch.
 *
 *   DIRECT_URL (direct, bypasses PgBouncer)
 *   ─────────────────────────────────────────
 *   Format: postgresql://postgres.[ref]:[pass]@aws-*.pooler.supabase.com:5432/postgres
 *   Used by: drizzle-kit push/migrate (schema migrations only)
 *   Why: drizzle-kit uses PostgreSQL's extended query protocol for migrations,
 *        which PgBouncer in transaction mode does not support. Direct connections
 *        don't have this restriction.
 *   See: drizzle.config.ts which references DIRECT_URL.
 *
 * WHY `prepare: false`?
 * ──────────────────────
 * Supabase's PgBouncer runs in "transaction mode" by default. In this mode it
 * multiplexes many clients over a small pool of real Postgres connections, but
 * it cannot maintain state between transactions — which is required for
 * PostgreSQL prepared statements. Setting `prepare: false` tells postgres.js to
 * use simple query mode (no server-side preparation), which is fully compatible.
 *
 * If you ever switch to a direct connection (not via PgBouncer), you can remove
 * `prepare: false` for better performance, but it's harmless to leave it in.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env['DATABASE_URL']) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
      'Copy .env.example to .env and fill in your Supabase pooled connection string.',
  )
}

/**
 * The postgres.js connection client.
 *
 * `prepare: false` is required for Supabase's PgBouncer in transaction mode.
 * See the module-level comment above for the full explanation.
 */
const client = postgres(process.env['DATABASE_URL'], { prepare: false })

/**
 * The Drizzle ORM database instance.
 *
 * Import this wherever you need to query the database:
 *
 *   import { db } from '@finance/db'
 *   // or from within the web app:
 *   import { db } from '@/lib/db'
 *
 * Then use it with Drizzle's fluent query builder:
 *
 *   const rows = await db.select().from(transactions).where(...)
 *   await db.insert(transactions).values({ ... })
 *   await db.update(transactions).set({ category: 'Groceries' }).where(...)
 *
 * The `schema` option enables Drizzle's relational query API if needed,
 * though we use the fluent builder throughout this project.
 */
export const db = drizzle(client, { schema })

export type Database = typeof db

/**
 * Drizzle Kit configuration.
 *
 * Drizzle Kit is the CLI companion to Drizzle ORM — it handles schema
 * migrations. It reads this config to know where the schema is and
 * how to connect to the database.
 *
 * COMMANDS (run from monorepo root):
 *   pnpm db:push     → Pushes schema changes directly to the database.
 *                      Best for development — no migration files generated.
 *                      Fast but destructive (can drop columns without confirmation).
 *
 *   pnpm db:generate → Generates SQL migration files from schema changes.
 *                      Best for production — gives you reviewable .sql files.
 *                      Run `pnpm db:migrate` after to apply them.
 *
 * WHY DIRECT_URL FOR MIGRATIONS?
 * ────────────────────────────────
 * Drizzle Kit uses PostgreSQL's extended query protocol for DDL statements
 * (CREATE TABLE, ALTER TABLE, etc.), which requires a direct connection.
 * Supabase's PgBouncer pooler (used by DATABASE_URL) doesn't support this
 * protocol in transaction mode. DIRECT_URL bypasses PgBouncer.
 *
 * See also: packages/db/src/client.ts for the runtime connection explanation.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  /**
   * Path to the Drizzle schema file that defines all tables and enums.
   * Drizzle Kit reads this to compute what SQL to generate/push.
   */
  schema: './src/schema.ts',

  /**
   * Directory where generated migration files (.sql) are written.
   * Only relevant when using `drizzle-kit generate` + `drizzle-kit migrate`.
   * For `drizzle-kit push` (development), this is unused.
   */
  out: './drizzle',

  /** We're connecting to a PostgreSQL database (Supabase is PostgreSQL). */
  dialect: 'postgresql',

  dbCredentials: {
    /**
     * Use DIRECT_URL for migrations — it bypasses PgBouncer.
     * Falls back to DATABASE_URL if DIRECT_URL isn't set (e.g. for a local
     * Postgres dev database that doesn't use PgBouncer).
     */
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
})

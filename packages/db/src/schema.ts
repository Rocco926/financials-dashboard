/**
 * Drizzle ORM database schema.
 *
 * This file is the single source of truth for the database structure.
 * Changes here must be followed by `pnpm db:push` (Supabase dev) or
 * `pnpm db:generate && pnpm db:migrate` (production migration).
 *
 * TABLE OVERVIEW
 * ──────────────
 *   accounts      — Bank accounts (inferred from imported files, one per statement)
 *   categories    — Spending categories (seeded with Australian defaults)
 *   transactions  — Individual bank transactions imported from files
 *   import_log    — Audit trail of every file import (what was imported, when, results)
 *
 * SIGN CONVENTION
 * ───────────────
 * All `amount` columns use the same convention as the parsers:
 *   Positive (+) = money coming IN  (income, refunds, transfers in)
 *   Negative (-) = money going OUT  (bills, purchases, transfers out)
 *
 * This makes aggregation queries natural:
 *   SUM(amount) WHERE amount > 0  → total income
 *   SUM(amount) WHERE amount < 0  → total expenses (negative number)
 *   SUM(amount)                   → net cash flow
 *
 * NUMERIC VS FLOAT
 * ────────────────
 * All monetary values use PostgreSQL's `numeric(12, 2)` type rather than
 * float. Floats have well-known precision issues with money (0.1 + 0.2 ≠ 0.3).
 * Drizzle reads numeric columns back as strings, so we use parseFloat() when
 * doing arithmetic in JavaScript (e.g. in dashboard aggregations).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────
// Postgres enums are more efficient than text columns with CHECK constraints,
// and Drizzle generates them correctly in the migration output.

/**
 * The type of bank account.
 * Used in the accounts table and the import UI's account picker.
 */
export const accountTypeEnum = pgEnum('account_type', [
  'transaction',  // Everyday / cheque account
  'savings',      // High-interest savings
  'credit_card',  // Credit card (balance = amount owed, typically negative)
  'loan',         // Home loan or personal loan
])

/**
 * The direction of a transaction relative to the account.
 * Always derivable from the sign of `amount`, but stored for query convenience.
 */
export const transactionTypeEnum = pgEnum('transaction_type', [
  'credit',  // Money in (positive amount)
  'debit',   // Money out (negative amount)
])

// ─── accounts ─────────────────────────────────────────────────────────────────

/**
 * Represents a single bank account that the user has imported transactions for.
 *
 * Accounts are created either:
 *   a) Manually by the user during the import wizard (most common)
 *   b) Automatically inferred from OFX metadata (ACCTID tag) — not yet implemented
 *
 * One account can have transactions from many imported files (e.g. 12 monthly
 * Westpac statements all belonging to the same "Westpac Everyday" account).
 */
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),

  /**
   * Human-readable account name chosen by the user.
   * Examples: "Westpac Everyday", "NAB Credit Card", "CommBank Savings"
   * This is what appears in the UI and transaction filters.
   */
  name: text('name').notNull(),

  /**
   * The bank or financial institution name.
   * Examples: "Westpac", "NAB", "Commonwealth Bank", "American Express"
   * Used for display in the import UI's account list.
   */
  institution: text('institution').notNull(),

  /** Account type — controls how balances are displayed in the UI. */
  type: accountTypeEnum('type').notNull().default('transaction'),

  /**
   * ISO 4217 currency code.
   * Always 'AUD' for Australian bank accounts, but stored for potential
   * future multi-currency support.
   */
  currency: text('currency').notNull().default('AUD'),

  /**
   * Timestamp of the most recent file import for this account.
   * Updated at the end of every successful import in POST /api/import.
   * Displayed in the accounts list so the user can see when data is stale.
   */
  lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── categories ───────────────────────────────────────────────────────────────

/**
 * Spending categories that transactions can be assigned to.
 *
 * The table is pre-seeded with 16 Australian-specific defaults via `pnpm db:seed`.
 * The user can assign categories to transactions inline on the transactions page.
 *
 * CATEGORY-TRANSACTION RELATIONSHIP
 * ──────────────────────────────────
 * `transactions.category` is a text FK pointing to `categories.name` (not `id`).
 * This means category names are the join key. If a category is renamed, the FK
 * cascade UPDATE propagates to all transactions automatically.
 *
 * WHY NAME AS FK?
 * ───────────────
 * The category name is displayed directly in the UI (the select dropdown) and
 * stored as-is in the transaction row. Using name-as-FK avoids a join when
 * rendering the transactions table.
 */
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),

  /**
   * The category name — also the FK target from transactions.category.
   * Examples: "Groceries", "Dining & Takeaway", "Rent/Mortgage"
   * Must be unique across all categories.
   */
  name: text('name').notNull().unique(),

  /**
   * Hex colour code for charts and badges.
   * Examples: "#22c55e" (green for Income), "#f59e0b" (amber for Groceries)
   * Used in the donut chart on the dashboard to colour each category's slice.
   */
  colour: text('colour').notNull(),

  /**
   * Optional monthly budget limit in AUD.
   * When set, the budgets page will show spend vs budget progress.
   * null means no budget has been configured for this category.
   * Stored as numeric(12,2) — same precision as transaction amounts.
   */
  monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }),

  /**
   * Whether this category represents income (true) or spending (false).
   * Income categories (e.g. "Salary", "Interest") should be excluded from
   * the spending breakdown charts on the dashboard.
   * Only the seeded "Income" category has isIncome=true by default.
   */
  isIncome: boolean('is_income').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── transactions ─────────────────────────────────────────────────────────────

/**
 * Individual bank transactions — the core table of the application.
 *
 * Rows are inserted by the import route (POST /api/import).
 * The user interacts with these via:
 *   - The transactions page (view, filter, assign categories)
 *   - The dashboard (aggregations for charts and metric cards)
 *
 * DEDUPLICATION
 * ─────────────
 * The UNIQUE constraint on `external_id` is the deduplication mechanism.
 * Every insert uses ON CONFLICT DO NOTHING, so re-importing the same file
 * is always safe and always a no-op for rows that already exist.
 *
 * EDITABILITY
 * ───────────
 * Most fields are set at import time and never changed. The user-editable
 * fields are: `merchant`, `category`, and `notes`.
 * These are updated via PATCH /api/transactions/[id].
 */
export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),

  /**
   * Deterministic unique identifier for deduplication.
   *
   * Source: OFX files → raw FITID string from the <FITID> tag.
   *         CSV/QIF files → 32-char SHA-256 hex of (date|amount|desc|position).
   *
   * UNIQUE constraint enforced at the database level. The import route uses
   * INSERT ... ON CONFLICT (external_id) DO NOTHING so duplicate rows are
   * silently skipped and counted as `transactionsSkipped` in the import result.
   */
  externalId: text('external_id').notNull().unique(),

  /**
   * Which account this transaction belongs to.
   * Set at import time (user selects the account in the import wizard).
   * CASCADE DELETE: if an account is deleted, its transactions are also deleted.
   */
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),

  /**
   * The date the transaction was posted, in YYYY-MM-DD format.
   * Stored as PostgreSQL `date` type (no time component) because bank exports
   * only provide calendar dates, not times.
   *
   * Drizzle reads this back as a string ('2024-03-29'), not a Date object.
   * Use `new Date(value + 'T00:00:00')` to convert for display.
   */
  date: date('date').notNull(),

  /**
   * Transaction amount in AUD.
   * Positive = credit (money in), Negative = debit (money out).
   * Stored as numeric(12,2) for exact decimal arithmetic.
   * Drizzle returns this as a string — use parseFloat() when doing math.
   */
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

  /**
   * Raw description string exactly as exported by the bank.
   * Examples: "WOOLWORTHS 1234 SYDNEY", "SALARY PAYMENT ACME PTY LTD"
   * This is never modified after import. The user edits `merchant` instead.
   */
  description: text('description').notNull(),

  /**
   * User-editable cleaned merchant name.
   * Defaults to `description` at import time (the import route sets them equal).
   * The user can change this to something friendlier (e.g. "Woolworths" instead
   * of "WOOLWORTHS METCENTRE 123 SYDNEY NSW AU").
   * Displayed in the transactions table and dashboard recent list.
   */
  merchant: text('merchant'),

  /**
   * The spending category assigned to this transaction.
   * FK to categories.name (not categories.id — see categories table comment).
   * Null until the user assigns a category via the inline editor.
   *
   * ON DELETE SET NULL: if the category is deleted, this becomes null again.
   * ON UPDATE CASCADE: if the category is renamed, this updates automatically.
   */
  category: text('category').references(() => categories.name, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),

  /** Optional free-text note the user can add to any transaction. */
  notes: text('notes'),

  /**
   * Whether money moved in (credit) or out (debit).
   * Derived from the sign of amount and stored for query convenience.
   * credit = amount > 0, debit = amount < 0.
   */
  type: transactionTypeEnum('type').notNull(),

  /**
   * Running account balance after this transaction, as exported by the bank.
   * Available from Westpac CSV, NAB CSV, and some OFX files.
   * QIF files NEVER include balance — this will be null for all QIF imports.
   * Null should be displayed as "—" in the UI, not "$0.00".
   */
  balance: numeric('balance', { precision: 12, scale: 2 }),

  /**
   * Original parsed fields from the source file, as a JSON object.
   * For CSV: the complete Papa.parse row (all columns, including ones we don't use).
   * For QIF: the D/T/P/M fields as strings.
   * For OFX: DTPOSTED, TRNAMT, NAME, FITID.
   *
   * Stored as jsonb for efficient storage. Never shown in the UI.
   * Purpose: debug tool if a transaction looks wrong — trace it back to source data.
   */
  rawData: jsonb('raw_data'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── import_log ───────────────────────────────────────────────────────────────

/**
 * Audit trail of every file import operation.
 *
 * One row is written per imported file (not per import session — if the user
 * uploads 3 files at once, 3 rows are created).
 *
 * This table serves two purposes:
 *   1. Let the user see the history of what they've imported and when.
 *   2. Provide a permanent record of parse warnings that may need attention.
 *
 * Currently this table is written-to but not surfaced in the UI.
 * A future "Import history" page could query it.
 */
export const importLog = pgTable('import_log', {
  id: uuid('id').defaultRandom().primaryKey(),

  /** Original filename of the uploaded file (e.g. "westpac-march-2024.csv") */
  filename: text('filename').notNull(),

  /** Detected file format ('csv', 'qif', 'ofx', 'qbo') */
  format: text('format').notNull(),

  /** Which account the imported transactions were assigned to */
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),

  /** Number of transactions successfully inserted (new rows) */
  transactionsImported: integer('transactions_imported').notNull().default(0),

  /**
   * Number of transactions skipped due to external_id conflicts.
   * A non-zero value here means the user re-imported a file they already
   * imported before, which is expected and handled gracefully.
   */
  transactionsSkipped: integer('transactions_skipped').notNull().default(0),

  /**
   * Non-fatal parse warnings from the file, if any.
   * Stored as a text array. Null means the file parsed without warnings.
   */
  parseErrors: text('parse_errors').array(),

  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Inferred TypeScript types ────────────────────────────────────────────────
// These give you fully-typed objects when querying with Drizzle.
// Use the Select type for query results, Insert type for insert operations.

export type Account     = typeof accounts.$inferSelect
export type NewAccount  = typeof accounts.$inferInsert
export type Category    = typeof categories.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type ImportLog   = typeof importLog.$inferSelect

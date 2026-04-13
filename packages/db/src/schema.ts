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
  unique,
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
   * Whether this category represents income (true) or spending (false).
   * Income categories (e.g. "Salary", "Interest") should be excluded from
   * the spending breakdown charts on the dashboard.
   * Only the seeded "Income" category has isIncome=true by default.
   */
  isIncome: boolean('is_income').notNull().default(false),

  /**
   * Whether this category represents an internal transfer between the user's
   * own accounts (true) rather than a true expense.
   * Examples: savings deposits, ETF purchases, credit card payments.
   *
   * Transfer transactions are EXCLUDED from:
   *   - The Expenses metric on the dashboard
   *   - The Monthly expenses bar chart
   *   - The Spending by category donut chart
   *   - The Budgets page spend calculations
   *
   * This corrects the common problem where moving money to a savings account
   * inflates reported expenses. The "Transfers & Savings" category uses this.
   */
  isTransfer: boolean('is_transfer').notNull().default(false),

  /**
   * Legacy monthly budget amount — kept to avoid a destructive migration.
   * Budget amounts are now managed via the `budgets` table joined to categories.
   * This column is no longer read or written by the application.
   */
  monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }),

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

// ─── holdings ─────────────────────────────────────────────────────────────────

/**
 * The type of financial holding.
 * Drives which fields are relevant in the UI and how value is computed.
 *   cash   → value = manualBalance (user-entered)
 *   etf    → value = units × current market price (fetched from Yahoo Finance)
 *   stock  → same as etf
 *   other  → manual balance, no ticker
 */
export const holdingTypeEnum = pgEnum('holding_type', ['cash', 'etf', 'stock', 'other'])

/**
 * A financial holding — either a cash account or a market security.
 *
 * Cash holdings (Macquarie HISA, Westpac savings): value is manually entered.
 * Security holdings (ETFs, stocks): value = units × live price from Yahoo Finance.
 *
 * COST BASE
 * ─────────
 * avgCostPerUnit enables unrealised P&L calculation:
 *   cost base  = units × avgCostPerUnit
 *   gain/loss  = currentValue − costBase
 *
 * PRICE CACHE
 * ──────────
 * Current prices are stored in holding_price_cache (separate table) keyed by
 * ticker. This avoids re-fetching from Yahoo Finance on every page load.
 */
export const holdings = pgTable('holdings', {
  id:              uuid('id').defaultRandom().primaryKey(),
  name:            text('name').notNull(),
  institution:     text('institution').notNull(),
  type:            holdingTypeEnum('type').notNull(),

  /** ASX/NYSE/etc ticker symbol. e.g. "DHHF.AX", "BGBL.AX", "AAPL". Null for cash. */
  ticker:          text('ticker'),

  /** Number of units held. Supports fractional units (e.g. 123.4567). Null for cash. */
  units:           numeric('units', { precision: 18, scale: 6 }),

  /**
   * Average cost per unit for cost base / P&L tracking.
   * Computed by user based on their purchase history.
   * Null means cost base tracking is not set up for this holding.
   */
  avgCostPerUnit:  numeric('avg_cost_per_unit', { precision: 12, scale: 4 }),

  /** Current balance in AUD. Used for cash holdings. Null for securities. */
  manualBalance:   numeric('manual_balance', { precision: 12, scale: 2 }),

  currency:        text('currency').notNull().default('AUD'),
  notes:           text('notes'),

  /** Controls display order in the holdings table. Lower = higher up. */
  sortOrder:       integer('sort_order').notNull().default(0),

  /**
   * Optional link to a bank account in the `accounts` table.
   * When set on a cash/other holding, the import route will automatically
   * update `manualBalance` to the most recent transaction's running balance
   * after every successful import for that account.
   *
   * Only meaningful for cash/other holdings — ETF/stock holdings derive their
   * value from units × live price and ignore this field.
   *
   * SET NULL on delete: if the linked account is deleted, the holding keeps
   * its last known balance and just stops auto-updating.
   */
  linkedAccountId: uuid('linked_account_id')
    .references(() => accounts.id, { onDelete: 'set null' }),

  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── holding_price_cache ──────────────────────────────────────────────────────

/**
 * Cached market prices from Yahoo Finance.
 *
 * Keyed by ticker symbol. Prices are refreshed on page load when stale (> 1 hour).
 * Falls back to cached price if Yahoo Finance is unavailable.
 *
 * WHY A SEPARATE TABLE?
 * ─────────────────────
 * Prices are volatile and fetched from an external API. Separating them from
 * holdings keeps the holdings table stable (user-entered data) while letting
 * prices update independently without touching holdings rows.
 */
export const holdingPriceCache = pgTable('holding_price_cache', {
  ticker:    text('ticker').primaryKey(),
  name:      text('name'),

  /** Latest market price. */
  price:     numeric('price', { precision: 12, scale: 4 }).notNull(),

  /** Percentage change from previous close. Null if unavailable. */
  changePct: numeric('change_pct', { precision: 8, scale: 4 }),

  currency:  text('currency').notNull().default('AUD'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── holding_snapshots ────────────────────────────────────────────────────────

/**
 * Daily snapshots of total net worth across all holdings.
 *
 * One row is written automatically per calendar day on the first page load.
 * The UNIQUE constraint on snapshotDate ensures idempotency.
 *
 * These are used to draw the "Net worth over time" line chart.
 * After a few weeks of use, this chart becomes genuinely useful.
 *
 * BREAKDOWN JSONB
 * ───────────────
 * Stores a point-in-time snapshot of each holding's value so you can
 * reconstruct the portfolio composition on any given day.
 * Shape: [{ holdingId, name, type, value, units, price }]
 */
export const holdingSnapshots = pgTable('holding_snapshots', {
  id:           uuid('id').defaultRandom().primaryKey(),

  /** One snapshot per calendar day. UNIQUE prevents duplicate daily entries. */
  snapshotDate: date('snapshot_date').notNull().unique(),

  /** Total value of all holdings on this date in AUD. */
  totalValue:   numeric('total_value', { precision: 12, scale: 2 }).notNull(),

  /** Per-holding breakdown for that day. */
  breakdown:    jsonb('breakdown'),

  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── category_rules ───────────────────────────────────────────────────────────

/**
 * Learned categorisation rules — the "corrections stick" table.
 *
 * A row is written here whenever the user manually corrects a transaction's
 * category. On the next import, descriptions are matched against this table
 * first (before the keyword map or AI). This means a correction made once is
 * applied to all future transactions with the same merchant pattern.
 *
 * MATCHING STRATEGY
 * ─────────────────
 * `merchantPattern` stores the normalised description: uppercased and trimmed.
 * The import route normalises incoming descriptions the same way before lookup.
 * This is a simple equality match — no wildcards or regex.
 *
 * SOURCE COLUMN
 * ─────────────
 * Tracks where the rule came from:
 *   'manual'  — user explicitly changed the category in the transactions UI
 *   'nab'     — inferred from the NAB CSV's built-in Category column
 *   'keyword' — matched by the static keyword map in lib/categorise.ts
 *
 * Manual rules take precedence over all other sources. The import pipeline
 * checks this table first and always trusts the result.
 */
export const categoryRules = pgTable('category_rules', {
  id:              uuid('id').defaultRandom().primaryKey(),

  /**
   * Normalised description used as the lookup key.
   * Stored as UPPERCASE trimmed string to match how the import route normalises
   * raw bank descriptions before querying this table.
   * UNIQUE — one rule per unique description pattern.
   */
  merchantPattern: text('merchant_pattern').notNull().unique(),

  /**
   * The category to assign when this pattern matches.
   * FK to categories.name (same approach as transactions.category).
   * ON UPDATE CASCADE: renaming a category updates all matching rules.
   * ON DELETE CASCADE: deleting a category removes its rules too.
   */
  category:        text('category').notNull().references(() => categories.name, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),

  /** Where this rule came from. Informational — not used for logic. */
  source:          text('source').notNull().default('manual'),

  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── budgets ──────────────────────────────────────────────────────────────────

/**
 * Monthly budget allocations per category.
 *
 * One row per (category, calendar month). The month column is always stored as
 * the first day of the month (e.g. 2026-04-01 for April 2026).
 *
 * WHY A SEPARATE TABLE?
 * ─────────────────────
 * Storing budgets here (rather than a column on categories) lets us:
 *   1. Track budget history month-by-month (different amounts in different months)
 *   2. Delete a budget without touching the category record
 *   3. Keep the categories table focused on classification metadata
 *
 * UNIQUE CONSTRAINT
 * ──────────────────
 * (category_id, month) is unique — one budget per category per calendar month.
 * The POST /api/budgets route uses upsert semantics (ON CONFLICT DO UPDATE)
 * so creating and updating a budget are the same call from the client's perspective.
 */
export const budgets = pgTable('budgets', {
  id:         uuid('id').defaultRandom().primaryKey(),

  /** The category this budget applies to. Cascade-deletes if the category is removed. */
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),

  /** Budget amount in AUD for the given month. Always positive. */
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

  /**
   * First day of the calendar month this budget applies to.
   * Always stored as YYYY-MM-01 (e.g. "2026-04-01").
   * Drizzle reads this back as a string.
   */
  month: date('month').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('budgets_category_month_unique').on(t.categoryId, t.month),
])

// ─── market_insights ──────────────────────────────────────────────────────────

/**
 * Cache for Claude-generated portfolio insight text.
 *
 * Single-user app — only ever one row. The holdings_hash column detects
 * portfolio changes so the insight regenerates when composition shifts.
 */
export const marketInsights = pgTable('market_insights', {
  id:            uuid('id').defaultRandom().primaryKey(),

  /** The generated 2–3 sentence narrative paragraph. */
  content:       text('content').notNull(),

  /** SHA-256 hash of ticker+value pairs at generation time. */
  holdingsHash:  text('holdings_hash').notNull(),

  generatedAt:   timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Inferred TypeScript types ────────────────────────────────────────────────
// These give you fully-typed objects when querying with Drizzle.
// Use the Select type for query results, Insert type for insert operations.

export type Account        = typeof accounts.$inferSelect
export type NewAccount     = typeof accounts.$inferInsert
export type Category       = typeof categories.$inferSelect
export type Transaction    = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type ImportLog      = typeof importLog.$inferSelect
export type Budget         = typeof budgets.$inferSelect
export type NewBudget      = typeof budgets.$inferInsert

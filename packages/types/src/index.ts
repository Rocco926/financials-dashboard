/**
 * @module @finance/types
 *
 * Shared TypeScript types used across every package in the monorepo.
 *
 * WHY A SEPARATE TYPES PACKAGE?
 * ─────────────────────────────
 * The parsers package is intentionally framework-agnostic (pure Node.js,
 * no Next.js dependency). The database package and the web app both also
 * need the same shapes. Centralising types here lets all three packages
 * share identical interfaces without creating a circular dependency.
 *
 * USED BY:
 *   @finance/parsers — produces ParsedTransaction / ParseResult
 *   @finance/db      — consumes them when inserting rows
 *   apps/web         — consumes them in API route handlers and UI
 */

// ─── File format ─────────────────────────────────────────────────────────────

/**
 * The four file formats accepted by the importer.
 *
 * - csv  : Comma-separated values — used by Westpac and NAB. The parser
 *          auto-detects which bank by inspecting the header row.
 * - qif  : Quicken Interchange Format — a simple line-based text format.
 *          Westpac and NAB both offer QIF export.
 * - ofx  : Open Financial Exchange — an XML-like SGML format used by most
 *          Australian banks. Westpac and many credit cards support it.
 * - qbo  : QuickBooks Online format — structurally identical to OFX.
 *          Handled by the same parser; distinguished only by file extension.
 */
export type FileFormat = 'csv' | 'qif' | 'ofx' | 'qbo'

// ─── Account types ────────────────────────────────────────────────────────────

/**
 * The broad category of a bank account.
 * Used in the `accounts` database table and in the import UI's account picker.
 *
 * - transaction  : Everyday / cheque account (most common)
 * - savings      : High-interest savings account
 * - credit_card  : Credit card account (balances will be negative = money owed)
 * - loan         : Home loan or personal loan
 */
export type AccountType = 'transaction' | 'savings' | 'credit_card' | 'loan'

// ─── Transaction direction ────────────────────────────────────────────────────

/**
 * Whether money moved INTO (credit) or OUT OF (debit) the account.
 * This is always derivable from the sign of `amount`, but stored explicitly
 * for convenience in SQL queries and UI rendering.
 */
export type TransactionType = 'credit' | 'debit'

// ─── Core parser output ───────────────────────────────────────────────────────

/**
 * A single bank transaction after normalisation.
 *
 * Every parser (CSV, QIF, OFX) converts its native format into this shape.
 * The web API layer then maps this 1:1 into a database row.
 *
 * SIGN CONVENTION
 * ───────────────
 * amount is always signed from the account holder's perspective:
 *   Positive (+) = money coming IN  (e.g. salary, refund)
 *   Negative (-) = money going OUT  (e.g. groceries, bills)
 *
 * This is the same sign convention PostgreSQL's numeric type uses,
 * and what the dashboard aggregation queries rely on.
 *
 * DEDUPLICATION
 * ─────────────
 * `externalId` is the key that prevents the same transaction being inserted
 * twice. For OFX files it uses the bank-provided FITID (already globally unique
 * within a file). For CSV and QIF files it's a SHA-256 hash of:
 *   date + amount + description + file-position
 * The file-position component means two identical transactions on the same day
 * (e.g. two $4.50 coffee purchases at the same café) get different IDs.
 */
export interface ParsedTransaction {
  /**
   * Deterministic identifier used as a UNIQUE key in the database.
   * Re-importing the same file produces the same IDs, so the upsert
   * (INSERT ... ON CONFLICT DO NOTHING) silently skips duplicates.
   *
   * OFX source: raw FITID string from the <FITID> tag.
   * CSV/QIF source: 32-character hex prefix of SHA-256(date|amount|desc|pos).
   */
  externalId: string

  /** Date of the transaction. Time is always midnight (banks only export dates). */
  date: Date

  /**
   * Transaction amount in the account's currency (always AUD for Australian banks).
   * Positive = credit (money in), negative = debit (money out).
   * Stored as a JavaScript number; written to Postgres as numeric(12,2).
   */
  amount: number

  /**
   * The raw description string exactly as it appears in the bank export.
   * This is what merchants see — usually something like "WOOLWORTHS 1234 SYDNEY".
   * The user can later override it with a cleaner `merchant` name via the UI.
   */
  description: string

  /**
   * Running account balance after this transaction, if the bank includes it.
   * Westpac CSV and OFX files typically include this.
   * QIF files NEVER include balance — this field will always be undefined.
   * NAB CSV exports include balance.
   */
  balance?: number

  /**
   * Convenience field mirroring the sign of `amount`.
   * 'credit' when amount >= 0, 'debit' when amount < 0.
   */
  type: TransactionType

  /**
   * Cleaned merchant name, if the source file provides one.
   * Currently populated only by the NAB nab2 CSV format, which exports a
   * "Merchant Name" column with a tidied label (e.g. "Woolworths" instead of
   * "WOOLWORTHS METRO SYDNEY 036"). When present, the import route uses this
   * as the initial `merchant` value rather than falling back to `description`.
   * undefined means the file format doesn't include a merchant column.
   */
  merchantName?: string

  /**
   * Category suggested by the parser from bank-provided metadata.
   * Currently populated only by NAB nab2 CSV, which includes a "Category"
   * column (e.g. "Groceries", "Income"). The import route checks this after
   * the category_rules table and before the static keyword map.
   * undefined means no bank-provided category was available.
   */
  suggestedCategory?: string

  /**
   * The complete original parsed record, preserved as-is for debugging.
   * For CSV: the entire Papa.parse row object (all columns).
   * For QIF: the D/T/P/M fields as strings.
   * For OFX: the key tag values (DTPOSTED, TRNAMT, NAME, FITID).
   *
   * This is stored in the database as jsonb and is never shown in the UI.
   * Its purpose is to let you trace exactly what the bank sent if a
   * transaction looks wrong.
   */
  rawData: Record<string, unknown>
}

// ─── Parser return value ──────────────────────────────────────────────────────

/**
 * The complete result of parsing a single bank export file.
 *
 * Note that `parseErrors` is non-fatal — a result can have both a non-empty
 * `transactions` array AND `parseErrors`. For example, a 100-row CSV where
 * three rows have a malformed date will return 97 transactions and 3 errors.
 * The import route logs these errors but continues importing the valid rows.
 */
export interface ParseResult {
  /** All successfully parsed and normalised transactions. */
  transactions: ParsedTransaction[]

  /**
   * Account name extracted from the file itself, if present.
   * Only OFX files typically include account metadata (via <ACCTID>).
   * CSV and QIF files have no account metadata — this will be undefined.
   * The UI lets the user manually specify the account during import.
   */
  accountName?: string

  /**
   * ISO 4217 currency code. Defaults to 'AUD' for all Australian banks.
   * OFX files may declare this explicitly via the <CURDEF> tag.
   */
  currency: string

  /** The format that was detected and used to parse the file. */
  format: FileFormat

  /**
   * Non-fatal parse warnings.
   * Examples: malformed date on row 3, empty amount on row 7.
   * These are surfaced to the user in the import result summary.
   * An empty array means the file parsed cleanly.
   */
  parseErrors: string[]
}

/**
 * Deterministic transaction ID generation.
 *
 * PURPOSE
 * ───────
 * Every transaction needs a stable, unique identifier so that re-importing
 * the same file is always a no-op (idempotent). The database enforces this
 * via a UNIQUE constraint on the `external_id` column, combined with
 * INSERT ... ON CONFLICT DO NOTHING in the import route.
 *
 * WHY SHA-256?
 * ────────────
 * We need the same file to produce the same IDs across multiple imports,
 * even across different machines and Node.js versions. SHA-256 from the
 * Node.js built-in `crypto` module is deterministic, fast, and needs no
 * additional dependencies.
 *
 * We only use the first 32 hex characters (128 bits) of the 64-character
 * SHA-256 output. This is more than sufficient collision resistance for
 * a personal finance app that might have tens of thousands of transactions.
 *
 * WHY INCLUDE `position`?
 * ───────────────────────
 * Without a positional tiebreaker, two identical transactions on the same
 * day would produce the same hash and only the first would be stored.
 * This is a real scenario — e.g. two $4.50 coffee purchases at the same
 * café on the same day.
 *
 * `position` is the 0-based index of the transaction within its source file.
 * As long as the bank always exports transactions in the same order (which
 * they do — chronological or reverse-chronological), the hash is stable
 * across re-imports of the same file.
 *
 * NOTE: OFX files do NOT use this function. They use the bank-provided
 * FITID tag value directly, which is already globally unique per file.
 * See packages/parsers/src/parsers/ofx.ts.
 */
import { createHash } from 'node:crypto'

/**
 * Generates a 32-character deterministic hex ID for a CSV or QIF transaction.
 *
 * The input string is built as:
 *   "YYYY-MM-DD|{amount with 2dp}|{description lowercased+trimmed}|{position}"
 *
 * @param date        - The parsed transaction date
 * @param amount      - The signed amount (negative for debits)
 * @param description - The raw bank description string
 * @param position    - 0-based index within the source file (collision tiebreaker)
 * @returns           - 32 hex characters (first 128 bits of SHA-256)
 */
export function generateExternalId(
  date: Date,
  amount: number,
  description: string,
  position: number,
): string {
  // Use ISO date portion only — time is always midnight for bank transactions
  const dateStr = date.toISOString().split('T')[0] ?? ''

  // toFixed(2) ensures -45.5 and -45.50 produce the same string
  const input = `${dateStr}|${amount.toFixed(2)}|${description.toLowerCase().trim()}|${position}`

  return createHash('sha256').update(input).digest('hex').slice(0, 32)
}

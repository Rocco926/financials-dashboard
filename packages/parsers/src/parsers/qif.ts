/**
 * QIF (Quicken Interchange Format) parser.
 *
 * WHY NO LIBRARY?
 * ───────────────
 * The main npm QIF library (node-qif) has not been meaningfully maintained
 * in years. QIF is a simple enough format that a from-scratch parser is
 * more reliable, has no external dependencies, and is easier to debug
 * when a bank exports a slightly non-standard variant.
 *
 * QIF FORMAT OVERVIEW
 * ───────────────────
 * QIF is a line-based text format. Each line starts with a single character
 * "tag" followed immediately by the value. Records are separated by "^" lines.
 *
 * A typical Australian bank QIF file looks like:
 *
 *   !Type:Bank          ← header declaring this is a bank account file
 *   D29/03/2024         ← D tag: date
 *   T-45.50             ← T tag: amount (negative = money out)
 *   PWoolworths 1234    ← P tag: payee (merchant name)
 *   ^                   ← end of this record
 *   D28/03/2024
 *   T3000.00
 *   PSalary Payment
 *   ^
 *
 * RECOGNISED TAGS
 * ───────────────
 *   !   Header line (e.g. !Type:Bank) — skipped
 *   D   Date of transaction
 *   T   Amount — negative for debits, may include commas (e.g. -1,234.56)
 *   P   Payee / merchant name (preferred description source)
 *   M   Memo — used as description fallback if no P line present
 *   ^   End of record — triggers commit of the current record
 *
 * All other tags (L=category, C=cleared status, N=cheque number, etc.) are
 * silently ignored — we only need the fields relevant to our data model.
 *
 * LIMITATIONS
 * ───────────
 * QIF does NOT include a running balance. The `balance` field on the
 * resulting ParsedTransaction objects will always be undefined.
 *
 * QIF has no concept of account metadata, so `accountName` in ParseResult
 * will always be undefined.
 */
import { parse as parseDate } from 'date-fns'
import { generateExternalId } from '../hash.js'
import type { ParsedTransaction, ParseResult } from '@finance/types'

/**
 * The fields we accumulate as we read lines within a single QIF record.
 * All fields are optional because we build this up line by line.
 */
interface QifRecord {
  /** Raw date string from the D tag, e.g. "29/03/2024" */
  date?: string
  /** Raw amount string from the T tag, e.g. "-45.50" (commas stripped) */
  amount?: string
  /** Payee name from the P tag — preferred description */
  payee?: string
  /** Memo from the M tag — fallback description if no P tag */
  memo?: string
}

/**
 * Parses a QIF date string, trying multiple common formats.
 *
 * Australian banks (Westpac, NAB) use DD/MM/YYYY, but QIF is an old
 * format with many variants. We try several formats in order of likelihood
 * to be robust against edge cases.
 *
 * @param raw - The raw date string from the QIF D tag
 * @returns   - A valid Date object
 * @throws    - If none of the attempted formats match
 */
function parseQifDate(raw: string): Date {
  const s = raw.trim()

  // Try formats in order of most to least common for Australian banks
  const formats = [
    'dd/MM/yyyy',   // 29/03/2024  — Westpac and NAB standard
    'd/M/yyyy',     // 9/3/2024    — single-digit day/month variant
    'dd-MM-yyyy',   // 29-03-2024  — dash-separated variant
    'MM/dd/yyyy',   // 03/29/2024  — US format (some older QIF files)
    'yyyy-MM-dd',   // 2024-03-29  — ISO format fallback
  ]

  for (const fmt of formats) {
    const d = parseDate(s, fmt, new Date())
    if (!isNaN(d.getTime())) return d
  }

  throw new Error(`Cannot parse QIF date "${s}"`)
}

/**
 * Parses a QIF-format file into normalised transactions.
 *
 * Algorithm:
 * 1. Split the file into lines, trim whitespace, discard blank lines.
 * 2. For each line, inspect the first character (the tag).
 * 3. Accumulate D/T/P/M values into a `current` record object.
 * 4. When a "^" line is encountered, validate and commit the current record.
 * 5. Return all collected transactions plus any non-fatal errors.
 *
 * @param content - UTF-8 string contents of the .qif file
 * @returns       - ParseResult with transactions and any non-fatal errors
 */
export function parseQif(content: string): ParseResult {
  // Split on both Unix (\n) and Windows (\r\n) line endings
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)

  const parseErrors: string[] = []
  const transactions: ParsedTransaction[] = []

  let current: QifRecord = {}

  // `position` is the index of successfully committed records — used as
  // the tiebreaker in generateExternalId, NOT the line number.
  let position = 0

  for (const line of lines) {
    // Skip the file-type header line (e.g. "!Type:Bank", "!Type:CCard")
    if (line.startsWith('!')) continue

    // First character = tag, everything after = value
    const tag = line[0]
    const value = line.slice(1).trim()

    switch (tag) {
      case 'D':
        // Date line — store raw string, parse later when committing
        current.date = value
        break

      case 'T':
        // Amount line — strip comma thousands separators before storing
        // e.g. "-1,234.56" → "-1234.56"
        current.amount = value.replace(/,/g, '')
        break

      case 'P':
        // Payee line — this is the merchant/description we want
        current.payee = value
        break

      case 'M':
        // Memo line — only use as description if no Payee was provided.
        // Some QIF files use Memo instead of Payee for the description.
        if (!current.payee) current.memo = value
        break

      case '^': {
        // End-of-record marker — attempt to commit the current record.

        if (current.date && current.amount) {
          // We have the minimum required fields — try to parse and commit.
          try {
            const date = parseQifDate(current.date)
            const amount = parseFloat(current.amount)

            if (isNaN(amount)) {
              parseErrors.push(
                `Record ${position + 1}: invalid amount "${current.amount}"`,
              )
            } else {
              // Prefer P (payee) over M (memo) as the description.
              // If neither is present, description will be an empty string —
              // not ideal, but valid enough to import.
              const description = (current.payee ?? current.memo ?? '').trim()

              transactions.push({
                externalId: generateExternalId(date, amount, description, position),
                date,
                amount,
                description,
                // QIF format has no balance field — always undefined
                type: amount >= 0 ? 'credit' : 'debit',
                // Spread a copy of current so the rawData captures the state
                // at commit time (before we reset current = {} below)
                rawData: { ...current } as Record<string, unknown>,
              })

              position++
            }
          } catch (err) {
            parseErrors.push(
              `Record ${position + 1}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        } else if (current.date || current.amount) {
          // We have SOME fields but not enough to form a valid transaction.
          // Warn rather than silently discard.
          parseErrors.push(`Record ${position + 1}: incomplete record (missing ${!current.date ? 'date' : 'amount'}), skipping`)
        }
        // Reset accumulator for the next record regardless of success/failure
        current = {}
        break
      }

      default:
        // Silently ignore tags we don't use: L (category), C (cleared),
        // N (cheque number), A (address lines), $ (split amount), etc.
        break
    }
  }

  return { transactions, currency: 'AUD', format: 'qif', parseErrors }
}

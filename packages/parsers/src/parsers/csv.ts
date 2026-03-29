/**
 * CSV parser for Australian bank exports.
 *
 * SUPPORTED FORMATS
 * ─────────────────
 * This module auto-detects and handles two distinct CSV layouts:
 *
 *   WESTPAC CSV
 *   ───────────
 *   Exported via: Westpac Online Banking → Transactions → Export → CSV
 *   Headers: BSB Number, Account Number, Transaction Date, Narration,
 *            Cheque Number, Debit, Credit, Balance, Transaction Type
 *
 *   Key quirks:
 *   • Debit and Credit are SEPARATE columns, both with positive values.
 *     A $45.50 grocery purchase appears as Debit=45.50, Credit=(empty).
 *     A $3000 salary appears as Debit=(empty), Credit=3000.00.
 *   • Date format: DD/MM/YYYY (e.g. 29/03/2024)
 *   • Balance column is present and reliable.
 *
 *   NAB CSV
 *   ───────
 *   Exported via: NAB Internet Banking → Export transactions → CSV
 *   Headers: Date, Amount, Narrative, Debit, Credit, Balance, Categories, Serial
 *
 *   Key quirks:
 *   • Amount is already SIGNED (negative for debits, positive for credits).
 *     We use Amount directly; the separate Debit/Credit columns are redundant.
 *   • Date format: DD/MM/YYYY (same as Westpac)
 *   • Balance column is present.
 *   • Categories and Serial are NAB-internal fields we ignore.
 *
 * DETECTION
 * ─────────
 * We identify the bank by checking which distinctive headers are present.
 * Westpac has "Transaction Date" + "Narration"; NAB has "Narrative" + "Amount".
 * If neither set is found, we return a clear error explaining what was expected.
 *
 * ERROR HANDLING
 * ──────────────
 * Row-level errors are non-fatal. A file with 100 rows where 3 have a bad date
 * returns 97 valid transactions and 3 error strings. The import route surfaces
 * these errors in the import result modal without aborting the whole import.
 */
import Papa from 'papaparse'
import { parse as parseDate } from 'date-fns'
import { generateExternalId } from '../hash.js'
import type { ParsedTransaction, ParseResult } from '@finance/types'

/** Each parsed CSV row is a plain object from column name to string value. */
type CsvRow = Record<string, string>

/** Which bank's CSV format was detected from the headers. */
type CsvVariant = 'westpac' | 'nab' | 'unknown'

/**
 * Sniffs the CSV headers to determine which bank this file came from.
 *
 * This is intentionally simple — we look for the two most distinctive column
 * names in each bank's format. We lowercase + trim to be tolerant of any
 * whitespace or capitalisation quirks in the exported file.
 *
 * @param headers - The column names from the CSV (already trimmed by Papa.parse)
 * @returns       - 'westpac', 'nab', or 'unknown' if no match
 */
function detectVariant(headers: string[]): CsvVariant {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()))

  // Westpac: only bank with "Transaction Date" and "Narration" (with an 'a')
  if (set.has('transaction date') && set.has('narration')) return 'westpac'

  // NAB: only bank with "Narrative" (with a 've') and a combined "Amount" column
  if (set.has('narrative') && set.has('amount')) return 'nab'

  return 'unknown'
}

/**
 * Parses a date string in DD/MM/YYYY format, as used by Australian banks.
 *
 * WHY NOT new Date()?
 * ───────────────────
 * JavaScript's built-in Date parser treats "29/03/2024" as invalid (it expects
 * ISO format). Even worse, some engines will silently misparse "03/04/2024" as
 * April 3rd instead of March 4th. We use date-fns/parse with an explicit format
 * string to avoid any ambiguity.
 *
 * @param raw   - Raw date string from the CSV cell (e.g. "29/03/2024")
 * @returns     - A valid Date object
 * @throws      - If the string can't be parsed in either supported format
 */
function parseAuDate(raw: string): Date {
  const s = raw.trim()

  // Primary: DD/MM/YYYY (Australian standard, used by all local banks)
  const primary = parseDate(s, 'dd/MM/yyyy', new Date())
  if (!isNaN(primary.getTime())) return primary

  // Fallback: YYYY-MM-DD (ISO format, just in case)
  const fallback = parseDate(s, 'yyyy-MM-dd', new Date())
  if (!isNaN(fallback.getTime())) return fallback

  throw new Error(`Cannot parse date "${s}" — expected DD/MM/YYYY`)
}

/**
 * Parses a single row from a Westpac CSV export.
 *
 * Westpac uses SEPARATE Debit and Credit columns (both positive numbers).
 * We must check which column is populated to determine direction and sign.
 *
 * Returns either a ParsedTransaction (success) or an error string (failure).
 * The string return type (instead of throwing) allows non-fatal row-level errors.
 *
 * @param row      - A single CSV row as a key→value object
 * @param position - 1-based row number (for error messages and hash generation)
 */
function parseWestpacRow(
  row: CsvRow,
  position: number,
): ParsedTransaction | string {
  try {
    const dateStr = row['Transaction Date'] ?? ''
    const debitStr = (row['Debit'] ?? '').trim()
    const creditStr = (row['Credit'] ?? '').trim()
    const description = (row['Narration'] ?? '').trim()
    const balanceStr = (row['Balance'] ?? '').trim()

    if (!dateStr) return `Row ${position}: missing Transaction Date`
    if (!description) return `Row ${position}: missing Narration`

    const date = parseAuDate(dateStr)

    // Westpac puts the absolute value in whichever column applies.
    // Credit column populated → money came in (positive amount).
    // Debit column populated → money went out (negative amount).
    let amount: number
    if (creditStr !== '') {
      amount = Math.abs(parseFloat(creditStr))        // e.g. salary → +3000
    } else if (debitStr !== '') {
      amount = -Math.abs(parseFloat(debitStr))         // e.g. groceries → -45.50
    } else {
      return `Row ${position}: both Debit and Credit are empty`
    }

    if (isNaN(amount)) return `Row ${position}: invalid amount`

    // Balance is optional — not all Westpac CSV variants include it
    const balance = balanceStr !== '' ? parseFloat(balanceStr) : undefined

    return {
      externalId: generateExternalId(date, amount, description, position),
      date,
      amount,
      description,
      balance,
      type: amount >= 0 ? 'credit' : 'debit',
      // Preserve all original CSV columns in rawData for debugging
      rawData: row as Record<string, unknown>,
    }
  } catch (err) {
    return `Row ${position}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * Parses a single row from a NAB CSV export.
 *
 * NAB uses a single signed `Amount` column (negative for debits, positive for
 * credits), which is simpler than Westpac's split Debit/Credit approach.
 * The separate Debit and Credit columns that NAB also exports are redundant
 * and ignored here.
 *
 * @param row      - A single CSV row as a key→value object
 * @param position - 1-based row number (for error messages and hash generation)
 */
function parseNabRow(
  row: CsvRow,
  position: number,
): ParsedTransaction | string {
  try {
    const dateStr = row['Date'] ?? ''
    const amountStr = (row['Amount'] ?? '').trim()
    const description = (row['Narrative'] ?? '').trim()
    const balanceStr = (row['Balance'] ?? '').trim()

    if (!dateStr) return `Row ${position}: missing Date`
    if (!amountStr) return `Row ${position}: missing Amount`

    const date = parseAuDate(dateStr)

    // NAB's Amount is already signed — no normalisation needed
    const amount = parseFloat(amountStr)
    if (isNaN(amount)) return `Row ${position}: invalid amount "${amountStr}"`

    const balance = balanceStr !== '' ? parseFloat(balanceStr) : undefined

    return {
      externalId: generateExternalId(date, amount, description, position),
      date,
      amount,
      description,
      balance,
      type: amount >= 0 ? 'credit' : 'debit',
      rawData: row as Record<string, unknown>,
    }
  } catch (err) {
    return `Row ${position}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * Main entry point for CSV parsing.
 *
 * Delegates to Papa.parse for tokenisation, then routes each row through
 * the bank-specific row parser (Westpac or NAB) based on header detection.
 *
 * @param content - UTF-8 string contents of the .csv file
 * @returns       - ParseResult with transactions and any non-fatal errors
 */
export function parseCsv(content: string): ParseResult {
  // Papa.parse handles all CSV edge cases: quoted fields, embedded commas,
  // Windows-style line endings (\r\n), etc.
  const parsed = Papa.parse<CsvRow>(content, {
    header: true,           // Use first row as column names
    skipEmptyLines: true,   // Ignore blank rows at end of file
    transformHeader: (h: string) => h.trim(),  // Remove any leading/trailing whitespace from headers
  })

  const headers = parsed.meta.fields ?? []
  const variant = detectVariant(headers)

  // Collect Papa.parse's own structural errors (e.g. wrong column count)
  const parseErrors: string[] = parsed.errors.map((e) => e.message)
  const transactions: ParsedTransaction[] = []

  // If we can't identify the bank, we can't know how to interpret the columns.
  // Return immediately with a clear error — don't try to guess.
  if (variant === 'unknown') {
    parseErrors.push(
      `Unrecognised CSV format. Got headers: [${headers.join(', ')}]. ` +
        `Expected Westpac (Transaction Date, Narration, Debit, Credit) or NAB (Date, Amount, Narrative).`,
    )
    return { transactions, currency: 'AUD', format: 'csv', parseErrors }
  }

  // Parse each data row using the appropriate bank-specific function.
  // i + 1 converts to 1-based position (more natural for error messages).
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]
    if (!row) continue

    const result =
      variant === 'westpac'
        ? parseWestpacRow(row, i + 1)
        : parseNabRow(row, i + 1)

    // String return = a non-fatal error for this row
    if (typeof result === 'string') {
      parseErrors.push(result)
    } else {
      transactions.push(result)
    }
  }

  return { transactions, currency: 'AUD', format: 'csv', parseErrors }
}

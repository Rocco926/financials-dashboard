/**
 * CSV parser for Australian bank exports.
 *
 * SUPPORTED FORMATS
 * ─────────────────
 * This module auto-detects and handles two distinct CSV layouts:
 *
 *   WESTPAC CSV (classic)
 *   ─────────────────────
 *   Exported via: Westpac Online Banking → Transactions → Export → CSV (older flow)
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
 *   WESTPAC CSV (account history export)
 *   ──────────────────────────────────────
 *   Exported via: Westpac Online Banking → Account → Export (newer "Data export" flow)
 *   Headers: Bank Account, Date, Narrative, Debit Amount, Credit Amount,
 *            Balance, Categories, Serial
 *
 *   Key quirks:
 *   • Same split debit/credit approach as classic Westpac, but column names differ:
 *     "Debit Amount" / "Credit Amount" instead of "Debit" / "Credit".
 *   • No signed "Amount" column — must use the split columns.
 *   • "Bank Account" contains the account number (ignored).
 *   • "Categories" and "Serial" are Westpac-internal fields (ignored).
 *
 *   NAB CSV (classic)
 *   ─────────────────
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
 *   NAB CSV (newer "Transactions" export)
 *   ──────────────────────────────────────
 *   Exported via: NAB app / Internet Banking → Transactions → Export
 *   Headers: Date, Amount, Account Number, (blank), Transaction Type,
 *            Transaction Details, Balance, Category, Merchant Name, Processed On
 *
 *   Key quirks:
 *   • Amount is signed (same as classic NAB).
 *   • Date format: "DD Mon YY" e.g. "03 Apr 26" (not DD/MM/YYYY).
 *   • Description is in "Transaction Details" (not "Narrative").
 *   • "Merchant Name" provides a cleaner merchant label when populated.
 *   • Blank 4th column header is a NAB quirk — Papa.parse gives it an empty key.
 *
 * DETECTION
 * ─────────
 * We identify the bank by checking which distinctive headers are present.
 * Westpac classic has "Transaction Date" + "Narration"; Westpac account history
 * has "Narrative" + "Debit Amount" + "Credit Amount"; NAB classic has
 * "Narrative" + "Amount"; NAB newer export has "Transaction Details" + "Amount".
 * If no set matches, we return a clear error explaining what was expected.
 *
 * ERROR HANDLING
 * ──────────────
 * Row-level errors are non-fatal. A file with 100 rows where 3 have a bad date
 * returns 97 valid transactions and 3 error strings. The import route surfaces
 * these errors in the import result modal without aborting the whole import.
 */
import Papa from 'papaparse'
import { parse as parseDate } from 'date-fns'
import { generateExternalId } from '../hash'
import type { ParsedTransaction, ParseResult } from '@finance/types'

/** Each parsed CSV row is a plain object from column name to string value. */
type CsvRow = Record<string, string>

/** Which bank's CSV format was detected from the headers. */
type CsvVariant = 'westpac' | 'westpac2' | 'nab' | 'nab2' | 'macquarie' | 'unknown'

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

  // Westpac classic: "Transaction Date" + "Narration" (older export flow)
  if (set.has('transaction date') && set.has('narration')) return 'westpac'

  // Westpac account history: "Narrative" + "Debit Amount" + "Credit Amount"
  // (newer "Data export" flow — no combined Amount column)
  if (set.has('narrative') && set.has('debit amount') && set.has('credit amount')) return 'westpac2'

  // NAB classic: "Narrative" + a combined signed "Amount" column
  if (set.has('narrative') && set.has('amount')) return 'nab'

  // NAB newer export: "Transaction Details" + "Amount" (no Narrative column)
  if (set.has('transaction details') && set.has('amount')) return 'nab2'

  // Macquarie: "Transaction Date" + "Details" (split Debit/Credit like Westpac,
  // but "Details" distinguishes it from Westpac classic's "Narration")
  if (set.has('transaction date') && set.has('details') && set.has('debit')) return 'macquarie'

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

  // Primary: DD/MM/YYYY (Australian standard, used by Westpac and NAB classic)
  // NOTE: date-fns silently accepts 2-digit years with yyyy (e.g. "04/04/26" → year 26 AD).
  // We only accept the result when the year is >= 100, i.e. a real 4-digit year.
  const slashFull = parseDate(s, 'dd/MM/yyyy', new Date())
  if (!isNaN(slashFull.getTime()) && slashFull.getFullYear() >= 100) return slashFull

  // DD/MM/YY — some bank exports use a 2-digit year (e.g. NAB credit card: "04/04/26")
  // date-fns 'yy' applies century adjustment so '26' → 2026, '99' → 2099.
  const slashShort = parseDate(s, 'dd/MM/yy', new Date())
  if (!isNaN(slashShort.getTime())) return slashShort

  // NAB newer export: "DD Mon YY" e.g. "03 Apr 26"
  // date-fns 'yy' interprets two-digit years relative to the current century,
  // so "26" → 2026, "99" → 2099. Fine for bank statements.
  const nabShort = parseDate(s, 'dd MMM yy', new Date())
  if (!isNaN(nabShort.getTime())) return nabShort

  // Also accept "DD Mon YYYY" e.g. "03 Apr 2026" in case NAB ever switches
  const nabFull = parseDate(s, 'dd MMM yyyy', new Date())
  if (!isNaN(nabFull.getTime())) return nabFull

  // Fallback: YYYY-MM-DD (ISO format)
  const iso = parseDate(s, 'yyyy-MM-dd', new Date())
  if (!isNaN(iso.getTime())) return iso

  throw new Error(`Cannot parse date "${s}" — expected DD/MM/YYYY or DD Mon YY`)
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
 * Parses a single row from a Westpac account history CSV export.
 *
 * This is the newer Westpac "Data export" format (Data_export_DDMMYYYY.csv).
 * Column names differ from classic Westpac but the debit/credit split logic
 * is identical: one column will be populated, the other empty.
 *
 * Headers: Bank Account, Date, Narrative, Debit Amount, Credit Amount,
 *          Balance, Categories, Serial
 *
 * @param row      - A single CSV row as a key→value object
 * @param position - 1-based row number (for error messages and hash generation)
 */
function parseWestpac2Row(
  row: CsvRow,
  position: number,
): ParsedTransaction | string {
  try {
    const dateStr     = (row['Date'] ?? '').trim()
    const debitStr    = (row['Debit Amount'] ?? '').trim()
    const creditStr   = (row['Credit Amount'] ?? '').trim()
    const description = (row['Narrative'] ?? '').trim()
    const balanceStr  = (row['Balance'] ?? '').trim()

    if (!dateStr)     return `Row ${position}: missing Date`
    if (!description) return `Row ${position}: missing Narrative`

    const date = parseAuDate(dateStr)

    let amount: number
    if (creditStr !== '') {
      amount = Math.abs(parseFloat(creditStr))   // money in → positive
    } else if (debitStr !== '') {
      amount = -Math.abs(parseFloat(debitStr))   // money out → negative
    } else {
      return `Row ${position}: both Debit Amount and Credit Amount are empty`
    }

    if (isNaN(amount)) return `Row ${position}: invalid amount`

    const balance = balanceStr !== '' ? parseFloat(balanceStr) : undefined

    return {
      externalId: generateExternalId(date, amount, description, position),
      date,
      amount,
      description,
      balance,
      type:    amount >= 0 ? 'credit' : 'debit',
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
 * Parses a single row from the newer NAB "Transactions" CSV export.
 *
 * This format replaced "Narrative" with "Transaction Details" and uses a
 * "DD Mon YY" date style (e.g. "03 Apr 26"). It also exposes a "Merchant Name"
 * column which, when populated, provides a cleaner label than the raw details.
 *
 * Headers: Date, Amount, Account Number, (blank), Transaction Type,
 *          Transaction Details, Balance, Category, Merchant Name, Processed On
 *
 * @param row      - A single CSV row as a key→value object
 * @param position - 1-based row number (for error messages and hash generation)
 */
function parseNab2Row(
  row: CsvRow,
  position: number,
): ParsedTransaction | string {
  try {
    const dateStr     = (row['Date'] ?? '').trim()
    const amountStr   = (row['Amount'] ?? '').trim()
    const details     = (row['Transaction Details'] ?? '').trim()
    const balanceStr  = (row['Balance'] ?? '').trim()

    if (!dateStr)   return `Row ${position}: missing Date`
    if (!amountStr) return `Row ${position}: missing Amount`
    if (!details)   return `Row ${position}: missing Transaction Details`

    const date   = parseAuDate(dateStr)
    const amount = parseFloat(amountStr)
    if (isNaN(amount)) return `Row ${position}: invalid amount "${amountStr}"`

    const balance = balanceStr !== '' ? parseFloat(balanceStr) : undefined

    // NAB provides a cleaner "Merchant Name" column and a "Category" column.
    // We surface both as optional fields on ParsedTransaction so the import
    // route can use them to pre-populate merchant and suggest a category
    // without needing keyword matching.
    const merchantName      = (row['Merchant Name'] ?? '').trim() || undefined
    const suggestedCategory = (row['Category'] ?? '').trim() || undefined

    // Use Transaction Details as the canonical description for deduplication
    // (Merchant Name is bonus metadata, not stable enough for externalId)
    return {
      externalId: generateExternalId(date, amount, details, position),
      date,
      amount,
      description: details,
      balance,
      type:    amount >= 0 ? 'credit' : 'debit',
      merchantName,
      suggestedCategory,
      rawData: row as Record<string, unknown>,
    }
  } catch (err) {
    return `Row ${position}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * Parses a single row from a Macquarie Bank CSV export.
 *
 * Macquarie uses separate Debit and Credit columns (both positive, like Westpac),
 * but calls the description column "Details" and provides "Original Description"
 * as the raw bank-side merchant string. It also exports a "Category" column
 * which we surface as a suggestedCategory hint for auto-categorisation.
 *
 * Headers: Transaction Date, Details, Account, Category, Subcategory,
 *          Tags, Notes, Debit, Credit, Balance, Original Description
 *
 * @param row      - A single CSV row as a key→value object
 * @param position - 1-based row number (for error messages and hash generation)
 */
function parseMacquarieRow(
  row: CsvRow,
  position: number,
): ParsedTransaction | string {
  try {
    const dateStr     = (row['Transaction Date'] ?? '').trim()
    const debitStr    = (row['Debit'] ?? '').trim()
    const creditStr   = (row['Credit'] ?? '').trim()
    const description = (row['Details'] ?? '').trim()
    const balanceStr  = (row['Balance'] ?? '').trim()

    if (!dateStr)     return `Row ${position}: missing Transaction Date`
    if (!description) return `Row ${position}: missing Details`

    const date = parseAuDate(dateStr)

    // Macquarie uses the same split Debit/Credit pattern as Westpac:
    // Credit populated → money in (positive), Debit populated → money out (negative).
    let amount: number
    if (creditStr !== '') {
      amount = Math.abs(parseFloat(creditStr))
    } else if (debitStr !== '') {
      amount = -Math.abs(parseFloat(debitStr))
    } else {
      return `Row ${position}: both Debit and Credit are empty`
    }

    if (isNaN(amount)) return `Row ${position}: invalid amount`

    const balance = balanceStr !== '' ? parseFloat(balanceStr) : undefined

    // "Original Description" is the raw bank-provided text (more stable for
    // deduplication/display). "Details" is the user-facing cleaned label.
    const originalDesc      = (row['Original Description'] ?? '').trim()
    const suggestedCategory = (row['Category'] ?? '').trim() || undefined

    return {
      externalId: generateExternalId(date, amount, description, position),
      date,
      amount,
      description,
      balance,
      type:    amount >= 0 ? 'credit' : 'debit',
      // Use Original Description as merchantName when it differs from Details
      merchantName:      originalDesc && originalDesc !== description ? originalDesc : undefined,
      suggestedCategory,
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
        `Expected Westpac classic (Transaction Date, Narration, Debit, Credit), ` +
        `Westpac export (Date, Narrative, Debit Amount, Credit Amount), ` +
        `NAB classic (Date, Amount, Narrative), ` +
        `NAB export (Date, Amount, Transaction Details), ` +
        `or Macquarie (Transaction Date, Details, Debit, Credit).`,
    )
    return { transactions, currency: 'AUD', format: 'csv', parseErrors }
  }

  // Parse each data row using the appropriate bank-specific function.
  // i + 1 converts to 1-based position (more natural for error messages).
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]
    if (!row) continue

    const result =
      variant === 'westpac'   ? parseWestpacRow(row, i + 1) :
      variant === 'westpac2'  ? parseWestpac2Row(row, i + 1) :
      variant === 'nab2'      ? parseNab2Row(row, i + 1) :
      variant === 'macquarie' ? parseMacquarieRow(row, i + 1) :
                                parseNabRow(row, i + 1)

    // String return = a non-fatal error for this row
    if (typeof result === 'string') {
      parseErrors.push(result)
    } else {
      transactions.push(result)
    }
  }

  return { transactions, currency: 'AUD', format: 'csv', parseErrors }
}

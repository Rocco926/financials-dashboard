/**
 * OFX / QBO parser.
 *
 * WHY NO LIBRARY?
 * ───────────────
 * The most-used OFX npm library (ofx-js) has an uncertain maintenance
 * status and an API I couldn't verify without installing it. More importantly,
 * Australian bank OFX files are typically in SGML format (not valid XML), so
 * standard XML parsers fail on them. A regex/string-based approach is more
 * robust for our use case.
 *
 * OFX FORMAT OVERVIEW
 * ───────────────────
 * OFX (Open Financial Exchange) is the dominant file format for Australian
 * bank statement exports. Westpac, ANZ, and most credit card issuers support it.
 *
 * There are two OFX variants in the wild:
 *
 *   OFX SGML (older, most Australian banks):
 *   ─────────────────────────────────────────
 *   Tags look like XML but WITHOUT closing tags. Each record implicitly ends
 *   when the next record begins. The file also has a plaintext header block.
 *
 *   OFXHEADER:100
 *   DATA:OFXSGML
 *   ...
 *   <OFX>
 *   <STMTTRN>
 *   <TRNTYPE>DEBIT
 *   <DTPOSTED>20240329120000[+10:AEST]
 *   <TRNAMT>-45.50
 *   <FITID>20240329-WBC-001
 *   <NAME>WOOLWORTHS 1234 SYDNEY
 *   <STMTTRN>         ← next record starts, previous implicitly ended
 *   ...
 *
 *   OFX XML (newer spec, less common):
 *   ────────────────────────────────────
 *   Proper XML with opening and closing tags.
 *   <STMTTRN>
 *     <TRNTYPE>DEBIT</TRNTYPE>
 *     <DTPOSTED>20240329120000</DTPOSTED>
 *     ...
 *   </STMTTRN>
 *
 * This parser handles BOTH variants by trying XML first, then SGML.
 *
 * QBO NOTE
 * ────────
 * QBO (QuickBooks Online) format is structurally identical to OFX SGML.
 * This function accepts 'ofx' or 'qbo' and records it in the ParseResult.
 *
 * DEDUPLICATION
 * ─────────────
 * OFX files include a <FITID> tag (Financial Institution Transaction ID).
 * This is a unique string assigned by the bank — we use it directly as the
 * `externalId` rather than generating a hash. This is more stable because it
 * means the externalId survives even if the bank changes the transaction order
 * or description between exports.
 *
 * KEY FIELDS EXTRACTED
 * ────────────────────
 *   <DTPOSTED>   Transaction date (YYYYMMDDHHMMSS[+offset:TZ])
 *   <TRNAMT>     Amount, already signed (negative for debits)
 *   <FITID>      Unique transaction ID (used as externalId)
 *   <NAME>       Merchant/payee name (preferred)
 *   <MEMO>       Description fallback if NAME absent
 *   <ACCTID>     Account number (used to suggest account name)
 *   <CURDEF>     Currency code (e.g. AUD)
 */
import { generateExternalId } from '../hash'
import type { FileFormat, ParsedTransaction, ParseResult } from '@finance/types'

/**
 * Extracts the value of a single OFX tag from a string of OFX content.
 *
 * Works for both SGML and XML OFX because we only look for the opening tag
 * pattern `<TAGNAME>value`. In XML the closing tag follows immediately, so
 * our `[^<\r\n]+` match naturally stops before it.
 *
 * @param content - A chunk of OFX text (the whole file or a block)
 * @param name    - The tag name to find, case-insensitive (e.g. 'DTPOSTED')
 * @returns       - The trimmed tag value, or undefined if the tag is absent
 */
function tag(content: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([^<\\r\\n]+)`, 'i').exec(content)
  return m?.[1]?.trim()
}

/**
 * Extracts all `<STMTTRN>` transaction blocks from an OFX file.
 *
 * STMTTRN = Statement Transaction — each one represents a single bank transaction.
 *
 * Strategy:
 * 1. Try XML mode first: look for <STMTTRN>...</STMTTRN> pairs with closing tags.
 * 2. If that finds nothing, fall back to SGML mode: split the content on each
 *    opening <STMTTRN> tag and treat each resulting chunk as one record.
 *
 * @param content - Full OFX file content as a string
 * @returns       - Array of content strings, each containing one transaction's tags
 */
function extractTransactionBlocks(content: string): string[] {
  // ── Attempt 1: XML format (proper closing tags) ────────────────────────────
  const xmlMatches: string[] = []
  const xmlRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let m
  while ((m = xmlRe.exec(content)) !== null) {
    if (m[1]) xmlMatches.push(m[1])
  }
  if (xmlMatches.length > 0) return xmlMatches

  // ── Attempt 2: SGML format (no closing tags) ───────────────────────────────
  // Splitting on <STMTTRN> gives us:
  //   parts[0] = everything before the first STMTTRN (file header, account info)
  //   parts[1] = first transaction's tags, ending where the next <STMTTRN> begins
  //   parts[2] = second transaction's tags, etc.
  const parts = content.split(/<STMTTRN>/i)
  // Discard parts[0] (the file header); everything else is a transaction block
  return parts.slice(1).map((p) => p.trim()).filter(Boolean)
}

/**
 * Parses the OFX date format into a JavaScript Date.
 *
 * OFX dates look like: 20240329120000[+10:AEST]
 *   - YYYYMMDD    : the date (characters 0–7)
 *   - HHMMSS      : time (characters 8–13) — we discard this
 *   - [+10:AEST]  : timezone offset annotation — we discard this too
 *
 * We only need the date for our data model; bank transactions are recorded
 * per day, not per minute.
 *
 * @param raw - Raw OFX date string
 * @returns   - Date object representing midnight on that calendar date
 * @throws    - If the year/month/day portions can't be parsed as integers
 */
function parseOfxDate(raw: string): Date {
  // Strip the optional timezone annotation: [+10:AEST], [-5:EST], etc.
  const cleaned = raw.replace(/\[.*\]/, '').trim()

  const year  = parseInt(cleaned.slice(0, 4), 10)
  const month = parseInt(cleaned.slice(4, 6), 10) - 1  // JS months are 0-indexed
  const day   = parseInt(cleaned.slice(6, 8), 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Cannot parse OFX date "${raw}"`)
  }

  // Use local midnight — no timezone conversion needed for date-only values
  return new Date(year, month, day)
}

/**
 * Parses a single STMTTRN block (one bank transaction) into a ParsedTransaction.
 *
 * Returns a ParsedTransaction on success, or an error string on failure.
 * Returning a string (instead of throwing) keeps row-level errors non-fatal.
 *
 * @param block    - The content between two <STMTTRN> markers
 * @param position - 1-based index (for error messages and fallback hash)
 */
function parseTransactionBlock(
  block: string,
  position: number,
): ParsedTransaction | string {
  try {
    const dtPosted = tag(block, 'DTPOSTED')
    const trnAmt   = tag(block, 'TRNAMT')
    const fitId    = tag(block, 'FITID')
    // NAME is the merchant/payee; MEMO is a fallback description. Try NAME first.
    const name     = tag(block, 'NAME') ?? tag(block, 'MEMO') ?? ''

    // Both date and amount are mandatory — the bank should always include them
    if (!dtPosted) return `Transaction ${position}: missing DTPOSTED`
    if (!trnAmt)   return `Transaction ${position}: missing TRNAMT`

    const date   = parseOfxDate(dtPosted)
    const amount = parseFloat(trnAmt)

    if (isNaN(amount)) return `Transaction ${position}: invalid TRNAMT "${trnAmt}"`

    const description = name.trim()

    // FITID strategy:
    // If the bank provides a FITID (they almost always do for OFX), use it
    // directly — it's already unique within the file and stable across re-exports.
    // If FITID is somehow absent, fall back to our hash-based approach.
    const externalId =
      fitId && fitId.trim()
        ? fitId.trim()
        : generateExternalId(date, amount, description, position)

    return {
      externalId,
      date,
      amount,
      description,
      // OFX files do not include a per-transaction running balance.
      // (The <LEDGERBAL> tag exists but gives the final balance, not per-row.)
      type: amount >= 0 ? 'credit' : 'debit',
      rawData: { dtPosted, trnAmt, name, fitId } as Record<string, unknown>,
    }
  } catch (err) {
    return `Transaction ${position}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * Main entry point for OFX and QBO parsing.
 *
 * @param content - UTF-8 string contents of the .ofx or .qbo file
 * @param format  - Whether the file has a .ofx or .qbo extension (recorded in output)
 * @returns       - ParseResult with transactions and any non-fatal errors
 */
export function parseOfx(content: string, format: 'ofx' | 'qbo'): ParseResult {
  const parseErrors: string[] = []
  const transactions: ParsedTransaction[] = []

  // Extract all transaction blocks (handles both SGML and XML OFX)
  const blocks = extractTransactionBlocks(content)

  if (blocks.length === 0) {
    parseErrors.push('No <STMTTRN> blocks found in OFX/QBO file')
    return { transactions, currency: 'AUD', format, parseErrors }
  }

  // Attempt to extract account metadata from the file header.
  // OFX files typically include ACCTID (account number) in BANKACCTFROM.
  const acctId      = tag(content, 'ACCTID')
  const accountName = acctId ? `Account ${acctId}` : undefined

  // CURDEF tag declares the currency. Default to AUD for Australian banks.
  const currency = tag(content, 'CURDEF') ?? 'AUD'

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (!block) continue

    const result = parseTransactionBlock(block, i + 1)

    if (typeof result === 'string') {
      // Non-fatal error for this transaction — record and continue
      parseErrors.push(result)
    } else {
      transactions.push(result)
    }
  }

  return { transactions, accountName, currency, format, parseErrors }
}

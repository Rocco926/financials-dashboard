/**
 * @module @finance/parsers
 *
 * The core parsing library for the finance dashboard.
 *
 * RESPONSIBILITIES
 * ────────────────
 * 1. Detect the file format from its extension (.csv, .qif, .ofx, .qbo)
 * 2. Delegate to the appropriate parser (CSV, QIF, or OFX)
 * 3. Return a normalised ParseResult regardless of source format
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * • Framework-agnostic: this package has zero Next.js dependencies.
 *   It only uses Node.js built-ins (crypto, path) and papaparse/date-fns.
 *   This makes it independently unit-testable with Vitest.
 *
 * • Non-fatal errors: parse errors at the row level are collected into
 *   ParseResult.parseErrors rather than thrown. A 100-row file with 3 bad
 *   rows still returns 97 valid transactions.
 *
 * • Idempotent: re-parsing the same file always produces the same externalIds.
 *   The database layer enforces uniqueness via ON CONFLICT DO NOTHING.
 *
 * USAGE
 * ─────
 * ```typescript
 * import { parse } from '@finance/parsers'
 *
 * const fileContent = await file.text()  // from browser File API or fs.readFileSync
 * const result = parse(fileContent, file.name)
 *
 * console.log(result.transactions)  // ParsedTransaction[]
 * console.log(result.parseErrors)   // string[] (non-fatal warnings)
 * console.log(result.format)        // 'csv' | 'qif' | 'ofx' | 'qbo'
 * ```
 */
import { detectFormat } from './detect'
import { parseCsv } from './parsers/csv'
import { parseQif } from './parsers/qif'
import { parseOfx } from './parsers/ofx'
import type { FileFormat, ParseResult } from '@finance/types'

// Re-export types so consumers can import everything from '@finance/parsers'
// without also needing '@finance/types' as a direct dependency.
export type { ParsedTransaction, ParseResult, FileFormat } from '@finance/types'
export { detectFormat } from './detect'
export { generateExternalId } from './hash'

/**
 * Parses a bank export file into normalised transactions.
 *
 * This is the single public entry point for the parsers package.
 * All parsing logic is encapsulated here — callers don't need to
 * know which parser handles which format.
 *
 * EXHAUSTIVENESS CHECK
 * ────────────────────
 * The `default` branch assigns to a `never`-typed variable. TypeScript will
 * produce a compile error if a new FileFormat value is ever added to the union
 * in @finance/types without a corresponding case being added here. This ensures
 * new formats can't be silently unhandled.
 *
 * @param content  - UTF-8 string contents of the bank export file.
 *                   Call `file.text()` in the browser or `fs.readFileSync(path, 'utf-8')`
 *                   in Node.js to get this.
 * @param filename - The original filename, including extension (e.g. "westpac.csv").
 *                   Used only for format detection — the content is what gets parsed.
 * @returns        - ParseResult containing transactions and any non-fatal errors.
 * @throws         - If the file extension is not recognised (.csv/.qif/.ofx/.qbo).
 *                   Row-level parse errors are NOT thrown — they're in parseErrors.
 */
export function parse(content: string, filename: string): ParseResult {
  const format: FileFormat = detectFormat(filename)

  switch (format) {
    case 'csv':
      return parseCsv(content)

    case 'qif':
      return parseQif(content)

    case 'ofx':
    case 'qbo':
      // QBO is structurally identical to OFX — same parser, different format label
      return parseOfx(content, format)

    default: {
      // TypeScript exhaustiveness check: this branch is unreachable at runtime
      // but ensures compile-time safety if FileFormat ever gains a new variant.
      const _exhaustive: never = format
      throw new Error(`Unhandled format: ${String(_exhaustive)}`)
    }
  }
}

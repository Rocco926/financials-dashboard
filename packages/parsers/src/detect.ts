/**
 * File format detection.
 *
 * We detect format purely from the file extension — this is the simplest
 * reliable approach for bank exports where the extension is always correct.
 *
 * WHY NOT CONTENT SNIFFING?
 * ─────────────────────────
 * Content sniffing (reading the first N bytes) would work but adds complexity.
 * OFX SGML files don't have a standard magic byte sequence. QIF always starts
 * with "!Type:" but CSVs vary. The extension is reliable because the user is
 * manually downloading these files from their bank's export UI, so the bank
 * sets the extension correctly.
 *
 * QBO NOTE:
 * ─────────
 * QBO (QuickBooks Online format) is structurally identical to OFX — same SGML
 * tag structure, same field names. The only difference is the file extension.
 * This function returns 'qbo' rather than 'ofx' for .qbo files, and the OFX
 * parser accepts both so it can record the original format in ParseResult.
 */
import { extname } from 'node:path'
import type { FileFormat } from '@finance/types'

/**
 * Detects the file format from the filename's extension.
 *
 * @param filename - The original filename (e.g. "westpac-export.csv")
 * @returns        - The corresponding FileFormat literal
 * @throws         - If the extension is not one of the four supported types
 *
 * @example
 *   detectFormat('transactions.csv')  // → 'csv'
 *   detectFormat('export.QIF')        // → 'qif'  (case-insensitive)
 *   detectFormat('statement.ofx')     // → 'ofx'
 *   detectFormat('westpac.qbo')       // → 'qbo'
 */
export function detectFormat(filename: string): FileFormat {
  // extname returns ".csv", toLowerCase → ".csv", replace → "csv"
  const ext = extname(filename).toLowerCase().replace('.', '')

  switch (ext) {
    case 'csv':
      return 'csv'
    case 'qif':
      return 'qif'
    case 'ofx':
      return 'ofx'
    case 'qbo':
      // QBO is OFX under the hood — handled by the same parser
      return 'qbo'
    default:
      throw new Error(
        `Unsupported file extension ".${ext}". ` +
          `Supported formats: .csv (Westpac/NAB), .qif (Westpac/NAB), ` +
          `.ofx (Westpac/credit cards), .qbo (Westpac/credit cards)`,
      )
  }
}

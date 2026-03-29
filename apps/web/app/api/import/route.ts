/**
 * POST /api/import
 *
 * The core import endpoint. Accepts one or more bank export files, parses them
 * using @finance/parsers, and upserts the transactions into the database.
 *
 * REQUEST FORMAT
 * ──────────────
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   files         (required) — One or more File objects (bank export files).
 *                              Supports .csv, .qif, .ofx, .qbo extensions.
 *   accountId     (optional) — UUID of an existing account to assign transactions to.
 *                              If provided, `accountName`/`institution`/`accountType` are ignored.
 *   accountName   (required if no accountId) — Name for the new account
 *   institution   (required if no accountId) — Bank name (e.g. "Westpac")
 *   accountType   (required if no accountId) — One of: transaction|savings|credit_card|loan
 *
 * RESPONSE FORMAT (200 OK)
 * ─────────────────────────
 * {
 *   imported:  number,    // Transactions successfully inserted as new rows
 *   skipped:   number,    // Transactions skipped (already existed via external_id conflict)
 *   errors:    string[],  // Non-fatal parse or insert warnings
 *   accountId: string     // UUID of the account transactions were assigned to
 * }
 *
 * DEDUPLICATION MECHANISM
 * ────────────────────────
 * Every transaction row has a UNIQUE constraint on `external_id`.
 * We use INSERT ... ON CONFLICT (external_id) DO NOTHING for every row.
 * If the row already exists (same externalId), the insert is silently skipped
 * and counted as `skipped`. This makes re-importing the same file safe.
 *
 * ACCOUNT RESOLUTION
 * ──────────────────
 * Two paths:
 *   1. `accountId` provided → verify it exists, use it directly.
 *   2. `accountId` not provided → try to INSERT a new account with the given
 *      name. If a name conflict occurs (account already exists with that name),
 *      we look it up and use the existing one. This handles the edge case where
 *      the user types the same account name for two different imports.
 *
 * ERROR HANDLING
 * ──────────────
 * File-level errors (unsupported extension, unparseable file) skip that file
 * and continue processing remaining files.
 * Row-level errors (bad date, empty amount) are collected into `errors` but
 * don't abort the import.
 * Network/database errors propagate as 500 responses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { accounts, transactions, importLog } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { parse } from '@finance/parsers'
import { z } from 'zod'

/**
 * Validates the account creation fields when creating a new account during import.
 * Only checked when `accountId` is NOT provided in the form data.
 */
const formSchema = z.object({
  accountName:  z.string().min(1),
  institution:  z.string().min(1),
  accountType:  z.enum(['transaction', 'savings', 'credit_card', 'loan']),
  accountId:    z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  // Auth guard — middleware should have caught unauthenticated requests already,
  // but we check here too as a second layer of defence.
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  // `getAll('files')` returns all values for the 'files' field name.
  // The import UI sends each file as a separate 'files' field entry.
  const files = formData.getAll('files') as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  // ── Step 1: Resolve which account transactions belong to ──────────────────

  let accountId: string

  const existingId = formData.get('accountId') as string | null

  if (existingId) {
    // User selected an existing account from the import UI's account picker.
    // Verify it actually exists before proceeding.
    const [existing] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, existingId))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 400 })
    }
    accountId = existing.id
  } else {
    // User is creating a new account. Validate the required fields.
    const metaFields = {
      accountName:  formData.get('accountName'),
      institution:  formData.get('institution'),
      accountType:  formData.get('accountType'),
    }
    const parsed = formSchema.safeParse(metaFields)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing account details', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    // INSERT ... ON CONFLICT DO NOTHING handles the case where an account
    // with this name already exists. If the insert was a no-op, `created`
    // will be undefined and we fall through to the lookup.
    const [created] = await db
      .insert(accounts)
      .values({
        name:        parsed.data.accountName,
        institution: parsed.data.institution,
        type:        parsed.data.accountType,
      })
      .onConflictDoNothing()
      .returning({ id: accounts.id })

    if (!created) {
      // Account name already taken — find the existing account with this name
      const [found] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.name, parsed.data.accountName))
        .limit(1)

      if (!found) {
        // Should never happen (onConflictDoNothing only fires on a conflict,
        // meaning the row exists, so the lookup should succeed)
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
      }
      accountId = found.id
    } else {
      accountId = created.id
    }
  }

  // ── Step 2: Process each uploaded file ────────────────────────────────────

  let totalImported = 0
  let totalSkipped  = 0
  const allErrors:  string[] = []

  for (const file of files) {
    // Read the file content as UTF-8 text.
    // The File API's .text() method handles encoding automatically.
    const content = await file.text()
    let parseResult

    try {
      // parse() detects format from file extension and delegates to the
      // appropriate parser (CSV, QIF, or OFX). Throws only for unsupported
      // file extensions — row-level errors go into parseResult.parseErrors.
      parseResult = parse(content, file.name)
    } catch (err) {
      allErrors.push(
        `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      )
      continue  // Skip this file, try the next one
    }

    // Collect non-fatal parse warnings from the parser (prefixed with filename)
    allErrors.push(...parseResult.parseErrors.map((e) => `${file.name}: ${e}`))

    let fileImported = 0
    let fileSkipped  = 0

    // Insert each parsed transaction into the database.
    // We insert one-by-one (not in bulk) so we can track individual conflicts.
    for (const tx of parseResult.transactions) {
      try {
        const inserted = await db
          .insert(transactions)
          .values({
            externalId:  tx.externalId,
            accountId,
            date:        tx.date.toISOString().split('T')[0]!,  // → 'YYYY-MM-DD'
            amount:      String(tx.amount),                       // numeric → string for Drizzle
            description: tx.description,
            merchant:    tx.description,  // User can edit this later via the transactions page
            type:        tx.type,
            balance:     tx.balance !== undefined ? String(tx.balance) : null,
            rawData:     tx.rawData,
          })
          .onConflictDoNothing({ target: transactions.externalId })
          .returning({ id: transactions.id })

        // .returning() returns rows that were actually inserted.
        // An empty array means the conflict fired and the row was skipped.
        if (inserted.length > 0) {
          fileImported++
        } else {
          fileSkipped++
        }
      } catch (err) {
        allErrors.push(
          `${file.name} tx ${tx.externalId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    // Write one import_log row per file for the audit trail.
    await db.insert(importLog).values({
      filename:               file.name,
      format:                 parseResult.format,
      accountId,
      transactionsImported:   fileImported,
      transactionsSkipped:    fileSkipped,
      parseErrors:            parseResult.parseErrors,
    })

    totalImported += fileImported
    totalSkipped  += fileSkipped
  }

  // ── Step 3: Update account's lastImportedAt timestamp ─────────────────────

  // This timestamp is shown in the accounts list so the user can see when
  // data for each account was last refreshed.
  await db
    .update(accounts)
    .set({ lastImportedAt: new Date() })
    .where(eq(accounts.id, accountId))

  return NextResponse.json({
    imported:  totalImported,
    skipped:   totalSkipped,
    errors:    allErrors,
    accountId,
  })
}

/**
 * GET /api/import — Not a real endpoint.
 * Exists only to prevent Next.js from generating a 405 error if someone
 * accidentally GET-requests this route.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ message: 'Use POST to import files' })
}

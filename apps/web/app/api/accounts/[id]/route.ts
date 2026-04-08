/**
 * DELETE /api/accounts/[id]
 *
 * Deletes a single account. Because the transactions table has
 * accountId FK with ON DELETE CASCADE, all associated transactions
 * are removed automatically by the database.
 *
 * Returns { success: true } on success or 404 if the account wasn't found.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { accounts } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [deleted] = await db
    .delete(accounts)
    .where(eq(accounts.id, params.id))
    .returning({ id: accounts.id })

  if (!deleted) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}

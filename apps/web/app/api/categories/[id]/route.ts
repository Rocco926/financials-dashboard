/**
 * PATCH /api/categories/[id]
 *
 * Reserved for future category edits (name, colour, etc.).
 * Budget amounts are now managed via /api/budgets — see that route.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function PATCH() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}

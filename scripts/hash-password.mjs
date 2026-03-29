#!/usr/bin/env node
/**
 * One-time utility to generate a bcrypt hash for ADMIN_PASSWORD.
 * Usage: pnpm hash-password
 * Then copy the output hash into your .env file as ADMIN_PASSWORD=...
 */
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

async function main() {
  // bcryptjs must be installed in apps/web
  let bcrypt
  try {
    bcrypt = require('./apps/web/node_modules/bcryptjs')
  } catch {
    try {
      bcrypt = require('bcryptjs')
    } catch {
      console.error('bcryptjs not found. Run: pnpm install first.')
      process.exit(1)
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr })

  rl.question('Enter password to hash: ', async (password) => {
    rl.close()
    if (!password) {
      console.error('Password cannot be empty.')
      process.exit(1)
    }
    const hash = await bcrypt.hash(password, 12)
    console.log('\nAdd this to your .env file:')
    console.log(`ADMIN_PASSWORD=${hash}`)
  })
}

main()

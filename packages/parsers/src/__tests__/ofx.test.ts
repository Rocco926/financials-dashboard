import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseOfx } from '../parsers/ofx.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('parseOfx', () => {
  const result = parseOfx(fixture('sample.ofx'), 'ofx')

  it('detects format as ofx', () => {
    expect(result.format).toBe('ofx')
  })

  it('parses 3 transactions', () => {
    expect(result.transactions).toHaveLength(3)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('uses FITID as externalId', () => {
    expect(result.transactions[0]!.externalId).toBe('20240329-WBC-001')
    expect(result.transactions[1]!.externalId).toBe('20240328-WBC-001')
  })

  it('parses TRNAMT as signed amount', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.amount).toBe(-45.5)
    expect(woolworths.type).toBe('debit')

    const salary = result.transactions.find((t) =>
      t.description.includes('SALARY'),
    )!
    expect(salary.amount).toBe(3000)
    expect(salary.type).toBe('credit')
  })

  it('parses DTPOSTED date correctly', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.date.getFullYear()).toBe(2024)
    expect(woolworths.date.getMonth()).toBe(2) // March
    expect(woolworths.date.getDate()).toBe(29)
  })

  it('extracts currency from CURDEF', () => {
    expect(result.currency).toBe('AUD')
  })

  it('extracts account name from ACCTID', () => {
    expect(result.accountName).toBe('Account 123456789')
  })
})

describe('parseOfx — error handling', () => {
  it('returns parse error for empty content', () => {
    const result = parseOfx('<OFX></OFX>', 'ofx')
    expect(result.transactions).toHaveLength(0)
    expect(result.parseErrors.length).toBeGreaterThan(0)
  })
})

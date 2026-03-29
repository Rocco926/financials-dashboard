import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseQif } from '../parsers/qif.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('parseQif', () => {
  const result = parseQif(fixture('sample.qif'))

  it('detects format as qif', () => {
    expect(result.format).toBe('qif')
  })

  it('parses 5 transactions', () => {
    expect(result.transactions).toHaveLength(5)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('parses debit as negative', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.toLowerCase().includes('woolworths'),
    )!
    expect(woolworths.amount).toBe(-45.5)
    expect(woolworths.type).toBe('debit')
  })

  it('parses credit as positive', () => {
    const salary = result.transactions.find((t) =>
      t.description.toLowerCase().includes('salary'),
    )!
    expect(salary.amount).toBe(3000)
    expect(salary.type).toBe('credit')
  })

  it('strips commas from amounts like -1,234.56', () => {
    const rent = result.transactions.find((t) =>
      t.description.toLowerCase().includes('rent'),
    )!
    expect(rent.amount).toBe(-1234.56)
  })

  it('parses DD/MM/YYYY dates correctly', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.toLowerCase().includes('woolworths'),
    )!
    expect(woolworths.date.getFullYear()).toBe(2024)
    expect(woolworths.date.getMonth()).toBe(2) // March
    expect(woolworths.date.getDate()).toBe(29)
  })

  it('does not include balance (QIF has no balance field)', () => {
    for (const t of result.transactions) {
      expect(t.balance).toBeUndefined()
    }
  })

  it('generates deterministic externalIds', () => {
    const result2 = parseQif(fixture('sample.qif'))
    expect(result.transactions[0]!.externalId).toBe(
      result2.transactions[0]!.externalId,
    )
  })

  it('generates unique externalIds', () => {
    const ids = result.transactions.map((t) => t.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

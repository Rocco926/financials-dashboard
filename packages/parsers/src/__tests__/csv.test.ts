import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseCsv } from '../parsers/csv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('parseCsv — Westpac', () => {
  const result = parseCsv(fixture('westpac.csv'))

  it('detects format as csv', () => {
    expect(result.format).toBe('csv')
  })

  it('parses all 5 transactions', () => {
    expect(result.transactions).toHaveLength(5)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('normalises debit as negative amount', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )
    expect(woolworths).toBeDefined()
    expect(woolworths!.amount).toBe(-45.5)
    expect(woolworths!.type).toBe('debit')
  })

  it('normalises credit as positive amount', () => {
    const salary = result.transactions.find((t) =>
      t.description.includes('SALARY'),
    )
    expect(salary).toBeDefined()
    expect(salary!.amount).toBe(3000)
    expect(salary!.type).toBe('credit')
  })

  it('parses DD/MM/YYYY dates correctly', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.date.getFullYear()).toBe(2024)
    expect(woolworths.date.getMonth()).toBe(2) // 0-indexed: March = 2
    expect(woolworths.date.getDate()).toBe(29)
  })

  it('includes running balance', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.balance).toBe(1234.56)
  })

  it('generates deterministic externalId', () => {
    const result2 = parseCsv(fixture('westpac.csv'))
    expect(result.transactions[0]!.externalId).toBe(
      result2.transactions[0]!.externalId,
    )
  })

  it('generates unique externalIds per transaction', () => {
    const ids = result.transactions.map((t) => t.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('parseCsv — Westpac account history export (westpac2)', () => {
  const result = parseCsv(fixture('westpac2.csv'))

  it('detects format as csv', () => {
    expect(result.format).toBe('csv')
  })

  it('parses all 5 transactions with no errors', () => {
    expect(result.transactions).toHaveLength(5)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('normalises Debit Amount as negative', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )
    expect(woolworths).toBeDefined()
    expect(woolworths!.amount).toBe(-45.5)
    expect(woolworths!.type).toBe('debit')
  })

  it('normalises Credit Amount as positive', () => {
    const salary = result.transactions.find((t) =>
      t.description.includes('SALARY'),
    )
    expect(salary).toBeDefined()
    expect(salary!.amount).toBe(3000)
    expect(salary!.type).toBe('credit')
  })

  it('parses DD/MM/YYYY dates correctly', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.date.getFullYear()).toBe(2024)
    expect(woolworths.date.getMonth()).toBe(2) // March = 2 (0-indexed)
    expect(woolworths.date.getDate()).toBe(29)
  })

  it('includes running balance', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.balance).toBe(1234.56)
  })

  it('generates deterministic externalIds', () => {
    const result2 = parseCsv(fixture('westpac2.csv'))
    expect(result.transactions[0]!.externalId).toBe(
      result2.transactions[0]!.externalId,
    )
  })

  it('generates unique externalIds per transaction', () => {
    const ids = result.transactions.map((t) => t.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('parseCsv — NAB', () => {
  const result = parseCsv(fixture('nab.csv'))

  it('parses all 5 transactions', () => {
    expect(result.transactions).toHaveLength(5)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('uses signed Amount column directly', () => {
    const coles = result.transactions.find((t) =>
      t.description.includes('COLES SUPERMARKETS'),
    )!
    expect(coles.amount).toBe(-45.5)
    expect(coles.type).toBe('debit')
  })

  it('handles large debit amounts', () => {
    const rent = result.transactions.find((t) =>
      t.description.includes('RENT'),
    )!
    expect(rent.amount).toBe(-1234.56)
  })
})

describe('parseCsv — NAB newer export (nab2)', () => {
  const result = parseCsv(fixture('nab2.csv'))

  it('detects format as csv', () => {
    expect(result.format).toBe('csv')
  })

  it('parses all 5 transactions with no errors', () => {
    expect(result.transactions).toHaveLength(5)
    expect(result.parseErrors).toHaveLength(0)
  })

  it('normalises debit as negative amount', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )
    expect(woolworths).toBeDefined()
    expect(woolworths!.amount).toBe(-45.5)
    expect(woolworths!.type).toBe('debit')
  })

  it('normalises credit as positive amount', () => {
    const salary = result.transactions.find((t) =>
      t.description.includes('SALARY'),
    )
    expect(salary).toBeDefined()
    expect(salary!.amount).toBe(3000)
    expect(salary!.type).toBe('credit')
  })

  it('parses DD Mon YY dates correctly', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.date.getFullYear()).toBe(2024)
    expect(woolworths.date.getMonth()).toBe(2) // March = 2 (0-indexed)
    expect(woolworths.date.getDate()).toBe(29)
  })

  it('includes running balance', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.balance).toBe(-1234.56)
  })

  it('uses Transaction Details as description', () => {
    const woolworths = result.transactions.find((t) =>
      t.description.includes('WOOLWORTHS'),
    )!
    expect(woolworths.description).toContain('WOOLWORTHS METRO')
  })

  it('generates deterministic externalIds', () => {
    const result2 = parseCsv(fixture('nab2.csv'))
    expect(result.transactions[0]!.externalId).toBe(
      result2.transactions[0]!.externalId,
    )
  })

  it('generates unique externalIds per transaction', () => {
    const ids = result.transactions.map((t) => t.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('parseCsv — unknown format', () => {
  it('returns a parse error for unknown headers', () => {
    const bad = 'Date,Desc,Val\n2024-01-01,test,100'
    const result = parseCsv(bad)
    expect(result.transactions).toHaveLength(0)
    expect(result.parseErrors.length).toBeGreaterThan(0)
    expect(result.parseErrors[0]).toMatch(/Unrecognised CSV format/)
  })
})

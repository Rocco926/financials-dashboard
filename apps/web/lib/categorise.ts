/**
 * Transaction auto-categorisation — Approach A (keyword rules + learning).
 *
 * PIPELINE (in priority order)
 * ─────────────────────────────
 * 1. category_rules table lookup  — user corrections always win
 * 2. Bank-provided category       — NAB nab2 exports include a Category column
 * 3. Static keyword map           — hardcoded patterns for common AU merchants
 * 4. null                         — uncategorised; user sets it manually later
 *
 * TODO: Approach B — Claude API classification
 *   After the keyword map (step 3), batch any still-uncategorised descriptions
 *   to claude-haiku-4-5 for classification. See README.md § Auto-categorisation
 *   for the full plan. Requires ANTHROPIC_API_KEY in the environment.
 *
 * NORMALISATION
 * ─────────────
 * All description lookups use the same normalisation: uppercase + trim.
 * The category_rules table stores patterns in this normalised form.
 * This ensures "Woolworths Metro Sydney" and "WOOLWORTHS METRO SYDNEY" both
 * match the same rule.
 *
 * KEYWORD MAP DESIGN
 * ──────────────────
 * Each entry is [pattern, category] where pattern is tested as a substring
 * match against the normalised description. Patterns are checked in order —
 * more specific patterns should come before general ones to avoid collisions
 * (e.g. "UBER EATS" before "UBER" so Uber Eats goes to Dining, not Transport).
 *
 * Categories here must exactly match the names seeded by `pnpm db:seed`.
 */
import { db } from '@/lib/db'
import { categoryRules } from '@/lib/db'
import { inArray } from 'drizzle-orm'
import type { ParsedTransaction } from '@finance/types'

// ─── Keyword map ──────────────────────────────────────────────────────────────
// [substring to match in normalised description, category name]
// Order matters: more specific entries must come before general ones.

const KEYWORD_MAP: [string, string][] = [
  // ── Transfers & Savings ──────────────────────────────────────────────────────
  // Must come FIRST — these are common patterns that would otherwise match
  // Income or other categories (e.g. "DIRECT CREDIT" to savings ≠ real income).
  ['OSKO PAYMENT TO',       'Transfers, Savings & Investments'],
  ['OSKO PAYMENT FROM',     'Transfers, Savings & Investments'],
  ['TFR TO ',               'Transfers, Savings & Investments'],
  ['TFR FROM ',             'Transfers, Savings & Investments'],
  ['TRANSFER TO ',          'Transfers, Savings & Investments'],
  ['TRANSFER FROM ',        'Transfers, Savings & Investments'],
  ['INTERNET TRANSFER',     'Transfers, Savings & Investments'],
  ['BPAY TO SELF',          'Transfers, Savings & Investments'],
  ['CREDIT CARD PAYMENT',   'Transfers, Savings & Investments'],
  ['CARD PAYMENT THANK',    'Transfers, Savings & Investments'],  // Westpac credit card payment
  ['MACQUARIE ',            'Transfers, Savings & Investments'],  // Macquarie HISA deposits
  ['BETASHARES',            'Transfers, Savings & Investments'],  // ETF purchases
  ['SELFWEALTH',            'Transfers, Savings & Investments'],
  ['COMMSEC',               'Transfers, Savings & Investments'],
  ['NABTRADE',              'Transfers, Savings & Investments'],
  ['STAKE ',                'Transfers, Savings & Investments'],
  ['SUPERHERO',             'Transfers, Savings & Investments'],
  ['RAIZ ',                 'Transfers, Savings & Investments'],
  ['SPACESHIP',             'Transfers, Savings & Investments'],

  // ── Income ──────────────────────────────────────────────────────────────────
  ['SALARY',           'Income'],
  ['PAYROLL',          'Income'],
  ['DIRECT CREDIT',    'Income'],
  ['WAGES',            'Income'],
  ['INTEREST EARNED',  'Income'],
  ['CENTRELINK',       'Income'],
  ['TAX REFUND',       'Income'],
  ['DIVIDEND',         'Income'],

  // ── Groceries ────────────────────────────────────────────────────────────────
  ['WOOLWORTHS',       'Groceries'],
  ['COLES',            'Groceries'],
  ['ALDI',             'Groceries'],
  ['IGA ',             'Groceries'],
  ['HARRIS FARM',      'Groceries'],
  ['DRAKES',           'Groceries'],
  ['SPAR ',            'Groceries'],
  ['FOODWORKS',        'Groceries'],
  ['COSTCO',           'Groceries'],

  // ── Dining & Takeaway ────────────────────────────────────────────────────────
  ['UBER EATS',        'Dining & Takeaway'],
  ['MENULOG',          'Dining & Takeaway'],
  ['DOORDASH',         'Dining & Takeaway'],
  ['DELIVEROO',        'Dining & Takeaway'],
  ['MCDONALD',         'Dining & Takeaway'],
  ['KFC ',             'Dining & Takeaway'],
  ['SUBWAY',           'Dining & Takeaway'],
  ['DOMINO',           'Dining & Takeaway'],
  ['HUNGRY JACK',      'Dining & Takeaway'],
  ['GUZMAN',           'Dining & Takeaway'],
  ['NANDOS',           'Dining & Takeaway'],
  ['OPORTO',           'Dining & Takeaway'],
  ['STARBUCKS',        'Dining & Takeaway'],
  ['GLORIA JEAN',      'Dining & Takeaway'],
  ['BOOST JUICE',      'Dining & Takeaway'],

  // ── Transport ────────────────────────────────────────────────────────────────
  ['UBER ',            'Transport'],   // "UBER " (with space) to avoid "UBER EATS"
  ['DIDI ',            'Transport'],
  ['OLA CAB',          'Transport'],
  ['13CABS',           'Transport'],
  ['SILVER SERVICE',   'Transport'],
  ['OPAL ',            'Transport'],
  ['MYKI ',            'Transport'],
  ['METROCARD',        'Transport'],
  ['GO CARD',          'Transport'],
  ['TRANSLINK',        'Transport'],
  ['CITYLINK',         'Transport'],
  ['LINKT',            'Transport'],
  ['EASTLINK',         'Transport'],
  ['AIRPORTLINK',      'Transport'],

  // ── Fuel ─────────────────────────────────────────────────────────────────────
  // Note: "WOOLWORTHS PETROL" would hit Groceries first — a known limitation.
  // Users can correct this and it will be remembered via category_rules.
  ['AMPOL',            'Fuel'],
  ['BP ',              'Fuel'],
  ['SHELL ',           'Fuel'],
  ['CALTEX',           'Fuel'],
  ['7-ELEVEN',         'Fuel'],
  ['UNITED PETRO',     'Fuel'],
  ['PUMA ENERGY',      'Fuel'],
  ['LIBERTY OIL',      'Fuel'],
  ['METRO PETRO',      'Fuel'],

  // ── Utilities ────────────────────────────────────────────────────────────────
  ['AGL ',             'Utilities'],
  ['ORIGIN ENERGY',    'Utilities'],
  ['ENERGY AUSTRALIA', 'Utilities'],
  ['SIMPLY ENERGY',    'Utilities'],
  ['ALINTA ENERGY',    'Utilities'],
  ['SYDNEY WATER',     'Utilities'],
  ['YARRA VALLEY',     'Utilities'],
  ['SOUTH EAST WATER', 'Utilities'],
  ['TELSTRA',          'Utilities'],
  ['OPTUS',            'Utilities'],
  ['TPG ',             'Utilities'],
  ['AUSSIE BROADBAND', 'Utilities'],
  ['SUPERLOOP',        'Utilities'],
  ['VODAFONE',         'Utilities'],

  // ── Rent / Mortgage ──────────────────────────────────────────────────────────
  ['RENT ',            'Rent/Mortgage'],
  ['RENTAL ',          'Rent/Mortgage'],
  ['LOAN REPAYMENT',   'Rent/Mortgage'],
  ['HOME LOAN',        'Rent/Mortgage'],
  ['MORTGAGE',         'Rent/Mortgage'],
  ['REAL ESTATE',      'Rent/Mortgage'],

  // ── Insurance ────────────────────────────────────────────────────────────────
  ['INSURANCE',        'Insurance'],
  ['NRMA ',            'Insurance'],
  ['RACV ',            'Insurance'],
  ['RACQ ',            'Insurance'],
  ['AAMI ',            'Insurance'],
  ['ALLIANZ',          'Insurance'],
  ['BUPA ',            'Insurance'],
  ['MEDIBANK',         'Insurance'],
  ['NIB ',             'Insurance'],
  ['HCF ',             'Insurance'],
  ['AHM ',             'Insurance'],

  // ── Health & Medical ─────────────────────────────────────────────────────────
  ['PHARMACY',         'Health & Medical'],
  ['CHEMIST',          'Health & Medical'],
  ['PRICELINE',        'Health & Medical'],
  ['TERRY WHITE',      'Health & Medical'],
  ['AMCAL',            'Health & Medical'],
  ['MEDICAL CENTRE',   'Health & Medical'],
  ['DENTAL',           'Health & Medical'],
  ['PATHOLOGY',        'Health & Medical'],
  ['RADIOLOGY',        'Health & Medical'],
  ['HOSPITAL',         'Health & Medical'],
  ['HEALTHSCOPE',      'Health & Medical'],
  ['SONIC HEALTH',     'Health & Medical'],
  ['BULK BILL',        'Health & Medical'],

  // ── Subscriptions ────────────────────────────────────────────────────────────
  ['NETFLIX',          'Subscriptions'],
  ['SPOTIFY',          'Subscriptions'],
  ['APPLE.COM/BILL',   'Subscriptions'],
  ['GOOGLE *',         'Subscriptions'],
  ['AMAZON PRIME',     'Subscriptions'],
  ['DISNEY+',          'Subscriptions'],
  ['STAN.COM',         'Subscriptions'],
  ['BINGE ',           'Subscriptions'],
  ['KAYO ',            'Subscriptions'],
  ['FOXTEL',           'Subscriptions'],
  ['YOUTUBE PREMIUM',  'Subscriptions'],
  ['MICROSOFT 365',    'Subscriptions'],
  ['ADOBE ',           'Subscriptions'],
  ['CANVA',            'Subscriptions'],
  ['DROPBOX',          'Subscriptions'],
  ['1PASSWORD',        'Subscriptions'],
  ['CHATGPT',          'Subscriptions'],

  // ── Entertainment ────────────────────────────────────────────────────────────
  ['CINEMA',           'Entertainment'],
  ['EVENT CINEMA',     'Entertainment'],
  ['HOYTS',            'Entertainment'],
  ['VILLAGE CINEMA',   'Entertainment'],
  ['READING CINEMA',   'Entertainment'],
  ['IMAX',             'Entertainment'],
  ['TICKETMASTER',     'Entertainment'],
  ['TICKETEK',         'Entertainment'],
  ['MOSHTIX',          'Entertainment'],
  ['STEAM ',           'Entertainment'],
  ['PLAYSTATION',      'Entertainment'],
  ['XBOX ',            'Entertainment'],
  ['NINTENDO',         'Entertainment'],

  // ── Shopping ─────────────────────────────────────────────────────────────────
  ['KMART',            'Shopping'],
  ['TARGET',           'Shopping'],
  ['BIG W',            'Shopping'],
  ['MYER',             'Shopping'],
  ['DAVID JONES',      'Shopping'],
  ['JB HI-FI',         'Shopping'],
  ['THE GOOD GUYS',    'Shopping'],
  ['HARVEY NORMAN',    'Shopping'],
  ['BUNNINGS',         'Shopping'],
  ['IKEA',             'Shopping'],
  ['OFFICEWORKS',      'Shopping'],
  ['AMAZON',           'Shopping'],
  ['EBAY',             'Shopping'],
  ['ETSY',             'Shopping'],
  ['COTTON ON',        'Shopping'],
  ['UNIQLO',           'Shopping'],
  ['ZARA',             'Shopping'],
  ['H&M',              'Shopping'],
  ['SPORTSGIRL',       'Shopping'],
  ['REBEL SPORT',      'Shopping'],

  // ── Travel ───────────────────────────────────────────────────────────────────
  ['QANTAS',           'Travel'],
  ['JETSTAR',          'Travel'],
  ['VIRGIN AUSTRALIA', 'Travel'],
  ['TIGERAIR',         'Travel'],
  ['WEBJET',           'Travel'],
  ['BOOKING.COM',      'Travel'],
  ['AIRBNB',           'Travel'],
  ['EXPEDIA',          'Travel'],
  ['TRIVAGO',          'Travel'],
  ['WOTIF',            'Travel'],

  // ── ATM / Cash ───────────────────────────────────────────────────────────────
  ['ATM ',             'ATM/Cash'],
  ['CASH WITHDRAWAL',  'ATM/Cash'],
  ['EFTPOS CASH',      'ATM/Cash'],

  // ── Fees & Charges ───────────────────────────────────────────────────────────
  ['ACCOUNT FEE',      'Fees & Charges'],
  ['MONTHLY FEE',      'Fees & Charges'],
  ['ANNUAL FEE',       'Fees & Charges'],
  ['LATE PAYMENT',     'Fees & Charges'],
  ['OVERDRAWN',        'Fees & Charges'],
  ['DISHONOUR',        'Fees & Charges'],
  ['INTERNATIONAL TRANSACTION FEE', 'Fees & Charges'],
  ['INTEREST CHARGED', 'Fees & Charges'],
  ['BPAY FEE',         'Fees & Charges'],
]

// ─── NAB category name mapping ────────────────────────────────────────────────
// NAB's Category column uses its own labels. Map them to our seeded names.
// Unmapped NAB categories fall through to keyword matching.
const NAB_CATEGORY_MAP: Record<string, string> = {
  'Groceries':    'Groceries',
  'Income':       'Income',
  'Transfers':    'Transfers, Savings & Investments',
  'Dining Out':   'Dining & Takeaway',
  'Transport':    'Transport',
  'Petrol':       'Fuel',
  'Health':       'Health & Medical',
  'Shopping':     'Shopping',
  'Travel':       'Travel',
  'Entertainment':'Entertainment',
  'Bills':        'Utilities',
  'Insurance':    'Insurance',
  'Education':    'Other',
  'ATM':          'ATM/Cash',
  'Fees':         'Fees & Charges',
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toUpperCase().trim()
}

// ─── Keyword matching ─────────────────────────────────────────────────────────

function matchKeyword(normalisedDescription: string): string | null {
  for (const [pattern, category] of KEYWORD_MAP) {
    if (normalisedDescription.includes(pattern)) return category
  }
  return null
}

// ─── Main categorise function ─────────────────────────────────────────────────

export interface CategorisedTransaction {
  category:   string | null
  merchant:   string | null  // cleaned merchant name (from bank or description)
}

/**
 * Categorises a batch of parsed transactions using the 3-step pipeline:
 *   1. category_rules table (user corrections — always wins)
 *   2. Bank-provided category (NAB nab2 only)
 *   3. Static keyword map
 *
 * Returns a Map from externalId → { category, merchant } so the import route
 * can apply results without re-traversing the array.
 *
 * Failures in this function must not abort the import. The caller should
 * wrap this in a try/catch and fall back to null categories if it throws.
 */
export async function categoriseBatch(
  transactions: ParsedTransaction[],
): Promise<Map<string, CategorisedTransaction>> {
  const results = new Map<string, CategorisedTransaction>()

  if (transactions.length === 0) return results

  // ── Step 1: Batch-query category_rules for all unique patterns ──────────────
  const normalisedDescriptions = transactions.map((tx) => normalise(tx.description))
  const uniquePatterns = [...new Set(normalisedDescriptions)]

  const rulesRows = await db
    .select({ merchantPattern: categoryRules.merchantPattern, category: categoryRules.category })
    .from(categoryRules)
    .where(inArray(categoryRules.merchantPattern, uniquePatterns))

  const rulesMap = new Map(rulesRows.map((r) => [r.merchantPattern, r.category]))

  // ── Steps 2–3: Per-transaction fallthrough ──────────────────────────────────
  for (const tx of transactions) {
    const norm = normalise(tx.description)

    // Step 1: learned rule
    const ruleCategory = rulesMap.get(norm) ?? null
    if (ruleCategory) {
      results.set(tx.externalId, {
        category: ruleCategory,
        merchant: tx.merchantName ?? null,
      })
      continue
    }

    // Step 2: bank-provided (NAB nab2)
    if (tx.suggestedCategory) {
      const mapped = NAB_CATEGORY_MAP[tx.suggestedCategory] ?? null
      if (mapped) {
        results.set(tx.externalId, {
          category: mapped,
          merchant: tx.merchantName ?? null,
        })
        continue
      }
    }

    // Step 3: keyword map
    const keywordCategory = matchKeyword(norm)
    results.set(tx.externalId, {
      category: keywordCategory,
      merchant: tx.merchantName ?? null,
    })
  }

  return results
}

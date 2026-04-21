/**
 * Transaction auto-categorisation — full pipeline.
 *
 * PIPELINE (in priority order)
 * ─────────────────────────────
 * 1. category_rules table lookup  — user corrections always win
 * 2. Bank-provided category       — NAB nab2 exports include a Category column
 * 3. Static keyword map           — hardcoded patterns for common AU merchants
 * 4. Claude Haiku classification  — batch API call for remaining unknowns
 * null                            — truly unknown; user sets it manually later
 *
 * SOURCE TRACKING
 * ───────────────
 * Each result carries a `categorySource` field:
 *   'user'    — matched a rule from category_rules (user-confirmed)
 *   'bank'    — bank-provided category (step 2)
 *   'keyword' — static keyword map (step 3)
 *   'claude'  — Claude Haiku classification (step 4)
 *   null      — uncategorised
 *
 * NORMALISATION
 * ─────────────
 * All description lookups use the same normalisation: uppercase + trim.
 * The category_rules table stores patterns in this normalised form.
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
import Anthropic from '@anthropic-ai/sdk'

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
  ['CENTRELINK',       'Income'],
  ['TAX REFUND',       'Income'],

  // ── Interest Income ──────────────────────────────────────────────────────────
  ['INTEREST EARNED',  'Interest Income'],
  ['INTEREST PAID',    'Interest Income'],
  ['INTEREST CREDIT',  'Interest Income'],
  ['SAVINGS INTEREST', 'Interest Income'],
  ['DIVIDEND',         'Interest Income'],

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

  // ── Coffee & Cafes ───────────────────────────────────────────────────────────
  // Placed before Dining & Takeaway so "MECCA ESPRESSO" doesn't fall into
  // Personal Care via the broader "MECCA" pattern further down.
  ['THE COFFEE CLUB',  'Coffee & Cafes'],
  ['CAMPOS',           'Coffee & Cafes'],
  ['MECCA ESPRESSO',   'Coffee & Cafes'],
  ['SEVEN SEEDS',      'Coffee & Cafes'],
  ['SINGLE O ',        'Coffee & Cafes'],
  ['TOBY ESTATE',      'Coffee & Cafes'],
  ['ST ALI',           'Coffee & Cafes'],
  ['RUSH ESPRESSO',    'Coffee & Cafes'],
  ['CODE BLACK',       'Coffee & Cafes'],
  ['SUNRISE COFFEE',   'Coffee & Cafes'],

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

  // ── Health & Fitness ─────────────────────────────────────────────────────────
  // Placed BEFORE Medical — gym/fitness patterns are more specific
  // and should not fall through to the medical category.
  ['ANYTIME FITNESS',  'Health & Fitness'],
  ['FITNESS FIRST',    'Health & Fitness'],
  ['GOODLIFE HEALTH',  'Health & Fitness'],
  ['F45 ',             'Health & Fitness'],
  ['CROSSFIT',         'Health & Fitness'],
  ['JETTS FITNESS',    'Health & Fitness'],
  ['PLUS FITNESS',     'Health & Fitness'],
  ['SNAP FITNESS',     'Health & Fitness'],
  ['VIRGIN ACTIVE',    'Health & Fitness'],
  ['PLANET FITNESS',   'Health & Fitness'],
  ['ORANGE THEORY',    'Health & Fitness'],
  ["BARRY'S ",         'Health & Fitness'],
  ['BIKRAM',           'Health & Fitness'],
  ['PILATES',          'Health & Fitness'],
  ['GYM MEMBERSHIP',   'Health & Fitness'],

  // ── Medical ──────────────────────────────────────────────────────────────────
  ['PHARMACY',         'Medical'],
  ['CHEMIST',          'Medical'],
  ['PRICELINE',        'Medical'],
  ['TERRY WHITE',      'Medical'],
  ['AMCAL',            'Medical'],
  ['MEDICAL CENTRE',   'Medical'],
  ['DENTAL',           'Medical'],
  ['PATHOLOGY',        'Medical'],
  ['RADIOLOGY',        'Medical'],
  ['HOSPITAL',         'Medical'],
  ['HEALTHSCOPE',      'Medical'],
  ['SONIC HEALTH',     'Medical'],
  ['BULK BILL',        'Medical'],

  // ── Personal Care ────────────────────────────────────────────────────────────
  // Placed AFTER Coffee & Cafes (for MECCA ESPRESSO) and Health & Fitness.
  // "MECCA " catches MECCA COSMETICA and MECCA MAXIMA after MECCA ESPRESSO is matched above.
  ['MECCA COSMETICA',  'Personal Care'],
  ['MECCA MAXIMA',     'Personal Care'],
  ['MECCA ',           'Personal Care'],
  ['SEPHORA',          'Personal Care'],
  ['AESOP',            'Personal Care'],
  ['KIEHL',            'Personal Care'],
  ['LUSH ',            'Personal Care'],
  ['THE BODY SHOP',    'Personal Care'],
  ['HAIRHOUSE',        'Personal Care'],
  ['GREAT CLIPS',      'Personal Care'],
  ['SPORT CLIPS',      'Personal Care'],
  ['HAIR SALON',       'Personal Care'],
  ['BARBERSHOP',       'Personal Care'],
  ['BARBER SHOP',      'Personal Care'],
  ['NAIL BAR',         'Personal Care'],
  ['NAIL SALON',       'Personal Care'],
  ['DAY SPA',          'Personal Care'],
  ['BEAUTY SALON',     'Personal Care'],
  ['WAXING',           'Personal Care'],

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

  // ── Pets ─────────────────────────────────────────────────────────────────────
  ['PETBARN',          'Pets'],
  ['PET BARN',         'Pets'],
  ['PET CIRCLE',       'Pets'],
  ['PETSTOCK',         'Pets'],
  ['GREENCROSS VET',   'Pets'],
  ['ANIMAL HOSPITAL',  'Pets'],
  ['VETERINARY',       'Pets'],
  ['PAWSHAKE',         'Pets'],
  ['DOG WASH',         'Pets'],

  // ── Education ────────────────────────────────────────────────────────────────
  ['TAFE ',            'Education'],
  ['UDEMY',            'Education'],
  ['COURSERA',         'Education'],
  ['SKILLSHARE',       'Education'],
  ['DUOLINGO',         'Education'],
  ['MASTERCLASS',      'Education'],
  ['CHEGG',            'Education'],
  ['SCRIBD',           'Education'],
  ['PEARSON',          'Education'],
  ['AUSTUDY',          'Education'],

  // ── Gifts & Donations ────────────────────────────────────────────────────────
  ['OXFAM',            'Gifts & Donations'],
  ['CANCER COUNCIL',   'Gifts & Donations'],
  ['RED CROSS',        'Gifts & Donations'],
  ['SAVE THE CHILDREN','Gifts & Donations'],
  ['WORLD VISION',     'Gifts & Donations'],
  ['UNICEF',           'Gifts & Donations'],
  ['BEYOND BLUE',      'Gifts & Donations'],
  ['RSPCA',            'Gifts & Donations'],
  ['ST VINCENT',       'Gifts & Donations'],
  ['SALVOS',           'Gifts & Donations'],

  // ── Home & Garden ────────────────────────────────────────────────────────────
  // BUNNINGS is placed HERE (before Shopping) so it maps to Home & Garden.
  ['BUNNINGS',         'Home & Garden'],
  ['MITRE 10',         'Home & Garden'],
  ['TOTAL TOOLS',      'Home & Garden'],
  ['BEACON LIGHTING',  'Home & Garden'],
  ['CLARK RUBBER',     'Home & Garden'],
  ['GARDEN CENTRE',    'Home & Garden'],
  ['GARDEN CENTER',    'Home & Garden'],
  ['GARDEN SUPPLIES',  'Home & Garden'],
  ['HARDWARE',         'Home & Garden'],

  // ── Shopping ─────────────────────────────────────────────────────────────────
  ['KMART',            'Shopping'],
  ['TARGET',           'Shopping'],
  ['BIG W',            'Shopping'],
  ['MYER',             'Shopping'],
  ['DAVID JONES',      'Shopping'],
  ['JB HI-FI',         'Shopping'],
  ['THE GOOD GUYS',    'Shopping'],
  ['HARVEY NORMAN',    'Shopping'],
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
  ['LORNA JANE',       'Shopping'],
  ['COUNTRY ROAD',     'Shopping'],
  ['WITCHERY',         'Shopping'],
  ['GLUE STORE',       'Shopping'],
  ['UNIVERSAL STORE',  'Shopping'],

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
  'Interest':     'Interest Income',
  'Dividends':    'Interest Income',
  'Transfers':    'Transfers, Savings & Investments',
  'Dining Out':   'Dining & Takeaway',
  'Cafe':         'Coffee & Cafes',
  'Coffee':       'Coffee & Cafes',
  'Transport':    'Transport',
  'Petrol':       'Fuel',
  'Health':       'Medical',
  'Fitness':      'Health & Fitness',
  'Gym':          'Health & Fitness',
  'Beauty':       'Personal Care',
  'Personal Care':'Personal Care',
  'Pets':         'Pets',
  'Education':    'Education',
  'Charity':      'Gifts & Donations',
  'Donations':    'Gifts & Donations',
  'Shopping':     'Shopping',
  'Travel':       'Travel',
  'Entertainment':'Entertainment',
  'Bills':        'Utilities',
  'Insurance':    'Insurance',
  'Home':         'Home & Garden',
  'Garden':       'Home & Garden',
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

// ─── Claude Haiku classification ──────────────────────────────────────────────

/**
 * Sends a batch of unique normalised descriptions to Claude Haiku and asks it
 * to assign each one to the closest category from the provided list.
 *
 * Returns a Map from normalised description → category name (or null if Claude
 * couldn't classify it or if the response couldn't be parsed).
 *
 * Failures are silent — if this throws or returns null, the caller treats the
 * affected transactions as uncategorised.
 *
 * PROMPT DESIGN
 * ─────────────
 * We pass the full closed list of valid category names so Claude can only
 * return values we know exist. We ask for JSON output and validate each entry
 * against the known set before using it — unknown strings are discarded.
 */
export async function classifyWithClaude(
  descriptions: string[],
  knownCategories: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  if (descriptions.length === 0) return result

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return result

  const categoryList = knownCategories.join(', ')

  // Chunk to avoid token limits — 100 descriptions per call is conservative
  const client = new Anthropic({ apiKey })
  const CHUNK_SIZE = 100
  for (let i = 0; i < descriptions.length; i += CHUNK_SIZE) {
    const chunk = descriptions.slice(i, i + CHUNK_SIZE)
    try {
      const msg = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 1024,
        system: `You are a bank transaction categoriser for Australian personal finance.
Given a list of bank transaction descriptions, assign each one to the most appropriate category from the provided list.
If no category fits, use null.
Return ONLY a valid JSON object mapping each description to a category name or null. No explanation, no markdown.`,
        messages: [{
          role:    'user',
          content: `Categories: ${categoryList}\n\nDescriptions:\n${chunk.map((d, idx) => `${idx + 1}. ${d}`).join('\n')}\n\nReturn JSON: {"description": "category" | null, ...}`,
        }],
      })

      const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
      if (!text) continue

      // Strip markdown code fences if present
      const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      const parsed: Record<string, string | null> = JSON.parse(json)
      const knownSet = new Set(knownCategories)

      for (const desc of chunk) {
        const suggestion = parsed[desc] ?? null
        // Only accept exact matches against the known category list
        result.set(desc, suggestion && knownSet.has(suggestion) ? suggestion : null)
      }
    } catch {
      // On any error, leave this chunk's descriptions as null — non-fatal
      for (const desc of chunk) {
        result.set(desc, null)
      }
    }
  }

  return result
}

// ─── Main categorise function ─────────────────────────────────────────────────

export interface CategorisedTransaction {
  category:       string | null
  merchant:       string | null  // cleaned merchant name (from bank or description)
  categorySource: 'user' | 'bank' | 'keyword' | 'claude' | null
}

/**
 * Categorises a batch of parsed transactions using the 4-step pipeline:
 *   1. category_rules table (user corrections — always wins)
 *   2. Bank-provided category (NAB nab2 only)
 *   3. Static keyword map
 *   4. Claude Haiku classification (batch, for any remaining unknowns)
 *
 * Returns a Map from externalId → { category, merchant, categorySource } so
 * the import route can apply results without re-traversing the array.
 *
 * Failures in this function must not abort the import. The caller should
 * wrap this in a try/catch and fall back to null categories if it throws.
 *
 * The `knownCategories` param must be the current list of category names from
 * the DB (passed in so this function doesn't need to query it itself).
 */
export async function categoriseBatch(
  transactions: ParsedTransaction[],
  knownCategories: string[] = [],
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
  const uncategorisedIds: string[] = []

  for (const tx of transactions) {
    const norm = normalise(tx.description)

    // Step 1: learned rule (source = 'user' — these are user-confirmed patterns)
    const ruleCategory = rulesMap.get(norm) ?? null
    if (ruleCategory) {
      results.set(tx.externalId, {
        category:       ruleCategory,
        merchant:       tx.merchantName ?? null,
        categorySource: 'user',
      })
      continue
    }

    // Step 2: bank-provided (NAB nab2)
    if (tx.suggestedCategory) {
      const mapped = NAB_CATEGORY_MAP[tx.suggestedCategory] ?? null
      if (mapped) {
        results.set(tx.externalId, {
          category:       mapped,
          merchant:       tx.merchantName ?? null,
          categorySource: 'bank',
        })
        continue
      }
    }

    // Step 3: keyword map
    const keywordCategory = matchKeyword(norm)
    if (keywordCategory) {
      results.set(tx.externalId, {
        category:       keywordCategory,
        merchant:       tx.merchantName ?? null,
        categorySource: 'keyword',
      })
      continue
    }

    // Still uncategorised — queue for Claude (step 4)
    results.set(tx.externalId, {
      category:       null,
      merchant:       tx.merchantName ?? null,
      categorySource: null,
    })
    uncategorisedIds.push(tx.externalId)
  }

  // ── Step 4: Claude Haiku batch classification ────────────────────────────────
  if (uncategorisedIds.length > 0 && knownCategories.length > 0) {
    // Collect unique normalised descriptions for uncategorised transactions
    const uncategorisedTxs = transactions.filter(tx => uncategorisedIds.includes(tx.externalId))
    const uniqueDescs = [...new Set(uncategorisedTxs.map(tx => normalise(tx.description)))]

    const claudeMap = await classifyWithClaude(uniqueDescs, knownCategories)

    for (const tx of uncategorisedTxs) {
      const norm = normalise(tx.description)
      const claudeCategory = claudeMap.get(norm) ?? null
      if (claudeCategory) {
        results.set(tx.externalId, {
          category:       claudeCategory,
          merchant:       tx.merchantName ?? null,
          categorySource: 'claude',
        })
      }
      // null Claude result leaves the transaction as { category: null, source: null }
    }
  }

  return results
}

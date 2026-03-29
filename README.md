# financials-dashboard

A personal finance tracking application built as a Turborepo monorepo. Import bank statements from Westpac and NAB, categorise transactions, and visualise spending patterns over time.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Shared packages (types, parsers, db) with incremental builds |
| Framework | Next.js 14 App Router | Server Components for DB queries, Client Components for interactivity |
| Language | TypeScript (strict) | `noUncheckedIndexedAccess`, `noImplicitReturns` across all packages |
| Database | Supabase (PostgreSQL) | Managed Postgres with connection pooling via PgBouncer |
| ORM | Drizzle ORM | Type-safe schema-as-code; migrations via `drizzle-kit push` |
| Auth | NextAuth v5 (Credentials) | Single-user JWT sessions; no user table — validated against env vars |
| Charts | Recharts | Monthly income/expense bar chart + category spending donut |
| Styles | Tailwind CSS | Utility-first; no component library dependency |
| Deployment | Vercel + Supabase | Zero-config Next.js hosting; Supabase handles DB |

---

## Project structure

```
financials-dashboard/
├── apps/
│   └── web/                        # Next.js application
│       ├── app/
│       │   ├── page.tsx            # Dashboard (Server Component)
│       │   ├── layout.tsx          # Root layout with nav sidebar
│       │   ├── login/page.tsx      # Login page (Client Component)
│       │   ├── import/page.tsx     # File import wizard (Client Component)
│       │   ├── transactions/
│       │   │   ├── page.tsx        # Transactions list (Server Component)
│       │   │   └── category-editor.tsx  # Inline category dropdown (Client)
│       │   ├── budgets/page.tsx    # Coming soon stub
│       │   └── api/
│       │       ├── import/
│       │       │   ├── route.ts         # POST: parse file + upsert to DB
│       │       │   └── preview/route.ts # POST: parse file, return first 5 rows
│       │       ├── transactions/
│       │       │   ├── route.ts         # GET: paginated + filtered list
│       │       │   └── [id]/route.ts    # PATCH: update category
│       │       ├── accounts/route.ts    # GET: accounts with tx counts
│       │       └── categories/route.ts  # GET: all categories
│       ├── components/
│       │   ├── nav.tsx             # Left sidebar navigation
│       │   ├── monthly-chart.tsx   # Income vs expenses bar chart
│       │   ├── category-chart.tsx  # Spending by category donut chart
│       │   └── period-selector.tsx # Time period filter buttons
│       ├── lib/
│       │   └── utils.ts            # cn(), formatCurrency(), formatDate(), getPeriodDates()
│       ├── auth.ts                 # NextAuth v5 config (Credentials provider)
│       └── middleware.ts           # Route protection (redirect unauth users)
├── packages/
│   ├── types/src/index.ts          # Shared TypeScript types (ParsedTransaction, etc.)
│   ├── parsers/src/
│   │   ├── index.ts                # Main parse() entry point with exhaustiveness check
│   │   ├── detect.ts               # Format detection from file extension
│   │   ├── hash.ts                 # SHA-256 external ID generator
│   │   └── parsers/
│   │       ├── csv.ts              # Westpac + NAB CSV parser
│   │       ├── qif.ts              # QIF line-based state machine parser
│   │       └── ofx.ts              # OFX SGML + XML parser (no library)
│   └── db/src/
│       ├── schema.ts               # Drizzle table definitions
│       ├── client.ts               # postgres.js + Drizzle client (prepare: false)
│       ├── seed.ts                 # 16 default Australian spending categories
│       └── index.ts                # Package exports
├── scripts/
│   └── hash-password.mjs           # Generate bcrypt hash for ADMIN_PASSWORD
├── .env.example                    # All required environment variables documented
├── turbo.json                      # Turborepo task pipeline
├── pnpm-workspace.yaml             # Workspace package paths
└── tsconfig.base.json              # Shared TypeScript config (strict mode)
```

---

## How the pieces fit together

### Page load flow (Dashboard)

```
Browser → GET /
  → middleware.ts          checks JWT cookie → user authenticated?
      → yes → continue
      → no  → redirect to /login
  → app/page.tsx           Server Component
      → reads ?period= from searchParams
      → calls getPeriodDates() to get start/end dates
      → runs 3 Drizzle/SQL queries in parallel:
          1. Monthly income/expense aggregation (raw SQL, last 12 months)
          2. Category spending breakdown (Drizzle, expenses only)
          3. Recent transactions (Drizzle, last 10)
      → renders page with data passed as props to Client Components
          → <MonthlyChart data={monthlyData} />    (Recharts, client-side)
          → <CategoryChart data={categoryData} />  (Recharts, client-side)
          → <PeriodSelector />                      (URL params, client-side)
```

### File import flow

```
User selects file(s) → import wizard (app/import/page.tsx)
  Step 1: Upload — file selected, drag-and-drop supported
  Step 2: Configure — pick existing account OR create new one (name, institution, type)
  Step 3: Preview — POST /api/import/preview → parse file → show first 5 rows (no DB write)
  Step 4: Confirm → POST /api/import
      → parse file with @finance/parsers
      → for each transaction:
          INSERT INTO transactions (...) ON CONFLICT (external_id) DO NOTHING
      → returns { imported: N, skipped: M, errors: [...] }
  Done — shows imported/skipped counts
```

### Deduplication

Every transaction gets a stable `external_id` before being inserted:

- **OFX/QBO files**: Use the bank's own `FITID` field — guaranteed unique by the bank.
- **CSV/QIF files**: SHA-256 hash of `date|amount|description|position` (first 32 hex chars). The `position` tiebreaker handles same-day identical transactions (e.g., two $5.00 coffee purchases on the same day with the same description).

The `transactions` table has a `UNIQUE` constraint on `external_id`. Importing the same file twice is safe — duplicates are silently skipped via `ON CONFLICT DO NOTHING`.

### Sign convention

Throughout the entire codebase — parsers, database, and UI queries — positive amounts are credits (money in) and negative amounts are debits (money out). This matches standard accounting convention.

- Westpac CSV has separate Debit and Credit columns (both positive); the parser normalises these to signed amounts.
- NAB CSV has a single signed Amount column; the parser uses it directly.
- OFX uses a `TRNTYPE` field (`CREDIT`/`DEBIT`) alongside an unsigned amount; the parser applies the sign.

---

## Database schema

### `accounts`

Represents a single bank account. Each imported file is linked to one account.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | text | Display name (e.g. "Westpac Everyday") |
| `institution` | text | Bank name (e.g. "Westpac") |
| `account_type` | enum | `transaction`, `savings`, `credit_card`, `loan` |
| `currency` | text | Default `'AUD'` |
| `created_at` | timestamptz | Auto-set on insert |

### `categories`

Spending/income categories. The seed script populates 16 defaults.

| Column | Type | Description |
|---|---|---|
| `name` | text (PK) | Category name — used as FK in transactions (not a UUID) |
| `colour` | text | Hex colour for the donut chart (e.g. `#22c55e`) |
| `is_income` | boolean | `true` for income categories (e.g. Salary), `false` for expenses |

**Why name as PK?** Avoids a join when displaying the category name in the transactions table. The category name is what the user sees and edits — it's the natural key.

### `transactions`

One row per bank transaction.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `account_id` | UUID (FK) | Links to `accounts.id`; CASCADE DELETE |
| `external_id` | text (UNIQUE) | Deduplication key (FITID or SHA-256 hash) |
| `date` | date | Transaction date (no time component) |
| `amount` | numeric(12,2) | Signed: positive = credit, negative = debit |
| `description` | text | Merchant/payee description |
| `balance` | numeric(12,2) | Running balance (null for QIF) |
| `type` | enum | `credit` or `debit` |
| `category` | text (FK) | References `categories.name`; nullable |
| `raw_data` | jsonb | Original parsed row for debugging |
| `created_at` | timestamptz | Auto-set on insert |

### `import_logs`

One row per imported file, for auditing.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `account_id` | UUID (FK) | Account the file was imported into |
| `filename` | text | Original filename |
| `format` | text | `csv`, `qif`, `ofx`, or `qbo` |
| `imported_count` | integer | Transactions successfully inserted |
| `skipped_count` | integer | Duplicates skipped |
| `imported_at` | timestamptz | Auto-set on insert |

---

## Supported file formats

### Westpac CSV

**Headers:** `Transaction Date, Narration, Credit, Debit, Balance`

- Date format: `DD/MM/YYYY`
- Credit and Debit are separate columns (both positive values)
- Parser normalises: credit row → positive amount, debit row → negative amount

**To export from Westpac Online Banking:**
1. Log in → select account → Transaction History
2. Set date range → click Export
3. Select format: CSV
4. Download and import

### NAB CSV

**Headers:** `Date, Amount, Account Number, Merchant Name, Narrative, Balance, Category, Serial Number, Transaction Code`

- Date format: `DD/MM/YYYY`
- Amount is a single signed column (negative = debit, positive = credit)

**To export from NAB Internet Banking:**
1. Log in → select account → Transactions
2. Click "Export transactions"
3. Select CSV format and date range
4. Download and import

### OFX (Open Financial Exchange)

Exported from both Westpac and NAB. Australian banks use SGML-format OFX (not XML), with no closing tags on most elements. The parser handles both SGML and XML variants by trying XML first, then falling back to SGML block extraction.

- Uses the bank's `FITID` as the external ID (no hashing needed)
- Timezone suffixes (e.g. `[+10:AEST]`) are stripped from dates

**To export OFX from Westpac:** Same export flow as CSV — select "OFX" as the format.

### QBO (QuickBooks Online)

Structurally identical to OFX — the same parser handles both. QBO files use the `.qbo` extension; the format is detected by extension.

### QIF (Quicken Interchange Format)

A line-based text format. Each transaction ends with `^`. The parser is a state machine that accumulates fields from each line:

| Tag | Field |
|---|---|
| `D` | Date |
| `T` | Amount (may contain commas, e.g. `-1,234.56`) |
| `P` | Payee (preferred as description) |
| `M` | Memo (fallback if no Payee) |
| `^` | End of record — commit transaction |

**Note:** QIF has no running balance field. The `balance` column will be `null` for QIF imports.

---

## Local setup

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone <repo-url>
cd financials-dashboard
pnpm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your project's database password
3. In the Supabase dashboard → Settings → Database:
   - Copy the **Connection string (Transaction mode)** — this is your `DATABASE_URL` (port 6543)
   - Copy the **Direct connection** string — this is your `DIRECT_URL` (port 5432)

### 3. Configure environment variables

```bash
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```bash
# Supabase — pooled connection (used by the app at runtime)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Supabase — direct connection (used only for migrations)
DIRECT_URL=postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>

# Admin credentials (single user)
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<bcrypt hash of your password — see step 4>
```

### 4. Generate a password hash

```bash
pnpm hash-password
# Enter your password when prompted
# Copy the output hash into ADMIN_PASSWORD
```

### 5. Push schema to the database

```bash
pnpm db:push
```

This runs `drizzle-kit push` using the `DIRECT_URL` to apply the schema directly (safe for development; no migration files generated).

### 6. Seed categories

```bash
pnpm db:seed
```

Inserts 16 default spending and income categories. Safe to re-run — uses `ON CONFLICT DO NOTHING`.

### 7. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## Deploying to Vercel + Supabase

### Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Vercel detects Turborepo automatically; set **Root Directory** to `apps/web`
4. Add all environment variables from `.env.example` in the Vercel dashboard
   - `NEXTAUTH_URL` = your Vercel deployment URL (e.g. `https://financials-dashboard.vercel.app`)
   - `NEXTAUTH_SECRET` = a new random secret (not the dev one)
5. Deploy

### After deploying

Run the database setup commands once against your production Supabase instance:

```bash
# From your local machine, pointing at the production DIRECT_URL
DIRECT_URL=<prod-direct-url> pnpm db:push
DIRECT_URL=<prod-direct-url> DATABASE_URL=<prod-database-url> pnpm db:seed
```

---

## Development reference

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start all apps in dev mode (hot reload) |
| `pnpm build` | Build all packages and apps (production) |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | Run `tsc --noEmit` across all packages |
| `pnpm db:push` | Apply schema changes to Supabase (uses DIRECT_URL) |
| `pnpm db:seed` | Insert default categories (idempotent) |
| `pnpm db:studio` | Open Drizzle Studio (local DB browser) |
| `pnpm hash-password` | Generate bcrypt hash for ADMIN_PASSWORD |
| `pnpm test` | Run Vitest tests (parser package) |

### Running parser tests

The parser package has isolated unit tests that don't need a database or Next.js:

```bash
cd packages/parsers
pnpm test          # run once
pnpm test --watch  # watch mode
```

Test fixtures live in `packages/parsers/src/__tests__/fixtures/` — realistic bank exports used as test input.

### Adding a new bank format

1. Add the new extension to `packages/parsers/src/detect.ts`
2. Add the new format to the `FileFormat` union in `packages/types/src/index.ts`
3. Create a new parser in `packages/parsers/src/parsers/<bank>.ts`
4. Add the new case to the `switch` in `packages/parsers/src/index.ts`

TypeScript's exhaustiveness check (the `const _exhaustive: never = format` pattern) will cause a compile error if you add to `FileFormat` without handling the new case in the switch — so you can't forget step 4.

### Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooled connection string (port 6543, `prepare=false` compatible) |
| `DIRECT_URL` | Yes | Supabase direct connection string (port 5432, for migrations only) |
| `NEXTAUTH_URL` | Yes | Full URL of the deployed app (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | Random secret for signing JWT tokens (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | Yes | The single user's email address |
| `ADMIN_PASSWORD` | Yes | Bcrypt hash of the single user's password (use `pnpm hash-password`) |

### Key architectural decisions

**Why `prepare: false` on the database client?**
Supabase uses PgBouncer in transaction mode for connection pooling. PgBouncer transaction mode does not support prepared statements. Setting `prepare: false` on the postgres.js client disables them, which is required for the connection pool to work correctly.

**Why two database URLs?**
PgBouncer (port 6543) is used at runtime because it pools connections efficiently. However, DDL statements (like `CREATE TABLE`) don't work through PgBouncer transaction mode. Drizzle migrations use the `DIRECT_URL` (port 5432) to connect directly to PostgreSQL, bypassing the pooler.

**Why is `category` a foreign key to `categories.name` instead of `categories.id`?**
The category name is what the user sees — it's the natural key. Storing the name directly in transactions avoids a join on every query. The tradeoff is that renaming a category would require an `UPDATE` cascade, but category names are expected to be stable.

**Why are monetary values stored as `numeric(12,2)` instead of float?**
Floating-point arithmetic is imprecise for money. `0.1 + 0.2 !== 0.3` in IEEE 754. PostgreSQL's `numeric` type stores exact decimal values. Note: Drizzle returns `numeric` columns as strings in JavaScript — always parse with `parseFloat()` before arithmetic.

# SITE.md — Financials Dashboard

## 1. Project Overview

**Name:** Financials Dashboard
**Type:** Personal finance tracker — single-user, self-hosted
**Stack:** Next.js 14 App Router, Drizzle ORM, PostgreSQL, Tailwind CSS
**Goal:** A clean, professional UI for tracking personal income, expenses, investments, and budgets. Currently functional but needs a polished, cohesive design pass using Stitch.

---

## 2. Design Direction

- Tone: **Refined and minimal** — feels like a serious financial tool, not a toy
- Audience: Single user (owner) — power-user density is fine, no need to over-simplify
- Inspiration: Notion, Linear, Mercury Bank — clean greys, purposeful colour, excellent typography
- Avoid: Generic "fintech green/blue gradient" clichés, card overload, excessive shadow

---

## 3. Global Layout

- **Sidebar navigation** (persistent, left-side) with icon + label per page
- **Top bar** per page with page title and primary action (period selector, import button, etc.)
- **Card-based content** with clear section hierarchy
- Colour used sparingly — primarily for data (income = green, expenses = red, neutral = grey)

---

## 4. Sitemap

| Status | Route | Page Name |
|--------|-------|-----------|
| [x] | `/` | Dashboard |
| [x] | `/transactions` | Transactions |
| [x] | `/transactions/categorise` | Bulk Categorise |
| [x] | `/holdings` | Holdings |
| [x] | `/budgets` | Budgets |
| [x] | `/import` | Import |
| [x] | `/import/history` | Import History |
| [x] | `/login` | Login |

---

## 5. Page Purposes

### Dashboard (`/`)
**The command centre.** Shows the big picture at a glance:
- Period selector (This month / 3 months / 12 months / All time / Custom date range)
- Three summary cards: Income, Expenses, Savings rate / Net cash flow
- Net worth card with sparkline chart (only shown when holdings exist)
- Side-by-side charts: monthly income vs expenses bar chart + spending by category donut
- Recent transactions list (last 10, links to full list)

### Transactions (`/transactions`)
**Full transaction ledger.** Every imported transaction with:
- Filters: search by description, filter by account, category (including "uncategorised only"), date range
- Per-row category editor (inline dropdown, optimistic update, "apply to similar" prompt)
- Delete button per row
- Clear account button (wipes all transactions for an account)
- Link to the Bulk Categorise page

### Bulk Categorise (`/transactions/categorise`)
**Speed-categorisation workflow.** Merchant-grouped view for processing uncategorised transactions fast:
- Time range selector (Last 30 days / 3 months / 6 months / This year / All time / Custom)
- Table: merchant name, uncategorised count, total count, last seen date, category picker
- Category picker: custom floating panel with 2-column colour-coded grid + search filter
- Row fades on save (prevents mis-clicks during reflow)
- Progress bar once session starts
- Skip button per row

### Holdings (`/holdings`)
**Investment portfolio tracker.** Cards for each holding:
- Types: Cash, ETF, Stock, Other
- Live prices fetched for ETF/Stock tickers
- Cash holdings can be linked to a bank account (live balance from transactions)
- Columns: current value, cost base, gain/loss (amount + %), live price, change %
- Add/edit holding form (inline or modal)

### Budgets (`/budgets`)
**Monthly budget tracking by category.** For each budgeted category:
- Budget amount vs actual spend for the selected period
- Progress bar (green → amber → red as spend approaches/exceeds budget)
- Add/edit/delete budget entries

### Import (`/import`)
**Bank statement ingestion.** Drag-and-drop or click-to-upload CSV files:
- Supports NAB CSV format (auto-detects columns)
- Shows parsed preview before confirming import
- Applies category_rules automatically on import
- Deduplicates against existing transactions
- Shows import summary (added / skipped / errors)

### Import History (`/import/history`)
**Audit trail of past imports.** Table showing:
- Import date/time
- File name
- Records added / skipped
- Link to view the transactions from that import

### Login (`/login`)
**Authentication gate.** Simple, clean login form:
- Email + password (NextAuth)
- Minimal design — just the form, no distractions

---

## 6. Roadmap (Pages to Build in Order)

1. Dashboard
2. Transactions
3. Bulk Categorise
4. Holdings
5. Budgets
6. Import
7. Import History
8. Login

---

## 7. Creative Freedom

If the roadmap is complete, consider:
- A dedicated **Reports** page (year-over-year comparisons, category trends over time)
- A **Settings** page (manage accounts, category colours, budget reset day)
- An **Accounts** overview page (balance per account, transaction count, last import date)

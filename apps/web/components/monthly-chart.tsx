/**
 * MonthlyChart — income vs expenses bar chart for the dashboard.
 *
 * WHAT IT RENDERS
 * ────────────────
 * A grouped bar chart showing two bars per month:
 *   Green bar  = total income (sum of positive transactions)
 *   Orange bar = total expenses (absolute sum of negative transactions)
 *
 * The X axis shows months (e.g. "Mar '24").
 * The Y axis shows dollar amounts, abbreviated (e.g. "$3k").
 *
 * DATA SOURCE
 * ────────────
 * Data is computed by a raw SQL aggregation query in app/page.tsx
 * (the dashboard Server Component) and passed as a prop here.
 * This component does NOT fetch data itself — it's purely presentational.
 *
 * RECHARTS SETUP
 * ──────────────
 * This component uses Recharts (recharts.org), which is a React charting
 * library built on D3. We use:
 *   ResponsiveContainer — makes the chart fill its parent's width automatically
 *   BarChart           — the main chart container
 *   CartesianGrid      — subtle background grid lines
 *   XAxis / YAxis      — axes with custom tick formatting
 *   Tooltip            — hover overlay showing exact values
 *   Legend             — colour key (Income / Expenses)
 *   Bar                — one per data series (income and expenses)
 *
 * CLIENT COMPONENT
 * ─────────────────
 * Recharts uses browser APIs (ResizeObserver for ResponsiveContainer) so it
 * must be a Client Component. The 'use client' directive tells Next.js to
 * send this component's JS to the browser rather than rendering it on the server.
 * The parent (app/page.tsx) is a Server Component — it fetches data and passes
 * it as serialisable props to this Client Component.
 */
'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

/** One data point = one month's aggregated income and expense totals. */
interface MonthlyDataPoint {
  /** Abbreviated month label, e.g. "Mar '24" */
  month: string
  /** Sum of all positive (income) transactions for the month, in AUD */
  income: number
  /** Absolute sum of all negative (expense) transactions for the month, in AUD */
  expenses: number
}

/**
 * Renders the monthly income vs expenses grouped bar chart.
 *
 * @param data - Array of monthly aggregates, ordered chronologically (oldest first).
 *               Computed by the getDashboardData() function in app/page.tsx.
 *               An empty array renders a "No data yet" placeholder.
 */
export function MonthlyChart({ data }: { data: MonthlyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        No data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        {/* Subtle horizontal grid lines — light gray, dashed */}
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

        {/* X axis: month labels, no axis line or tick marks for a clean look */}
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />

        {/* Y axis: abbreviated dollar amounts ($1k, $2k, etc.) */}
        <YAxis
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
          }
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={48}  // Wide enough for "$10k" without truncation
        />

        {/* Tooltip: shown on hover, formats values as AUD currency */}
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />

        {/* Legend: shows colour swatches with "Income" and "Expenses" labels */}
        <Legend
          wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
          iconType="square"
          iconSize={10}
        />

        {/* Income bars: green, rounded top corners */}
        <Bar dataKey="income" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />

        {/* Expense bars: orange, rounded top corners */}
        <Bar dataKey="expenses" name="Expenses" fill="#f97316" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * CategoryChart — spending breakdown donut chart for the dashboard.
 *
 * WHAT IT RENDERS
 * ────────────────
 * A donut (hollow pie) chart where each slice represents one spending category.
 * The slice size is proportional to the total amount spent in that category
 * during the selected period.
 *
 * Only expense transactions (negative amounts) are included — income is excluded.
 * The slice colour matches each category's stored `colour` hex value from the database.
 *
 * DATA SOURCE
 * ────────────
 * Data is computed by a Drizzle query in app/page.tsx (the dashboard Server Component)
 * and passed as a prop. This component is purely presentational — it doesn't fetch.
 *
 * UNCATEGORISED TRANSACTIONS
 * ──────────────────────────
 * Transactions with no category assigned are grouped as "Uncategorised"
 * with a default grey colour (#6b7280). This is handled in the SQL query
 * in app/page.tsx using COALESCE(category, 'Uncategorised').
 *
 * CLIENT COMPONENT
 * ─────────────────
 * Recharts requires browser APIs, so this must be 'use client'.
 * Data is fetched server-side in the parent and passed as serialisable props.
 */
'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

/** One slice of the donut chart = one category's spending total. */
interface CategoryDataPoint {
  /** Category name (e.g. "Groceries") or "Uncategorised" */
  name: string
  /** Total absolute amount spent in this category for the period (always positive) */
  value: number
  /** Hex colour for the pie slice, from the categories.colour column */
  colour: string
}

/**
 * Renders the category spending donut chart.
 *
 * @param data - Array of category aggregates for the selected period.
 *               An empty array renders a "No spending data yet" placeholder.
 */
export function CategoryChart({ data }: { data: CategoryDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        No spending data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={60}   // The "hole" in the donut — 0 would make it a solid pie
          outerRadius={95}
          paddingAngle={2}   // Small gap between slices for visual separation
          dataKey="value"
        >
          {/* Each Cell gets its colour from the category's colour field */}
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.colour} />
          ))}
        </Pie>

        {/* Tooltip: shows category name + formatted amount on hover */}
        <Tooltip
          formatter={(v: number) => formatCurrency(Math.abs(v))}
          contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />

        {/* Legend: colour swatch + category name, shown below the chart */}
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="square"
          iconSize={10}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

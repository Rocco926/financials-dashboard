'use client'

import {
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface MonthlyDataPoint {
  month: string
  income: number
  expenses: number
}

/** Converts "Mar '24" or "Mar '25" → "MAR" */
function shortMonth(label: string): string {
  return label.split(' ')[0]!.toUpperCase()
}

// Custom dot legend icon to match the design
function DotIcon({ color }: { color: string }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8">
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend(props: any) {
  const { payload } = props
  if (!payload?.length) return null
  return (
    <div className="flex items-center justify-center gap-6 pt-4">
      {payload.map((entry: { color: string; value: string }, i: number) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-secondary font-medium">
          <DotIcon color={entry.color} />
          {entry.value}
        </span>
      ))}
    </div>
  )
}

export function MonthlyChart({ data }: { data: MonthlyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-secondary">
        No data yet
      </div>
    )
  }

  const display = data.map((d) => ({ ...d, month: shortMonth(d.month) }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={display} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f3f1" vertical={false} />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#615e57', fontWeight: 600, letterSpacing: '0.08em' }}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 12,
            border: '1px solid #e7e2d9',
            boxShadow: '0 4px 16px rgba(27,28,27,0.06)',
            color: '#1b1c1b',
          }}
          cursor={{ fill: '#f4f3f1', radius: 4 }}
        />

        <Legend content={<CustomLegend />} />

        <Bar dataKey="income"   name="Income"   fill="#006c44" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#e7e2d9" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

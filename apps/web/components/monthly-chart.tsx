'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

export interface MonthlyDataPoint {
  month:    string
  income:   number
  expenses: number
  net:      number
}

/** Converts "Mar '24" → "MAR" */
function shortMonth(label: string): string {
  return label.split(' ')[0]!.toUpperCase()
}

function DotIcon({ color, dashed }: { color: string; dashed?: boolean }) {
  if (dashed) {
    return (
      <svg width="16" height="8" viewBox="0 0 16 8">
        <line x1="0" y1="4" x2="6" y2="4"  stroke={color} strokeWidth="2" strokeDasharray="3 2" />
        <line x1="10" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
      </svg>
    )
  }
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
      {payload.map((entry: { color: string; value: string; type?: string }, i: number) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-secondary font-medium">
          <DotIcon color={entry.color} dashed={entry.type === 'line'} />
          {entry.value}
        </span>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      fontSize: 12,
      borderRadius: 12,
      border: '1px solid #e7e2d9',
      boxShadow: '0 4px 16px rgba(27,28,27,0.06)',
      background: '#fff',
      padding: '10px 14px',
    }}>
      <p style={{ fontWeight: 600, marginBottom: 6, color: '#1b1c1b' }}>{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{formatCurrency(Math.abs(p.value))}{p.value < 0 ? ' (neg)' : ''}</strong>
        </p>
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
      <ComposedChart data={display} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f3f1" vertical={false} />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#615e57', fontWeight: 600, letterSpacing: '0.08em' }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          tick={{ fontSize: 10, fill: '#615e57' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          width={36}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f3f1', radius: 4 }} />

        <Legend content={<CustomLegend />} />

        <ReferenceLine y={0} stroke="#e7e2d9" strokeWidth={1} />

        <Bar dataKey="income"   name="Income"   fill="#006c44" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#e7e2d9" radius={[4, 4, 0, 0]} />
        <Line
          dataKey="net"
          name="Net cash flow"
          type="monotone"
          stroke="#4caf7d"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={{ r: 3, fill: '#4caf7d', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

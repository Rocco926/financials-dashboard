'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

export interface SavingsRatePoint {
  month: string
  rate:  number | null
}

/** Converts "Mar '24" → "MAR" */
function shortMonth(label: string): string {
  return label.split(' ')[0]!.toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rate = payload[0]?.value as number | null
  return (
    <div style={{
      fontSize: 12,
      borderRadius: 12,
      border: '1px solid #e7e2d9',
      boxShadow: '0 4px 16px rgba(27,28,27,0.06)',
      background: '#fff',
      padding: '10px 14px',
    }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#1b1c1b' }}>{label}</p>
      <p style={{ color: rate != null && rate >= 20 ? '#006c44' : '#b02d29' }}>
        Savings rate: <strong>{rate != null ? `${rate}%` : '—'}</strong>
      </p>
    </div>
  )
}

export function SavingsRateChart({ data }: { data: SavingsRatePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-secondary">
        No data yet
      </div>
    )
  }

  const display = data.map((d) => ({ ...d, month: shortMonth(d.month) }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={display} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4caf7d" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#4caf7d" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#f4f3f1" vertical={false} />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#615e57', fontWeight: 600, letterSpacing: '0.08em' }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: '#615e57' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 'auto']}
          width={36}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e7e2d9', strokeWidth: 1 }} />

        <ReferenceLine
          y={20}
          stroke="#bdcabf"
          strokeDasharray="4 3"
          label={{ value: 'Target 20%', position: 'insideTopRight', fontSize: 10, fill: '#615e57' }}
        />

        <Area
          type="monotone"
          dataKey="rate"
          name="Savings rate"
          stroke="#006c44"
          strokeWidth={2}
          fill="url(#savingsGradient)"
          dot={{ r: 3, fill: '#006c44', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

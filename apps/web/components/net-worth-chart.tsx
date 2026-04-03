'use client'

/**
 * NetWorthChart — simple Recharts line chart for portfolio value over time.
 *
 * Design decisions:
 * - Single line, muted colours — consistent with the Notion-minimalist palette
 * - No animation (baseline-ui rule: never add animation unless requested)
 * - Area fill at low opacity gives visual weight without being garish
 * - Tooltip shows value + date, no axis grid lines (too noisy for a personal tool)
 */
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

interface DataPoint {
  date: string       // YYYY-MM-DD
  totalValue: number
}

interface Props {
  data: DataPoint[]
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

function formatCurrencyShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  const entry = payload?.[0]
  if (!active || !entry) return null
  return (
    <div className="bg-white border border-[#E9E7E2] px-3 py-2 text-sm shadow-sm">
      <p className="text-[#787774] text-xs">{label ? formatShortDate(label) : ''}</p>
      <p className="text-[#37352F] font-medium tabular-nums mt-0.5">
        {new Intl.NumberFormat('en-AU', {
          style:    'currency',
          currency: 'AUD',
        }).format(entry.value)}
      </p>
    </div>
  )
}

export function NetWorthChart({ data }: Props) {
  if (data.length < 2) return null

  // Determine Y-axis domain with 5% padding so the line isn't right at the edge
  const values = data.map((d) => d.totalValue)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const pad  = (maxV - minV) * 0.05 || maxV * 0.02

  // Show X-axis labels only for a subset of ticks to avoid crowding
  const tickIndices = new Set<number>()
  const step = Math.max(1, Math.floor(data.length / 5))
  for (let i = 0; i < data.length; i += step) tickIndices.add(i)
  tickIndices.add(data.length - 1) // always show last date

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4CAF7D" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#4CAF7D" stopOpacity={0}    />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#ACABA8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v, i) => tickIndices.has(i) ? formatShortDate(v) : ''}
          interval={0}
        />
        <YAxis
          domain={[minV - pad, maxV + pad]}
          tick={{ fontSize: 11, fill: '#ACABA8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatCurrencyShort}
          width={52}
        />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: '#E9E7E2', strokeWidth: 1 }}
        />

        <Area
          type="monotone"
          dataKey="totalValue"
          stroke="#4CAF7D"
          strokeWidth={1.5}
          fill="url(#netWorthGradient)"
          dot={false}
          activeDot={{ r: 3, fill: '#4CAF7D', strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

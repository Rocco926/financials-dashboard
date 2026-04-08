'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface CategoryDataPoint {
  name: string
  value: number
  colour: string
}

export function CategoryChart({ data }: { data: CategoryDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-secondary">
        No spending data yet
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)

  // Up to 8 items in the legend
  const legendItems = data.slice(0, 8)

  return (
    <div>
      {/* Donut chart with center overlay */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.colour} strokeWidth={0} />
              ))}
            </Pie>

            <Tooltip
              formatter={(v: number) => [formatCurrency(v), '']}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                border: '1px solid #e7e2d9',
                boxShadow: '0 4px 16px rgba(27,28,27,0.06)',
                color: '#1b1c1b',
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — absolutely positioned over the donut hole */}
        {total > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <span className="text-xl font-bold text-on-surface tabular-nums tracking-tight">
              {formatCurrency(total)}
            </span>
            <span className="text-[9px] font-bold text-secondary uppercase tracking-[0.12em] mt-0.5">
              Total spent
            </span>
          </div>
        )}
      </div>

      {/* 2-col legend grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 mt-4 px-2">
        {legendItems.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
          return (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.colour }}
                />
                <span className="text-xs text-on-surface font-medium truncate">{item.name}</span>
              </div>
              <span className="text-xs text-secondary tabular-nums ml-2 shrink-0">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

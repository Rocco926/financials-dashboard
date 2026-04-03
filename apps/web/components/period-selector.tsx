'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const PERIODS = [
  { value: 'month',    label: 'This month' },
  { value: '3months',  label: '3 months'   },
  { value: '12months', label: '12 months'  },
  { value: 'all',      label: 'All time'   },
] as const

export function PeriodSelector() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const current      = searchParams.get('period') ?? 'month'

  function setPeriod(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-5">
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setPeriod(value)}
          className={cn(
            'text-sm transition-colors pb-px',
            current === value
              ? 'text-[#37352F] font-medium border-b border-[#37352F]'
              : 'text-[#787774] hover:text-[#37352F]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

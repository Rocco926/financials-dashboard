'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, List, Target, Wallet, LogOut, ChevronDown, BarChart2, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'

const topLinks = [
  { href: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/holdings', label: 'Holdings',  icon: Wallet          },
]

const bottomLinks = [
  { href: '/budgets',       label: 'Budgets',    icon: Target        },
  { href: '/analytics',     label: 'Analytics',  icon: BarChart2     },
  { href: '/subscriptions', label: 'Recurring',  icon: RefreshCw     },
  { href: '/anomalies',     label: 'Anomalies',  icon: AlertTriangle },
]

const transactionSubItems = [
  { href: '/transactions',    label: 'Ledger'  },
  { href: '/import',          label: 'Import'  },
  { href: '/import/history',  label: 'History' },
]

export function Nav() {
  const pathname = usePathname()

  // Transactions group is expanded whenever we're on any sub-route
  const txExpanded =
    pathname === '/transactions' ||
    pathname.startsWith('/transactions/') ||
    pathname === '/import' ||
    pathname.startsWith('/import/')

  return (
    <nav className="w-[220px] shrink-0 flex flex-col bg-white m-3 mr-0 rounded-2xl shadow-ambient">
      {/* App title */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-sm font-bold text-on-surface tracking-tight">The Ledger</p>
        <p className="text-[10px] text-secondary mt-0.5 uppercase tracking-widest font-medium">Personal Finance</p>
      </div>

      {/* Nav links */}
      <ul className="flex-1 px-3 space-y-0.5">

        {/* Top links: Dashboard, Holdings */}
        {topLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2.5 py-2.5 px-3 text-sm rounded-full transition-all duration-200',
                  active
                    ? 'bg-secondary-container text-on-surface font-semibold'
                    : 'text-secondary hover:bg-surface-container-low hover:text-on-surface',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', active ? 'text-on-surface' : 'text-secondary')}
                  strokeWidth={active ? 2 : 1.5}
                />
                {label}
              </Link>
            </li>
          )
        })}

        {/* Transactions — expandable group */}
        <li>
          <Link
            href="/transactions"
            className={cn(
              'flex items-center gap-2.5 py-2.5 px-3 text-sm rounded-full transition-all duration-200',
              txExpanded
                ? 'bg-secondary-container text-on-surface font-semibold'
                : 'text-secondary hover:bg-surface-container-low hover:text-on-surface',
            )}
          >
            <List
              className={cn('size-4 shrink-0', txExpanded ? 'text-on-surface' : 'text-secondary')}
              strokeWidth={txExpanded ? 2 : 1.5}
            />
            <span className="flex-1">Transactions</span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform duration-200',
                txExpanded ? 'rotate-0 text-secondary' : '-rotate-90 text-secondary/50',
              )}
              strokeWidth={1.5}
            />
          </Link>

          {/* Sub-items */}
          {txExpanded && (
            <ul className="mt-0.5 space-y-0.5">
              {transactionSubItems.map(({ href, label }) => {
                const active = pathname === href
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        'flex items-center py-1.5 pr-3 text-xs rounded-full transition-all duration-200',
                        'pl-[2.375rem]', // aligns with parent label text (icon 16px + gap 10px + indent)
                        active
                          ? 'text-on-surface font-semibold bg-surface-container-low'
                          : 'text-secondary hover:text-on-surface hover:bg-surface-container-low',
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </li>

        {/* Bottom links: Budgets */}
        {bottomLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2.5 py-2.5 px-3 text-sm rounded-full transition-all duration-200',
                  active
                    ? 'bg-secondary-container text-on-surface font-semibold'
                    : 'text-secondary hover:bg-surface-container-low hover:text-on-surface',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', active ? 'text-on-surface' : 'text-secondary')}
                  strokeWidth={active ? 2 : 1.5}
                />
                {label}
              </Link>
            </li>
          )
        })}

      </ul>

      {/* Sign out */}
      <div className="px-3 pb-4 pt-2">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2.5 w-full py-2.5 px-3 text-sm text-secondary hover:bg-surface-container-low hover:text-on-surface rounded-full transition-all duration-200"
        >
          <LogOut className="size-4 shrink-0 text-secondary" strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </nav>
  )
}

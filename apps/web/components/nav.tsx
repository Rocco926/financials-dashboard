'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, List, Target, Wallet, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'

const links = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/holdings',     label: 'Holdings',     icon: Wallet          },
  { href: '/transactions', label: 'Transactions', icon: List            },
  { href: '/budgets',      label: 'Budgets',      icon: Target          },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="w-[220px] shrink-0 flex flex-col bg-[#FBFAF8] border-r border-[#E9E7E2]">
      {/* App title */}
      <div className="px-4 pt-5 pb-3">
        <p className="text-sm font-semibold text-[#37352F]">Finance</p>
        <p className="text-[11px] text-[#ACABA8] mt-0.5">Personal dashboard</p>
      </div>

      {/* Nav links */}
      <ul className="flex-1 px-2 space-y-px pt-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2 py-1.5 px-2.5 text-sm rounded-md transition-colors',
                  active
                    ? 'bg-[#EDEBE7] text-[#37352F] font-medium'
                    : 'text-[#787774] hover:bg-[#F1EFE9] hover:text-[#37352F]',
                )}
              >
                <Icon
                  className={cn('size-[15px] shrink-0', active ? 'text-[#37352F]' : 'text-[#ACABA8]')}
                  strokeWidth={1.5}
                />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Sign out */}
      <div className="px-2 pb-4 pt-2 border-t border-[#E9E7E2]">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 w-full py-1.5 px-2.5 text-sm text-[#ACABA8] hover:bg-[#F1EFE9] hover:text-[#787774] rounded-md transition-colors"
        >
          <LogOut className="size-[15px] shrink-0" strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </nav>
  )
}

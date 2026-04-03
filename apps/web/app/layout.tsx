import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/nav'
import { auth } from '@/auth'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

export const metadata: Metadata = {
  title: 'Finance Dashboard',
  description: 'Personal finance tracking',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="en">
      <body className={dmSans.className}>
        <div className="flex h-dvh bg-[#F7F6F3]">
          {session && <Nav />}
          <main className="flex-1 overflow-auto text-pretty">{children}</main>
        </div>
      </body>
    </html>
  )
}

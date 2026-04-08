import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/nav'
import { auth } from '@/auth'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

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
      <body className={inter.className}>
        <div className="flex h-dvh bg-surface">
          {session && <Nav />}
          <main className="flex-1 overflow-auto bg-surface p-10">{children}</main>
        </div>
      </body>
    </html>
  )
}

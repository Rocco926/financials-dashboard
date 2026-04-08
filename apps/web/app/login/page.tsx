'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const data = new FormData(e.currentTarget)
    const result = await signIn('credentials', {
      email: data.get('email'),
      password: data.get('password'),
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const inputCls =
    'w-full h-14 px-5 bg-surface-container-low border-none rounded-xl text-on-surface text-sm placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-secondary focus:bg-white transition-all duration-200'

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Minimal header */}
      <header className="flex items-center gap-3 px-8 py-6">
        <svg
          className="w-5 h-5 text-secondary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9.5V21h18V9.5M1 10l11-8 11 8" />
          <rect x="9" y="14" width="6" height="7" />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-on-surface" style={{ letterSpacing: '-0.02em' }}>
          The Ledger
        </span>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-20">
        <div className="w-full max-w-[400px]">

          {/* Branding */}
          <div className="mb-12">
            <h2 className="text-3xl font-semibold text-on-surface mb-3" style={{ letterSpacing: '-0.03em' }}>
              Welcome back.
            </h2>
            <p className="text-on-surface-variant leading-relaxed">
              Enter your credentials to access your personal digital atelier.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant ml-1">
                Email Address
              </label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="hello@example.com"
                className={inputCls}
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant ml-1">
                Password
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-secondary transition-colors px-2 py-1 text-xs font-medium"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-tertiary bg-tertiary-container rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#37352f] text-white rounded-full font-semibold tracking-tight hover:shadow-lg active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign In'}
                {!loading && (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-16 flex justify-center">
            <div className="w-12 h-px bg-outline-variant opacity-30" />
          </div>

          {/* Security card */}
          <div className="mt-12 p-6 rounded-xl bg-surface-container border border-outline-variant/10 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-on-background">Secure Infrastructure</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Your financial data is encrypted and managed with bank-level security protocols.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 text-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-outline opacity-60">
          The Ledger © 2024 • Crafted with intent
        </span>
      </footer>
    </div>
  )
}

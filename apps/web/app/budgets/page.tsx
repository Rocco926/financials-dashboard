import Link from 'next/link'
import { Target } from 'lucide-react'

export default function BudgetsPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Budgets</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <Target className="w-10 h-10 text-gray-300 mx-auto mb-4" />
        <h2 className="text-base font-medium text-gray-700 mb-2">Coming soon</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Budget goals and per-category spend tracking will be added here once
          transaction categorisation is set up.
        </p>
        <Link
          href="/transactions"
          className="inline-block mt-6 text-sm underline text-gray-600 hover:text-gray-900"
        >
          Go to transactions →
        </Link>
      </div>
    </div>
  )
}

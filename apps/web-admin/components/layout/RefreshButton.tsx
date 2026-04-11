'use client'

import { useRouter } from 'next/navigation'

export function RefreshButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.refresh()}
      className="px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-secondary transition-colors"
    >
      Refresh
    </button>
  )
}

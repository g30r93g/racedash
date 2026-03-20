'use client'

import { useState } from 'react'

interface RevokeLicenseDialogProps {
  userId: string
  licenseId: string
  tier: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function RevokeLicenseDialog({
  userId,
  licenseId,
  tier,
  open,
  onClose,
  onSuccess,
}: RevokeLicenseDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleRevoke() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin-proxy/users/${userId}/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        onSuccess()
        onClose()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body?.error?.message ?? 'Failed to revoke license')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-2">Revoke License</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This will cancel the user&apos;s {tier.toUpperCase()} license. This action cannot be
          undone.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleRevoke}
            disabled={submitting}
            className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
          >
            {submitting ? 'Revoking...' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  )
}

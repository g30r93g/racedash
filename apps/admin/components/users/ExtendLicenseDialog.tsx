'use client'

import { useState } from 'react'

interface ExtendLicenseDialogProps {
  userId: string
  licenseId: string
  currentExpiresAt: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ExtendLicenseDialog({
  userId,
  licenseId,
  currentExpiresAt,
  open,
  onClose,
  onSuccess,
}: ExtendLicenseDialogProps) {
  const [expiresAt, setExpiresAt] = useState(
    new Date(new Date(currentExpiresAt).getTime() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  )
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin-proxy/users/${userId}/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: new Date(expiresAt).toISOString() }),
      })
      if (res.ok) {
        onSuccess()
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Extend License</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Current expiry: {new Date(currentExpiresAt).toLocaleDateString('en-GB')}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Expires At</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Extending...' : 'Extend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

interface IssueLicenseDialogProps {
  userId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function IssueLicenseDialog({ userId, open, onClose, onSuccess }: IssueLicenseDialogProps) {
  const [tier, setTier] = useState<'plus' | 'pro'>('plus')
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10))
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin-proxy/users/${userId}/licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          startsAt: new Date(startsAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        }),
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
        <h2 className="text-lg font-semibold mb-4">Issue New License</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as 'plus' | 'pro')}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            >
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Starts At</label>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expires At</label>
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
              {submitting ? 'Issuing...' : 'Issue License'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

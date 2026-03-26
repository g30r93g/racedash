'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog'

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
    new Date(new Date(currentExpiresAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin-proxy/users/${userId}/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: new Date(expiresAt).toISOString() }),
      })
      if (res.ok) {
        onSuccess()
        onClose()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body?.error?.message ?? 'Failed to extend license')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend License</DialogTitle>
          <DialogDescription>
            Current expiry: {new Date(currentExpiresAt).toLocaleDateString('en-GB')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Expires At</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Extending...' : 'Extend'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

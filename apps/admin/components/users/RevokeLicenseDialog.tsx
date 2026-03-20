'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

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
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Revoke License</DialogTitle>
      <DialogDescription>
        This will cancel the user&apos;s {tier.toUpperCase()} license. This action cannot be undone.
      </DialogDescription>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" disabled={submitting} onClick={handleRevoke}>
          {submitting ? 'Revoking...' : 'Revoke'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

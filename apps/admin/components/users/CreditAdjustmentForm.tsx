'use client'

import { useState } from 'react'

interface CreditAdjustmentFormProps {
  userId: string
  onSuccess: () => void
}

export function CreditAdjustmentForm({ userId, onSuccess }: CreditAdjustmentFormProps) {
  const [rcAmount, setRcAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedAmount = parseInt(rcAmount, 10)
  const isValid = !isNaN(parsedAmount) && parsedAmount !== 0 && reason.trim().length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin-proxy/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rcAmount: parsedAmount, reason: reason.trim() }),
      })

      if (res.ok) {
        setRcAmount('')
        setReason('')
        onSuccess()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body?.error?.message ?? 'Failed to apply adjustment')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold">Credit Adjustment</h3>
      <div className="flex gap-3">
        <div className="w-32">
          <label className="block text-xs text-muted-foreground mb-1">RC Amount</label>
          <input
            type="number"
            value={rcAmount}
            onChange={(e) => setRcAmount(e.target.value)}
            placeholder="e.g. 50 or -10"
            className="w-full px-3 py-1.5 border border-border rounded-md text-sm bg-background"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Reason for adjustment"
            className="w-full px-3 py-1.5 border border-border rounded-md text-sm bg-background"
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={!isValid || submitting}
        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Applying...' : 'Apply Adjustment'}
      </button>
    </form>
  )
}

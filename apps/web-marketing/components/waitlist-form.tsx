'use client'

import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type WaitlistFormProps = {
  placeholder: string
  submitLabel: string
  successMessage: string
  errorMessage: string
  className?: string
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

// Single-field email form. Posts to /api/waitlist, which forwards to the
// RaceDash API. Optimistic states on the button, with reduced-motion-safe
// visual feedback. No external form library — this is the only form on the
// site and doesn't need the weight.
export function WaitlistForm({ placeholder, submitLabel, successMessage, errorMessage, className }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      setStatus('success')
      setEmail('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn('w-full max-w-md', className)}>
      <div
        className={cn(
          'glass-tile-sm flex items-center gap-2 p-2 transition-colors',
          status === 'error' && 'border-[color:var(--color-destructive)]/60',
          status === 'success' && 'border-accent/70',
        )}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting' || status === 'success'}
          placeholder={placeholder}
          aria-label="Email address"
          className="text-foreground-strong placeholder:text-foreground-dim flex-1 bg-transparent px-4 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={status === 'submitting' || status === 'success'}
          className="bg-accent hover:bg-accent-strong inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-[color:var(--color-background)] transition-all disabled:opacity-70"
        >
          {status === 'submitting' && <Loader2 className="size-4 animate-spin" />}
          {status === 'success' && <Check className="size-4" />}
          {status === 'idle' && <ArrowRight className="size-4" />}
          {status === 'error' && <ArrowRight className="size-4" />}
          <span>{submitLabel}</span>
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'mt-3 min-h-[1.25rem] text-sm transition-opacity',
          status === 'success' && 'text-accent',
          status === 'error' && 'text-[color:var(--color-destructive)]',
          status === 'idle' || (status === 'submitting' && 'opacity-0'),
        )}
      >
        {status === 'success' && successMessage}
        {status === 'error' && errorMessage}
      </p>
    </form>
  )
}

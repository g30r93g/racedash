'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { AuthField } from '@/components/auth/auth-field'
import { formatClerkError } from '@/components/auth/clerk-errors'

type VerifyCodeFormProps = {
  submitLabel: string
  codeLabel: string
  onVerify: (code: string) => Promise<void>
  onResend?: () => Promise<void>
}

// 6-digit verification code input. Used by the sign-up flow (email
// verification) and could be used by sign-in for 2FA if we enable it later.
export function VerifyCodeForm({ submitLabel, codeLabel, onVerify, onResend }: VerifyCodeFormProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sent'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await onVerify(code)
    } catch (err: unknown) {
      setError(formatClerkError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!onResend) return
    try {
      await onResend()
      setResendState('sent')
      setError('')
    } catch (err: unknown) {
      setError(formatClerkError(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <AuthField
        id="verify-code"
        label={codeLabel}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        autoFocus
        maxLength={6}
        placeholder="000000"
        className="text-center font-mono text-xl tracking-[0.4em]"
      />

      {error && (
        <p role="alert" className="text-[color:var(--color-destructive)] text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent hover:bg-accent-strong inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </button>

      {onResend && (
        <button
          type="button"
          onClick={handleResend}
          className="text-foreground-dim hover:text-accent text-xs transition-colors"
        >
          {resendState === 'sent' ? 'Sent — check your inbox' : 'Resend code'}
        </button>
      )}
    </form>
  )
}

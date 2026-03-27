'use client'

import { useState } from 'react'
import { formatClerkError } from '@/lib/clerk-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VerifyCodeFormProps {
  title: string
  subtitle: string
  submitLabel?: string
  onVerify: (code: string) => Promise<void>
  onResend?: () => Promise<void>
}

export function VerifyCodeForm({
  title,
  subtitle,
  submitLabel = 'Verify',
  onVerify,
  onResend,
}: VerifyCodeFormProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="verify-code">Verification code</Label>
          <Input
            id="verify-code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            className="text-center text-lg tracking-widest"
            placeholder="000000"
            maxLength={6}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isSubmitting} size="lg">
          {isSubmitting ? 'Verifying...' : submitLabel}
        </Button>

        {onResend && (
          <Button
            type="button"
            variant="link"
            onClick={async () => {
              try {
                await onResend()
                setError('')
              } catch (err: unknown) {
                setError(formatClerkError(err))
              }
            }}
            className="h-auto p-0 text-sm text-muted-foreground"
          >
            Resend code
          </Button>
        )}
      </form>
    </div>
  )
}

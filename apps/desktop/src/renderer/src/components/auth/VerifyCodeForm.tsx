import { useState } from 'react'
import { formatClerkError } from './clerk-errors'

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
}: VerifyCodeFormProps): React.ReactElement {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
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
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/50">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="verify-code" className="text-sm font-medium text-white/70">Verification code</label>
          <input
            id="verify-code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-lg tracking-widest text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="000000"
            maxLength={6}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Verifying...' : submitLabel}
        </button>

        {onResend && (
          <button
            type="button"
            onClick={async () => {
              try {
                await onResend()
                setError('')
              } catch (err: unknown) {
                setError(formatClerkError(err))
              }
            }}
            className="text-sm text-white/50 underline underline-offset-2 hover:text-white/70"
          >
            Resend code
          </button>
        )}
      </form>
    </div>
  )
}

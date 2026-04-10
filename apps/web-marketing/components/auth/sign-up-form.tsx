'use client'

import { useClerk, useSignUp } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthField } from '@/components/auth/auth-field'
import { formatClerkError } from '@/components/auth/clerk-errors'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type SignUpFormProps = {
  locale: Locale
  dict: Dictionary['account']
}

// Custom sign-up form using Clerk's headless `useSignUp` hook with the
// current v7 (Core 3) signal-based API. Flow:
//   1. User enters email + password
//   2. `signUp.password(...)` creates the pending sign-up
//   3. `signUp.verifications.sendEmailCode()` fires the verification email
//   4. Form swaps to VerifyCodeForm; user enters the code
//   5. `signUp.verifications.verifyEmailCode({ code })` completes sign-up
//   6. `clerk.setActive(...)` finalizes the session
//
// Uses Clerk's embedded CAPTCHA element (#clerk-captcha) so we don't have
// to integrate a third-party bot check ourselves.
export function SignUpForm({ locale, dict }: SignUpFormProps) {
  const { signUp } = useSignUp()
  const clerk = useClerk()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)

  if (!signUp) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="text-foreground-dim size-5 animate-spin" />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!signUp) return

    setError('')
    setIsSubmitting(true)
    try {
      const { error: signUpError } = await signUp.password({
        emailAddress: email,
        password,
      })

      if (signUpError) {
        setError(formatClerkError(signUpError))
        return
      }

      await signUp.verifications.sendEmailCode()
      setPendingVerification(true)
    } catch (err: unknown) {
      setError(formatClerkError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (pendingVerification) {
    return (
      <div>
        <p className="text-foreground-dim mb-6 text-sm leading-relaxed">
          {dict.signUp.verifyBody.replace('{email}', email)}
        </p>
        <VerifyCodeForm
          submitLabel={dict.signUp.verifySubmit}
          codeLabel={dict.signUp.codeLabel}
          onVerify={async (code) => {
            if (!signUp) return
            await signUp.verifications.verifyEmailCode({ code })
            if (signUp.status === 'complete') {
              await clerk.setActive({ session: signUp.createdSessionId })
              router.push(`/${locale}/account`)
              return
            }
            throw new Error('Verification could not be completed. Please try again.')
          }}
          onResend={async () => {
            if (!signUp) return
            await signUp.verifications.sendEmailCode()
          }}
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <AuthField
        id="sign-up-email"
        label={dict.signUp.emailLabel}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={dict.signUp.emailPlaceholder}
        required
        autoFocus
      />
      <AuthField
        id="sign-up-password"
        label={dict.signUp.passwordLabel}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={dict.signUp.passwordPlaceholder}
        required
      />

      {error && (
        <p role="alert" className="text-[color:var(--color-destructive)] text-sm">
          {error}
        </p>
      )}

      {/* Clerk-managed Cloudflare Turnstile CAPTCHA. Clerk mounts into this
          element automatically when the hook is loaded. */}
      <div id="clerk-captcha" data-cl-theme="dark" data-cl-size="flexible" />

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent hover:bg-accent-strong mt-2 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {dict.signUp.submit}
      </button>

      <p className="text-foreground-dim text-center text-xs leading-relaxed">
        {dict.signUp.termsNotice}{' '}
        <Link
          href={`/${locale}/terms`}
          className="text-accent hover:text-accent-strong underline decoration-[color:var(--color-accent)]/40 underline-offset-2"
        >
          Terms
        </Link>{' '}
        ·{' '}
        <Link
          href={`/${locale}/privacy`}
          className="text-accent hover:text-accent-strong underline decoration-[color:var(--color-accent)]/40 underline-offset-2"
        >
          Privacy
        </Link>
      </p>
    </form>
  )
}

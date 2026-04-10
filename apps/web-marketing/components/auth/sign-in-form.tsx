'use client'

import { useClerk, useSignIn } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AuthField } from '@/components/auth/auth-field'
import { formatClerkError } from '@/components/auth/clerk-errors'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type SignInFormProps = {
  locale: Locale
  dict: Dictionary['account']
}

// Custom sign-in form using Clerk's headless `useSignIn` hook. Mirrors the
// desktop app's flow (email + password, optional email-code second factor)
// but rebuilt in the marketing site's glass-tile aesthetic.
//
// Uses the current Clerk v7 (Core 3) signal-based API:
//   - `signIn.password(...)` returns a structured `{ error }` result
//   - status reads happen on the signIn object after the call resolves
//   - `clerk.setActive(...)` finalizes the session
//
// On success we route to /<locale>/account.
export function SignInForm({ locale, dict }: SignInFormProps) {
  const { signIn } = useSignIn()
  const clerk = useClerk()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  if (!signIn) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="text-foreground-dim size-5 animate-spin" />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!signIn) return

    setError('')
    setIsSubmitting(true)
    try {
      const { error: signInError } = await signIn.password({
        emailAddress: email,
        password,
      })

      if (signInError) {
        setError(formatClerkError(signInError))
        return
      }

      if (signIn.status === 'complete') {
        await clerk.setActive({ session: signIn.createdSessionId })
        router.push(`/${locale}/account`)
        return
      }

      if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        await signIn.mfa.sendEmailCode()
        setNeedsVerification(true)
        return
      }

      setError(`Sign-in could not be completed (status: ${signIn.status}).`)
    } catch (err: unknown) {
      setError(formatClerkError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (needsVerification) {
    return (
      <VerifyCodeForm
        submitLabel={dict.signUp.verifySubmit}
        codeLabel={dict.signUp.codeLabel}
        onVerify={async (code) => {
          if (!signIn) return
          await signIn.mfa.verifyEmailCode({ code })
          if (signIn.status === 'complete') {
            await clerk.setActive({ session: signIn.createdSessionId })
            router.push(`/${locale}/account`)
            return
          }
          throw new Error('Verification could not be completed. Please try again.')
        }}
        onResend={async () => {
          if (!signIn) return
          await signIn.mfa.sendEmailCode()
        }}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <AuthField
        id="sign-in-email"
        label={dict.signIn.emailLabel}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={dict.signIn.emailPlaceholder}
        required
        autoFocus
      />
      <AuthField
        id="sign-in-password"
        label={dict.signIn.passwordLabel}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={dict.signIn.passwordPlaceholder}
        required
      />

      {error && (
        <p role="alert" className="text-[color:var(--color-destructive)] text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-accent hover:bg-accent-strong mt-2 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {dict.signIn.submit}
      </button>

      <div className="text-center">
        <Link
          href={`/${locale}/account/forgot-password`}
          className="text-foreground-dim hover:text-accent text-xs transition-colors"
        >
          {dict.signIn.forgotPassword}
        </Link>
      </div>
    </form>
  )
}

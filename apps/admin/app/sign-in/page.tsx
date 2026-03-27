'use client'

import { useState } from 'react'
import { useSignIn, useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { formatClerkError } from '@/lib/clerk-errors'
import { VerifyCodeForm } from '@/components/auth/VerifyCodeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignInPage() {
  const { signIn } = useSignIn()
  const clerk = useClerk()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

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
        router.push('/')
      } else if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        await signIn.mfa.sendEmailCode()
        setNeedsVerification(true)
      } else {
        setError(`Unexpected sign-in status: ${signIn.status}`)
      }
    } catch (err: unknown) {
      setError(formatClerkError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (needsVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <VerifyCodeForm
          title="Verify your identity"
          subtitle={`We sent a code to ${email}`}
          submitLabel="Verify"
          onVerify={async (code) => {
            if (!signIn) return
            await signIn.mfa.verifyEmailCode({ code })
            if (signIn.status === 'complete') {
              await clerk.setActive({ session: signIn.createdSessionId })
              router.push('/')
            } else {
              throw new Error('Verification could not be completed. Please try again.')
            }
          }}
          onResend={async () => {
            if (!signIn) return
            await signIn.mfa.sendEmailCode()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">RaceDash Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Your password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={isSubmitting || !signIn} size="lg">
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useSignIn, useClerk } from '@clerk/react'
import { formatClerkError } from './clerk-errors'
import { VerifyCodeForm } from './VerifyCodeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SignInFormProps {
  onToggleSignUp: () => void
}

export function SignInForm({ onToggleSignUp }: SignInFormProps): React.ReactElement {
  const { signIn } = useSignIn()
  const clerk = useClerk()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
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
      <VerifyCodeForm
        title="Verify your identity"
        subtitle={`We sent a code to ${email}`}
        submitLabel="Verify"
        onVerify={async (code) => {
          if (!signIn) return
          await signIn.mfa.verifyEmailCode({ code })
          if (signIn.status === 'complete') {
            await clerk.setActive({ session: signIn.createdSessionId })
          } else {
            throw new Error('Verification could not be completed. Please try again.')
          }
        }}
        onResend={async () => {
          if (!signIn) return
          await signIn.mfa.sendEmailCode()
        }}
      />
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Sign in to RaceDash</h1>
        <p className="mt-1 text-sm text-white/50">Enter your email and password</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-white/70">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-white/70">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
            placeholder="Your password"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" disabled={isSubmitting || !signIn} variant="default">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-white/50">
        Don&apos;t have an account?{' '}
        <Button variant="link" onClick={onToggleSignUp} className="h-auto p-0 text-white hover:text-white/80">
          Sign up
        </Button>
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useSignUp, useClerk } from '@clerk/react'
import { formatClerkError } from './clerk-errors'
import { VerifyCodeForm } from './VerifyCodeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SignUpFormProps {
  onToggleSignIn: () => void
}

export function SignUpForm({ onToggleSignIn }: SignUpFormProps): React.ReactElement {
  const { signUp } = useSignUp()
  const clerk = useClerk()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!signUp) return

    setError('')
    setIsSubmitting(true)

    try {
      const { error: signUpError } = await signUp.password({
        firstName,
        lastName,
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
      <VerifyCodeForm
        title="Verify your email"
        subtitle={`We sent a code to ${email}`}
        submitLabel="Verify email"
        onVerify={async (code) => {
          if (!signUp) return
          await signUp.verifications.verifyEmailCode({ code })
          if (signUp.status === 'complete') {
            await clerk.setActive({ session: signUp.createdSessionId })
          } else {
            throw new Error('Verification could not be completed. Please try again.')
          }
        }}
        onResend={async () => {
          if (!signUp) return
          await signUp.verifications.sendEmailCode()
        }}
      />
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-white/50">Sign up to start using RaceDash Cloud</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="signup-first-name" className="text-sm font-medium text-white/70">
              First name
            </Label>
            <Input
              id="signup-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
              placeholder="George"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="signup-last-name" className="text-sm font-medium text-white/70">
              Last name
            </Label>
            <Input
              id="signup-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
              placeholder="Gorzynski"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-email" className="text-sm font-medium text-white/70">
            Email
          </Label>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password" className="text-sm font-medium text-white/70">
            Password
          </Label>
          <Input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/20"
            placeholder="Choose a password"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* CAPTCHA placeholder — Clerk renders Cloudflare Turnstile here */}
        <div id="clerk-captcha" data-cl-theme="dark" data-cl-size="compact" />

        <Button type="submit" disabled={isSubmitting || !signUp} variant="default">
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-white/50">
        Already have an account?{' '}
        <Button variant="link" onClick={onToggleSignIn} className="h-auto p-0 text-white hover:text-white/80">
          Sign in
        </Button>
      </p>
    </div>
  )
}

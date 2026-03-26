import { useState } from 'react'
import { useSignUp } from '@clerk/react'

interface SignUpFormProps {
  onToggleSignIn: () => void
}

export function SignUpForm({ onToggleSignIn }: SignUpFormProps): React.ReactElement {
  const { signUp, setActive, isLoaded } = useSignUp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!isLoaded || !signUp) return

    setError('')
    setIsSubmitting(true)

    try {
      await signUp.create({
        emailAddress: email,
        password,
      })

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-up failed'
      const clerkErr = err as { errors?: { longMessage?: string }[] }
      setError(clerkErr.errors?.[0]?.longMessage ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerify(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!isLoaded || !signUp) return

    setError('')
    setIsSubmitting(true)

    try {
      const result = await signUp.attemptEmailAddressVerification({ code })

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
      } else {
        setError('Verification could not be completed. Please try again.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed'
      const clerkErr = err as { errors?: { longMessage?: string }[] }
      setError(clerkErr.errors?.[0]?.longMessage ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (pendingVerification) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Verify your email</h1>
          <p className="mt-1 text-sm text-white/50">We sent a code to {email}</p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-medium text-white/70">Verification code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-lg tracking-widest text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
              placeholder="000000"
              maxLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !isLoaded}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying...' : 'Verify email'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-white/50">Sign up to start using RaceDash Cloud</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signup-email" className="text-sm font-medium text-white/70">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="signup-password" className="text-sm font-medium text-white/70">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="Choose a password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isLoaded}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-white/50">
        Already have an account?{' '}
        <button onClick={onToggleSignIn} className="text-white underline underline-offset-2 hover:text-white/80">
          Sign in
        </button>
      </p>
    </div>
  )
}

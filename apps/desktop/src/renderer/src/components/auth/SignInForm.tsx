import { useState } from 'react'
import { useSignIn, useClerk } from '@clerk/react'
import { formatClerkError } from './clerk-errors'

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

      console.log('[SignInForm] signIn.status:', signIn.status, 'createdSessionId:', signIn.createdSessionId)

      if (signIn.status === 'complete') {
        await clerk.setActive({ session: signIn.createdSessionId })
      } else {
        setError(`Sign-in requires additional steps (status: ${signIn.status ?? 'unknown'}). Please try again.`)
      }
    } catch (err: unknown) {
      setError(formatClerkError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Sign in to RaceDash</h1>
        <p className="mt-1 text-sm text-white/50">Enter your email and password</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-white/70">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-white/70">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="Your password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !signIn}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-white/50">
        Don&apos;t have an account?{' '}
        <button onClick={onToggleSignUp} className="text-white underline underline-offset-2 hover:text-white/80">
          Sign up
        </button>
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useUser } from '@clerk/react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps): React.ReactElement {
  const { isSignedIn, isLoaded } = useUser()
  const [showSignUp, setShowSignUp] = useState(false)

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-full items-center justify-center bg-black/80 backdrop-blur-sm">
        {showSignUp ? (
          <SignUpForm onToggleSignIn={() => setShowSignUp(false)} />
        ) : (
          <SignInForm onToggleSignUp={() => setShowSignUp(true)} />
        )}
      </div>
    )
  }

  return <>{children}</>
}

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps): React.ReactElement | null {
  const { isSignedIn } = useUser()
  const [showSignUp, setShowSignUp] = useState(false)

  // Auto-close when sign-in succeeds
  useEffect(() => {
    if (isSignedIn && open) {
      onClose()
    }
  }, [isSignedIn, open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="relative rounded-xl border border-white/10 bg-[#1a1a1a] p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-white/40 hover:text-white/70"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {showSignUp ? (
          <SignUpForm onToggleSignIn={() => setShowSignUp(false)} />
        ) : (
          <SignInForm onToggleSignUp={() => setShowSignUp(true)} />
        )}
      </div>
    </div>
  )
}

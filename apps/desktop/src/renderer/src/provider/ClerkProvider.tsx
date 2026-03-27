import { ClerkProvider as BaseClerkProvider } from '@clerk/react'
import { getClerkInstance } from '../../lib/clerk'
import type { PropsWithChildren } from 'react'

export function RaceDashClerkProvider({ children }: PropsWithChildren): React.ReactElement {
  return (
    <BaseClerkProvider
      Clerk={getClerkInstance()}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </BaseClerkProvider>
  )
}

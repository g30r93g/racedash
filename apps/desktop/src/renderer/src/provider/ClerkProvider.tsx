import { ClerkProvider as BaseClerkProvider } from '@clerk/react'
import { Clerk } from '@clerk/clerk-js'
import type { PropsWithChildren } from 'react'

export function RaceDashClerkProvider({ children }: PropsWithChildren): React.ReactElement {
  return (
    <BaseClerkProvider
      Clerk={Clerk}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </BaseClerkProvider>
  )
}

import { ClerkProvider as BaseClerkProvider } from '@clerk/react'
import type { ClerkProp } from '@clerk/react'
import type { PropsWithChildren } from 'react'
import { getClerkInstance } from '../../lib/clerk'

export function RaceDashClerkProvider({ children }: PropsWithChildren): React.ReactElement {
  const clerkInstance = getClerkInstance() as unknown as ClerkProp

  return (
    <BaseClerkProvider
      Clerk={clerkInstance}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </BaseClerkProvider>
  )
}

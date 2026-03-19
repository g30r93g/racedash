import { createClerkClient } from '@clerk/backend'

let clerkClient: ReturnType<typeof createClerkClient> | null = null

export function getClerkClient() {
  if (!clerkClient) {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new Error('CLERK_SECRET_KEY environment variable is required')
    clerkClient = createClerkClient({ secretKey })
  }
  return clerkClient
}

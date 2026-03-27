import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/sign-in', '/access-denied'])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()
  const { pathname } = request.nextUrl

  // Unauthenticated users can only access public routes
  if (!userId && !isPublicRoute(request)) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  // Redirect signed-in users away from sign-in page
  if (userId && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Authenticated non-admin users get redirected to access-denied (but not if already there)
  if (userId && pathname !== '/access-denied') {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const role = (user.publicMetadata as Record<string, unknown>)?.role
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/access-denied', request.url))
    }
  }
})

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}

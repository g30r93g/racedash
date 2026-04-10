import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales } from '@/lib/i18n'

// Paths that should skip locale handling entirely.
const EXCLUDED = /^\/(_next|api|favicon\.ico|robots\.txt|sitemap\.xml|llms\.txt|.*\..*).*/

function detectLocale(request: NextRequest): string {
  // 1. Cookie preference (set by the user via the locale switcher).
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale
  }

  // 2. Accept-Language header, picking the first locale we support.
  const header = request.headers.get('accept-language') ?? ''
  const preferred = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().split('-')[0])
    .filter(Boolean)
  for (const tag of preferred) {
    if (tag && (locales as readonly string[]).includes(tag)) {
      return tag
    }
  }

  // 3. Fall back to default.
  return defaultLocale
}

function handleLocale(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (EXCLUDED.test(pathname)) {
    return NextResponse.next()
  }

  const hasLocale = (locales as readonly string[]).some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  )
  if (hasLocale) {
    return NextResponse.next()
  }

  const locale = detectLocale(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

// Compose Clerk's middleware on top of the locale handler so `auth()` works
// in server components under /account. clerkMiddleware is a no-op for any
// request that doesn't need auth, so it's safe to apply site-wide.
//
// When Clerk env vars aren't configured (pre-launch, local dev without a
// Clerk project), clerkMiddleware still runs but the auth() calls inside
// account routes will throw. The marketing site's public pages remain
// unaffected.
export default clerkMiddleware(async (_auth, request) => handleLocale(request))

export const config = {
  matcher: [
    // Run middleware on everything except static assets and image optimization.
    '/((?!_next/static|_next/image|.*\\..*).*)',
  ],
}

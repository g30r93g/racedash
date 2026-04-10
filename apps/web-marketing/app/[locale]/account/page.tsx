import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AccountDashboard } from '@/components/auth/account-dashboard'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'

// This page is dynamic because it calls `auth()` — that's the server-side
// auth gate. Force-dynamic so Next doesn't try to prerender it as static.
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    title: dict.account.metadata.title,
    description: dict.account.metadata.description,
    robots: { index: false, follow: false },
  }
}

export default async function AccountHome({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale

  // Server-side auth gate. We check Clerk's session before rendering the
  // dashboard — unauthenticated visitors are bounced to /account/authenticate
  // BEFORE the dashboard ever mounts. This is the gate; the AccountDashboard
  // client component assumes it's always rendered with a signed-in user.
  const { userId } = await auth()
  if (!userId) {
    redirect(`/${typedLocale}/account/authenticate`)
  }

  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <AccountDashboard locale={typedLocale} dict={dict.account} />
    </PageShell>
  )
}

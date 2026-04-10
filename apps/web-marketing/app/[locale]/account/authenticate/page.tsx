import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignInForm } from '@/components/auth/sign-in-form'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'

type PageProps = {
  params: Promise<{ locale: string }>
}

export const metadata: Metadata = {
  title: 'Sign in — RaceDash',
  description: 'Sign in to your RaceDash account.',
  robots: { index: false, follow: false },
}

export default async function AuthenticatePage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <AuthShell
        eyebrow={dict.account.signIn.eyebrow}
        heading={dict.account.signIn.heading}
        body={dict.account.signIn.body}
        footer={
          <p className="text-foreground-dim">
            {dict.account.signIn.noAccount}{' '}
            <Link
              href={`/${typedLocale}/account/create`}
              className="text-accent hover:text-accent-strong font-medium transition-colors"
            >
              {dict.account.signIn.createAccount}
            </Link>
          </p>
        }
      >
        <SignInForm locale={typedLocale} dict={dict.account} />
      </AuthShell>
    </PageShell>
  )
}

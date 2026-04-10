import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'

type PageProps = {
  params: Promise<{ locale: string }>
}

export const metadata: Metadata = {
  title: 'Create account — RaceDash',
  description: 'Create your RaceDash account.',
  robots: { index: false, follow: false },
}

export default async function CreateAccountPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <AuthShell
        eyebrow={dict.account.signUp.eyebrow}
        heading={dict.account.signUp.heading}
        body={dict.account.signUp.body}
        footer={
          <p className="text-foreground-dim">
            {dict.account.signUp.haveAccount}{' '}
            <Link
              href={`/${typedLocale}/account/authenticate`}
              className="text-accent hover:text-accent-strong font-medium transition-colors"
            >
              {dict.account.signUp.signIn}
            </Link>
          </p>
        }
      >
        <SignUpForm locale={typedLocale} dict={dict.account} />
      </AuthShell>
    </PageShell>
  )
}

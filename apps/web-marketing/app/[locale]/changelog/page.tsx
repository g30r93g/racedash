import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChronographAperture } from '@/components/brand/chronograph-aperture'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'

type PageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    title: dict.changelog.metadata.title,
    description: dict.changelog.metadata.description,
  }
}

export default async function ChangelogPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <section className="py-32 md:py-40">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-6 text-center md:px-10">
          <div className="eyebrow mb-6">— {dict.changelog.eyebrow} —</div>
          <h1 className="font-display text-foreground-strong text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
            {dict.changelog.heading}
          </h1>
          <p className="text-foreground-dim mt-6 max-w-xl text-lg leading-relaxed">{dict.changelog.body}</p>

          <div className="mt-16">
            <ChronographAperture size={280}>
              <div className="flex h-full w-full flex-col items-center justify-center">
                <div className="eyebrow text-[10px]">{dict.changelog.emptyEyebrow}</div>
                <div className="font-display text-foreground-strong mt-2 text-3xl font-medium">2026</div>
              </div>
            </ChronographAperture>
          </div>

          <h2 className="font-display text-foreground-strong mt-16 text-3xl font-medium md:text-4xl">
            {dict.changelog.emptyHeading}
          </h2>
          <p className="text-foreground-dim mt-4 max-w-md">{dict.changelog.emptyBody}</p>

          <Link
            href={`/${typedLocale}/#waitlist`}
            className="bg-accent hover:bg-accent-strong mt-10 inline-flex items-center rounded-full px-7 py-3.5 text-sm font-medium text-[color:var(--color-background)] transition-all hover:shadow-[0_0_32px_#8CC8FF40]"
          >
            {dict.changelog.emptyCta}
          </Link>
        </div>
      </section>
    </PageShell>
  )
}

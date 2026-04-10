import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Section } from '@/components/sections/section'
import { WaitlistCta } from '@/components/sections/waitlist-cta'
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
    title: dict.about.metadata.title,
    description: dict.about.metadata.description,
  }
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <Section
        eyebrow={dict.about.eyebrow}
        heading={dict.about.heading}
        body={dict.about.body}
        align="center"
        className="pt-20 pb-12 md:pt-24"
      >
        <div />
      </Section>

      {/* Story — editorial paragraph stack */}
      <Section heading={dict.about.storyHeading}>
        <div className="mx-auto max-w-2xl space-y-6">
          {dict.about.storyParagraphs.map((p, i) => (
            <p key={i} className="text-foreground text-lg leading-[1.75]">
              {p}
            </p>
          ))}
        </div>
      </Section>

      {/* Values */}
      <Section heading={dict.about.valuesHeading}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {dict.about.values.map((value) => (
            <article key={value.heading} className="glass-tile flex flex-col p-8">
              <h3 className="font-display text-foreground-strong text-xl leading-tight font-medium">{value.heading}</h3>
              <p className="text-foreground-dim mt-3 leading-relaxed">{value.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <WaitlistCta dict={dict} />
    </PageShell>
  )
}

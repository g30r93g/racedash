import { ArrowRight, Mail, MessageCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Section } from '@/components/sections/section'
import { PageShell } from '@/components/site/page-shell'
import { WaitlistForm } from '@/components/waitlist-form'
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
    title: dict.contact.metadata.title,
    description: dict.contact.metadata.description,
  }
}

export default async function ContactPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <Section eyebrow={dict.contact.eyebrow} heading={dict.contact.heading} body={dict.contact.body} align="center">
        <div className="mx-auto max-w-xl">
          <div className="glass-tile p-10 text-center">
            <div className="border-accent/30 bg-accent/5 text-accent mx-auto inline-flex size-12 items-center justify-center rounded-[18px] border">
              <Mail className="size-5" strokeWidth={1.5} aria-hidden />
            </div>
            <h2 className="font-display text-foreground-strong mt-6 text-2xl leading-tight font-medium">
              {dict.contact.comingSoonHeading}
            </h2>
            <p className="text-foreground-dim mt-4 text-base leading-relaxed">{dict.contact.comingSoonBody}</p>
            <div className="mt-8 flex justify-center">
              <WaitlistForm
                placeholder={dict.waitlistCta.placeholder}
                submitLabel={dict.waitlistCta.submit}
                successMessage={dict.waitlistCta.success}
                errorMessage={dict.waitlistCta.error}
              />
            </div>
          </div>

          {/* In the meantime — secondary links */}
          <div className="mt-12">
            <h3 className="eyebrow text-foreground-dim mb-6 text-center text-[11px]">{dict.contact.sectionsHeading}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Link
                href={`/${typedLocale}/support`}
                className="glass-tile-sm group hover:border-accent/60 flex items-center gap-4 p-5 transition-colors"
              >
                <div className="bg-accent/5 text-accent flex size-10 shrink-0 items-center justify-center rounded-[14px]">
                  <MessageCircle className="size-4" strokeWidth={1.5} aria-hidden />
                </div>
                <div className="flex-1">
                  <div className="text-foreground-strong group-hover:text-accent text-sm font-medium transition-colors">
                    Browse support articles
                  </div>
                  <div className="text-foreground-dim text-xs">Help center, tutorials and troubleshooting</div>
                </div>
                <ArrowRight
                  className="text-foreground-dim size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <Link
                href={`/${typedLocale}/blog`}
                className="glass-tile-sm group hover:border-accent/60 flex items-center gap-4 p-5 transition-colors"
              >
                <div className="bg-accent/5 text-accent flex size-10 shrink-0 items-center justify-center rounded-[14px]">
                  <Mail className="size-4" strokeWidth={1.5} aria-hidden />
                </div>
                <div className="flex-1">
                  <div className="text-foreground-strong group-hover:text-accent text-sm font-medium transition-colors">
                    Read the blog
                  </div>
                  <div className="text-foreground-dim text-xs">Product updates and stories from the paddock</div>
                </div>
                <ArrowRight
                  className="text-foreground-dim size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </PageShell>
  )
}

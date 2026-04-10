import { Check, Minus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PricingTeaser } from '@/components/sections/pricing-teaser'
import { Section } from '@/components/sections/section'
import { WaitlistCta } from '@/components/sections/waitlist-cta'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type PageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    title: dict.pricingPage.metadata.title,
    description: dict.pricingPage.metadata.description,
  }
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = await getDictionary(locale as Locale)

  return (
    <PageShell locale={locale as Locale} dict={dict}>
      {/* Reuse the homepage's pricing teaser at the top — same visual but
          now framed as the primary pricing surface. */}
      <Section
        eyebrow={dict.pricingPage.eyebrow}
        heading={dict.pricingPage.heading}
        body={dict.pricingPage.subhead}
        align="center"
        className="pt-20 pb-10 md:pt-24 md:pb-10"
      >
        <div />
      </Section>

      <PricingTeaser dict={dict} />

      {/* Full comparison table */}
      <Section heading={dict.pricingPage.compareHeading}>
        <div className="glass-tile overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-0">
            {/* Header row */}
            <div className="border-b border-[color:var(--color-border-soft)] p-6" />
            <div className="border-b border-[color:var(--color-border-soft)] p-6 text-center">
              <div className="font-display text-foreground-strong text-xl font-medium">Plus</div>
              <div className="text-foreground-dim mt-1 font-mono text-sm tabular-nums">£24.99/yr</div>
            </div>
            <div className="bg-accent/5 border-b border-[color:var(--color-border-soft)] p-6 text-center">
              <div className="font-display text-foreground-strong text-xl font-medium">Pro</div>
              <div className="text-accent mt-1 font-mono text-sm tabular-nums">£49.99/yr</div>
            </div>

            {dict.pricingPage.compareRows.map((row, i) => {
              const isLast = i === dict.pricingPage.compareRows.length - 1
              return <ComparisonRow key={row.label} row={row} isLast={isLast} />
            })}
          </div>
        </div>
      </Section>

      {/* Cloud credit packs */}
      <Section heading={dict.pricingPage.creditsHeading} body={dict.pricingPage.creditsBody}>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {dict.pricingPage.creditPacks.map((pack) => {
            const isPopular = 'popular' in pack && pack.popular === true
            return (
              <article
                key={pack.name}
                className={cn(
                  'glass-tile-sm relative flex flex-col p-6 text-center',
                  isPopular && 'border-accent/60 ring-accent/20 ring-1',
                )}
              >
                {isPopular && (
                  <span className="eyebrow bg-accent absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[9px] text-[color:var(--color-background)]">
                    Most popular
                  </span>
                )}
                <div className="font-display text-foreground-strong text-3xl font-medium tabular-nums">{pack.name}</div>
                <div className="font-display text-accent mt-3 text-2xl font-medium tabular-nums">{pack.price}</div>
              </article>
            )
          })}
        </div>
      </Section>

      {/* FAQ */}
      <Section heading={dict.pricingPage.faqHeading}>
        <div className="mx-auto max-w-3xl">
          <dl className="flex flex-col gap-0">
            {dict.pricingPage.faq.map((item, i) => (
              <div
                key={item.q}
                className={cn(
                  'border-t border-[color:var(--color-border-soft)] py-8',
                  i === dict.pricingPage.faq.length - 1 && 'border-b border-[color:var(--color-border-soft)]',
                )}
              >
                <dt className="font-display text-foreground-strong text-xl leading-tight font-medium">{item.q}</dt>
                <dd className="text-foreground-dim mt-3 leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <WaitlistCta dict={dict} />
    </PageShell>
  )
}

function ComparisonRow({
  row,
  isLast,
}: {
  row: { label: string; plus: boolean | string; pro: boolean | string }
  isLast: boolean
}) {
  const cellClass = cn('p-5 text-center', !isLast && 'border-b border-[color:var(--color-border-soft)]')
  return (
    <>
      <div
        className={cn(
          'text-foreground p-5 text-sm leading-relaxed',
          !isLast && 'border-b border-[color:var(--color-border-soft)]',
        )}
      >
        {row.label}
      </div>
      <div className={cellClass}>
        <Cell value={row.plus} />
      </div>
      <div className={cn(cellClass, 'bg-accent/5')}>
        <Cell value={row.pro} accent />
      </div>
    </>
  )
}

function Cell({ value, accent }: { value: boolean | string; accent?: boolean }) {
  if (value === true) {
    return (
      <Check
        className={cn('mx-auto size-5', accent ? 'text-accent' : 'text-foreground-dim')}
        strokeWidth={2}
        aria-label="Included"
      />
    )
  }
  if (value === false) {
    return <Minus className="text-foreground-dim mx-auto size-5 opacity-40" strokeWidth={2} aria-label="Not included" />
  }
  return (
    <span className={cn('font-mono text-sm tabular-nums', accent ? 'text-accent' : 'text-foreground-strong')}>
      {value}
    </span>
  )
}

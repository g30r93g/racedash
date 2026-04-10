import { Check } from 'lucide-react'
import Link from 'next/link'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import { cn } from '@/lib/utils'

type PricingTeaserProps = {
  dict: Dictionary
}

// Pricing teaser — not the full pricing page, just the Plus/Pro side-by-side
// tiles with one-line positioning and 3 feature bullets each, plus a credit
// packs footnote. Links to the full pricing page for detail.
export function PricingTeaser({ dict }: PricingTeaserProps) {
  const tiers = [
    { ...dict.pricing.plus, highlighted: false },
    { ...dict.pricing.pro, highlighted: true },
  ]

  return (
    <Section id="pricing" eyebrow={dict.pricing.eyebrow} heading={dict.pricing.heading} align="center">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <article
            key={tier.name}
            className={cn(
              'glass-tile relative flex flex-col p-10',
              tier.highlighted && 'border-accent/60 ring-accent/20 ring-2',
            )}
          >
            {tier.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="eyebrow bg-accent inline-flex items-center rounded-full px-3 py-1 text-[9px] text-[color:var(--color-background)]">
                  Most popular
                </span>
              </div>
            )}
            <h3 className="font-display text-foreground-strong text-3xl font-medium">{tier.name}</h3>
            <p className="text-foreground-dim mt-2 text-sm">{tier.tagline}</p>

            <div className="mt-8 flex items-baseline gap-2">
              <span className="font-display text-foreground-strong text-5xl font-medium tabular-nums">
                {tier.price}
              </span>
              <span className="text-foreground-dim text-sm">{tier.period}</span>
            </div>

            <ul className="mt-8 flex-1 space-y-4">
              {tier.features.map((feature) => {
                // Features may optionally carry a `href` + `linkLabel` for a
                // trailing inline link (e.g. "See supported devices" next to
                // the "Data logger support" bullet on Pro). Plus/Pro share
                // the same rendering code but TS sees `tier.features` as a
                // union of the two tuple types, so narrow via typeof.
                const href = 'href' in feature && typeof feature.href === 'string' ? feature.href : undefined
                const linkLabel =
                  'linkLabel' in feature && typeof feature.linkLabel === 'string' ? feature.linkLabel : undefined
                return (
                  <li key={feature.text} className="flex items-start gap-3">
                    <Check className="text-accent mt-0.5 size-4 shrink-0" strokeWidth={2} />
                    <div className="flex-1">
                      <span className="text-foreground text-sm leading-relaxed">{feature.text}</span>
                      {href && linkLabel && (
                        <Link
                          href={href}
                          className="text-accent hover:text-accent-strong mt-1 block text-xs underline decoration-[color:var(--color-accent)]/40 decoration-1 underline-offset-4 transition-colors hover:decoration-[color:var(--color-accent-strong)]"
                        >
                          {linkLabel}
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <Link
              href="#waitlist"
              className={cn(
                'eyebrow mt-10 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-[11px] transition-all',
                tier.highlighted
                  ? 'bg-accent text-[color:var(--color-background)] hover:bg-[color:var(--color-accent-strong)]'
                  : 'text-foreground hover:border-accent/50 border border-[color:var(--color-border)]',
              )}
            >
              {tier.cta}
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-foreground-dim font-mono text-xs tracking-wider">{dict.pricing.credits}</p>
        <Link href="/pricing" className="eyebrow hover:text-accent mt-4 inline-block text-[11px] transition-colors">
          {dict.pricing.link} →
        </Link>
      </div>
    </Section>
  )
}

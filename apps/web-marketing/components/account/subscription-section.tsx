import { Check, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type SubscriptionTier = 'plus' | 'pro'
type SubscriptionStatus = 'active' | 'cancelling' | 'past_due'

export type SubscriptionState =
  | { kind: 'none' }
  | {
      kind: 'active'
      tier: SubscriptionTier
      status: SubscriptionStatus
      price: string
      renewsOn: string
      features: string[]
    }

type SubscriptionSectionProps = {
  locale: Locale
  dict: Dictionary['account']['dashboard']['subscription']
  state: SubscriptionState
  /** Override the shared Section's padding so dashboard context is tighter than marketing. */
  className?: string
}

// Second section of the account dashboard. Shows either:
// - the empty state (no active subscription) with a pricing CTA
// - the active state with tier, price, renewal date, features and actions
//
// The section wrapper is the shared marketing-site Section component so this
// lays on the same vertical rhythm as the rest of the site.
export function SubscriptionSection({
  locale,
  dict,
  state,
  className,
}: SubscriptionSectionProps) {
  if (state.kind === 'none') {
    return (
      <Section
        eyebrow={dict.eyebrow}
        heading={dict.empty.heading}
        body={dict.empty.body}
        className={className}
      >
        <div className="glass-tile flex flex-col items-start gap-4 p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="flex items-center gap-4">
            <div className="border-accent/30 bg-accent/5 text-accent flex size-12 items-center justify-center rounded-[18px] border">
              <CreditCard className="size-5" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-foreground-dim text-sm leading-relaxed">{dict.empty.body}</p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <Link
              href={`/${locale}/pricing`}
              className="bg-accent hover:bg-accent-strong inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all"
            >
              {dict.empty.seePricing}
            </Link>
            <Link
              href={`/${locale}/#waitlist`}
              className="text-foreground hover:border-accent/60 inline-flex items-center justify-center rounded-full border border-[color:var(--color-border)] px-6 py-3 text-sm font-medium transition-colors"
            >
              {dict.empty.joinWaitlist}
            </Link>
          </div>
        </div>
      </Section>
    )
  }

  const tierName = state.tier === 'pro' ? 'Pro' : 'Plus'
  const statusLabel =
    state.status === 'active'
      ? dict.activeLabel
      : state.status === 'cancelling'
        ? dict.cancellingLabel
        : dict.pastDueLabel

  return (
    <Section
      eyebrow={dict.eyebrow}
      className={className}
      heading={
        <>
          <span className="text-accent">{tierName}</span>
          <span className="text-foreground-dim"> · </span>
          <span>{statusLabel}</span>
        </>
      }
    >
      <div className="glass-tile p-10 md:p-12">
        <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[auto_1fr_auto]">
          {/* Price + renewal */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'inline-block size-2 rounded-full',
                  state.status === 'active'
                    ? 'bg-accent shadow-[0_0_8px_#8CC8FF]'
                    : state.status === 'cancelling'
                      ? 'border-foreground-dim border'
                      : 'border-accent/60 border',
                )}
                aria-hidden
              />
              <span className="eyebrow text-[10px]">{statusLabel}</span>
            </div>
            <div className="font-display text-foreground-strong text-2xl font-medium tabular-nums">
              {dict.price.replace('{price}', state.price)}
            </div>
            <div className="text-foreground-dim font-mono text-xs tracking-wider">
              {dict.renewalLabel} {state.renewsOn}
            </div>
          </div>

          {/* Included features */}
          <div>
            <div className="eyebrow text-foreground-dim mb-4 text-[10px]">{dict.featuresHeading}</div>
            <ul className="flex flex-col gap-3">
              {state.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="text-accent mt-0.5 size-4 shrink-0" strokeWidth={2} />
                  <span className="text-foreground text-sm leading-relaxed">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 md:min-w-[220px]">
            <button
              type="button"
              disabled
              className="text-foreground hover:border-accent/60 inline-flex items-center justify-center rounded-full border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dict.manageBilling}
            </button>
            {state.tier === 'plus' ? (
              <Link
                href={`/${locale}/pricing`}
                className="bg-accent hover:bg-accent-strong inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-[color:var(--color-background)] transition-all hover:shadow-[0_0_24px_#8CC8FF40]"
              >
                {dict.upgradeToPro}
              </Link>
            ) : (
              <div className="eyebrow text-foreground-dim text-center text-[10px]">{dict.proActive}</div>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

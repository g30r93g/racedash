import { Zap } from 'lucide-react'
import Link from 'next/link'
import { CreditsSparkline } from '@/components/account/credits-sparkline'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

export type CreditsState =
  | { kind: 'empty' }
  | {
      kind: 'active'
      balance: number
      /** Usage per day for the last 14 days; values[0] is oldest. */
      usage14d: number[]
      lastUsed: {
        when: string
        filename: string
        cost: number
      } | null
    }

type CreditsSectionProps = {
  locale: Locale
  dict: Dictionary['account']['dashboard']['credits']
  state: CreditsState
  /** Override the shared Section's padding so dashboard context is tighter than marketing. */
  className?: string
}

// Third section of the account dashboard. Shows either:
// - the empty state (no credits yet) with a subtle upsell
// - the active state with balance, sparkline, last-used line and a top-up
//   button
//
// Both states use the shared Section wrapper so vertical rhythm matches the
// subscription section above and the footer below.
export function CreditsSection({ locale, dict, state, className }: CreditsSectionProps) {
  if (state.kind === 'empty') {
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
              <Zap className="size-5" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-foreground-dim text-sm leading-relaxed">{dict.empty.body}</p>
          </div>
          <Link
            href={`/${locale}/pricing`}
            className="bg-accent hover:bg-accent-strong inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all"
          >
            {dict.topUp}
          </Link>
        </div>
      </Section>
    )
  }

  return (
    <Section
      eyebrow={dict.eyebrow}
      className={className}
      heading={
        <>
          <span className="text-accent font-mono tabular-nums">{state.balance}</span>
          <span> </span>
          <span>{dict.remaining.replace('{amount}', '').trim()}</span>
        </>
      }
    >
      <div className="glass-tile p-10 md:p-12">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <div>
              <div className="eyebrow text-foreground-dim mb-2 text-[10px]">{dict.sparklineLabel}</div>
              <CreditsSparkline values={state.usage14d} />
            </div>
            <div className="text-foreground-dim font-mono text-xs tracking-wider">
              {state.lastUsed
                ? dict.lastUsedTemplate
                    .replace('{when}', state.lastUsed.when)
                    .replace('{filename}', state.lastUsed.filename)
                    .replace('{cost}', state.lastUsed.cost.toString())
                : dict.noActivity}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 md:items-end">
            <Link
              href={`/${locale}/pricing`}
              className="bg-accent hover:bg-accent-strong inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all hover:shadow-[0_0_24px_#8CC8FF40] md:min-w-[200px]"
            >
              {dict.topUp}
            </Link>
            <p className="text-foreground-dim max-w-[220px] text-xs leading-relaxed md:text-right">
              {dict.neverExpires}
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

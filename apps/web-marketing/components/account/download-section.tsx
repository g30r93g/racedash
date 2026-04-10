'use client'

import { Apple, Download, Monitor } from 'lucide-react'
import Link from 'next/link'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'
import { usePlatform } from '@/lib/use-platform'
import { cn } from '@/lib/utils'

type DownloadSectionProps = {
  locale: Locale
  dict: Dictionary['account']['dashboard']['download']
  /**
   * When false (no active subscription), the download buttons are replaced
   * with a pricing CTA. The tile keeps its layout so the dashboard rhythm
   * doesn't jump between empty and active states.
   */
  unlocked: boolean
}

// Full-width hero tile for the download action. On the left it describes
// what's available (eyebrow / heading / meta / system reqs). On the right it
// offers two download buttons — the one matching the user's detected OS
// becomes the filled primary; the other is the outline secondary.
//
// When the user has no active subscription, the right column swaps to a
// pricing CTA and the eyebrow reads "Subscribe to unlock".
export function DownloadSection({ locale, dict, unlocked }: DownloadSectionProps) {
  const platform = usePlatform()
  const macPrimary = platform !== 'windows' // default to mac primary if unknown

  return (
    <article
      className={cn(
        'glass-tile relative overflow-hidden p-10 md:p-12',
        !unlocked && 'opacity-95',
      )}
    >
        <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[1.2fr_1fr]">
          {/* Left — info column */}
          <div>
            <div className="eyebrow mb-4 text-[11px]">— {unlocked ? dict.eyebrow : dict.lockedEyebrow} —</div>
            <h2 className="font-display text-foreground-strong text-3xl leading-[1.1] font-medium tracking-tight md:text-4xl">
              {unlocked ? dict.heading : dict.lockedHeading}
            </h2>
            {unlocked ? (
              <>
                <p className="text-foreground-dim mt-5 font-mono text-xs tracking-wider md:text-[13px]">{dict.meta}</p>
                <details className="group mt-4">
                  <summary className="text-foreground-dim hover:text-accent flex cursor-pointer list-none items-center gap-2 text-xs transition-colors">
                    <span className="eyebrow text-[10px]">{dict.systemReqsLabel}</span>
                    <span className="text-accent transition-transform group-open:rotate-90">→</span>
                  </summary>
                  <p className="text-foreground-dim mt-2 font-mono text-[11px] tracking-wider">{dict.systemReqs}</p>
                </details>
              </>
            ) : (
              <p className="text-foreground-dim mt-5 text-base leading-relaxed">{dict.lockedBody}</p>
            )}
          </div>

          {/* Right — action column */}
          <div className="flex flex-col items-stretch gap-3 md:items-end">
            {unlocked ? (
              <>
                <DownloadButton
                  variant={macPrimary ? 'primary' : 'secondary'}
                  icon={<Apple className="size-4" strokeWidth={2} aria-hidden />}
                  label={dict.macLabel}
                />
                <DownloadButton
                  variant={macPrimary ? 'secondary' : 'primary'}
                  icon={<Monitor className="size-4" strokeWidth={2} aria-hidden />}
                  label={dict.windowsLabel}
                />
              </>
            ) : (
              <>
                <Link
                  href={`/${locale}/pricing`}
                  className="bg-accent hover:bg-accent-strong inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-[color:var(--color-background)] transition-all hover:shadow-[0_0_28px_#8CC8FF40] md:w-auto md:min-w-[220px]"
                >
                  {dict.lockedPrimary}
                </Link>
                <Link
                  href={`/${locale}/#waitlist`}
                  className="text-foreground hover:border-accent/60 inline-flex w-full items-center justify-center rounded-full border border-[color:var(--color-border)] px-6 py-3 text-sm font-medium transition-colors md:w-auto md:min-w-[220px]"
                >
                  {dict.lockedSecondary}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Decorative tick-rule + changelog link along the bottom edge */}
        <div className="tick-rule mt-10" aria-hidden />
        <div className="mt-6 flex items-center justify-between">
          <Link
            href={`/${locale}/changelog`}
            className="eyebrow text-foreground-dim hover:text-accent inline-flex items-center gap-1 text-[10px] transition-colors"
          >
            {dict.changelogLink} →
          </Link>
        </div>
      </article>
  )
}

// Individual download button — primary (filled accent) or secondary
// (outline). Icon on the left, label on the right. Consistent width so the
// two buttons stack neatly on the right side of the section.
function DownloadButton({
  variant,
  icon,
  label,
}: {
  variant: 'primary' | 'secondary'
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      disabled
      className={cn(
        'inline-flex w-full items-center justify-center gap-3 rounded-full px-6 py-3 text-sm font-medium transition-all md:w-auto md:min-w-[220px]',
        'disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-accent hover:bg-accent-strong text-[color:var(--color-background)] hover:shadow-[0_0_28px_#8CC8FF40] disabled:opacity-50'
          : 'text-foreground border border-[color:var(--color-border)] hover:border-[color:var(--color-border-strong)] disabled:opacity-50',
      )}
    >
      {icon}
      <span>{label}</span>
      <Download className="size-3 opacity-70" aria-hidden />
    </button>
  )
}

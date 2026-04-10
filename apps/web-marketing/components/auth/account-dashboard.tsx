'use client'

import { useUser } from '@clerk/nextjs'
import { AccountFooter } from '@/components/account/account-footer'
import { CreditsSection, type CreditsState } from '@/components/account/credits-section'
import { DownloadSection } from '@/components/account/download-section'
import {
  SubscriptionSection,
  type SubscriptionState,
} from '@/components/account/subscription-section'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

// Shared padding override for Section-wrapped dashboard blocks. The default
// marketing-page rhythm is py-24/md:py-32 which is far too much for an
// interior dashboard — this tightens it.
const DASHBOARD_SECTION_PADDING = 'py-10 md:py-14'

type AccountDashboardProps = {
  locale: Locale
  dict: Dictionary['account']
}

// Account dashboard composition.
//
// The parent server component (app/[locale]/account/page.tsx) has already
// verified the user is signed in via `await auth()`. This component can
// trust that guarantee and render the full dashboard.
//
// Real subscription + credit data will come from apps/api once the endpoint
// ships. Until then we render the empty state (new user, no subscription,
// no credits) — this is the state a newly-signed-up user actually sees, so
// designing around it is the right default. When the API lands, swap the
// placeholder consts below for a real query.
export function AccountDashboard({ locale, dict }: AccountDashboardProps) {
  const { isLoaded, user } = useUser()

  // TODO(api): replace these placeholders with real data fetched from
  // apps/api once the subscription + credits endpoints exist. For now the
  // dashboard ships in its empty state — which is what every new user will
  // see on first visit anyway.
  //
  // Typed via the discriminated-union helpers so the render code is already
  // shaped to accept active-state data once the query is wired up.
  const subscription = { kind: 'none' } as SubscriptionState
  const credits = { kind: 'empty' } as CreditsState
  const hasActiveSubscription = subscription.kind === 'active'

  if (!isLoaded) return null

  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? 'racer'

  return (
    <>
      {/* Welcome header + download — manually laid out so the gap between
          the heading and the download tile is tight (~48px) rather than
          the marketing-page header→content gap of 64px that <Section>
          bakes in. The PageShell already provides `pt-24` on <main> to
          clear the sticky header. */}
      <div className="mx-auto max-w-7xl px-6 pt-10 md:px-10 md:pt-14">
        <div className="mb-8 max-w-3xl md:mb-12">
          <div className="eyebrow mb-5">— {dict.dashboard.eyebrow} —</div>
          <h1 className="font-display text-foreground-strong text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
            {dict.dashboard.heading.replace('{name}', displayName)}
          </h1>
          <p className="text-foreground-dim mt-5 text-lg leading-relaxed">
            {dict.dashboard.subhead}
          </p>
        </div>
        <DownloadSection
          locale={locale}
          dict={dict.dashboard.download}
          unlocked={hasActiveSubscription}
        />
      </div>

      <SubscriptionSection
        locale={locale}
        dict={dict.dashboard.subscription}
        state={subscription}
        className={DASHBOARD_SECTION_PADDING}
      />

      <CreditsSection
        locale={locale}
        dict={dict.dashboard.credits}
        state={credits}
        className={DASHBOARD_SECTION_PADDING}
      />

      <AccountFooter locale={locale} dict={dict.dashboard.footer} />
    </>
  )
}

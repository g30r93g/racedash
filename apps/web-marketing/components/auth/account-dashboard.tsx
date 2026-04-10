'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import { CreditCard, Download, LogOut, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type AccountDashboardProps = {
  locale: Locale
  dict: Dictionary['account']
}

// Client component for the account dashboard. Uses Clerk's `useUser` to
// display the signed-in user's name. Real subscription + credit data will
// come from apps/api later; this lays out the panels so the structure is
// in place.
export function AccountDashboard({ locale, dict }: AccountDashboardProps) {
  // The parent server component (app/[locale]/account/page.tsx) has already
  // verified the user is signed in via `await auth()`. We can trust that
  // guarantee and just read the user profile via `useUser()` to render the
  // personalised fields.
  const { isLoaded, user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  if (!isLoaded) return null

  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? 'racer'

  return (
    <Section eyebrow={dict.dashboard.eyebrow} heading={dict.dashboard.heading.replace('{name}', displayName)}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Subscription card */}
        <article className="glass-tile flex flex-col p-8">
          <div className="bg-accent/5 text-accent mb-6 inline-flex size-12 items-center justify-center rounded-[18px]">
            <CreditCard className="size-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h3 className="font-display text-foreground-strong text-xl leading-tight font-medium">
            {dict.dashboard.subscriptionHeading}
          </h3>
          <p className="text-foreground-dim mt-3 text-sm">
            No active subscription yet. Subscribe to unlock the desktop app and cloud renders.
          </p>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/pricing`)}
              className="eyebrow text-accent hover:text-accent-strong text-[11px] transition-colors"
            >
              See pricing →
            </button>
          </div>
        </article>

        {/* Credits card */}
        <article className="glass-tile flex flex-col p-8">
          <div className="bg-accent/5 text-accent mb-6 inline-flex size-12 items-center justify-center rounded-[18px]">
            <Zap className="size-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h3 className="font-display text-foreground-strong text-xl leading-tight font-medium">
            {dict.dashboard.creditsHeading}
          </h3>
          <div className="text-accent mt-4 font-mono text-3xl tabular-nums">0 RC</div>
          <p className="text-foreground-dim mt-2 text-sm">Buy a credit pack to use cloud rendering.</p>
        </article>

        {/* Download card */}
        <article className="glass-tile flex flex-col p-8">
          <div className="bg-accent/5 text-accent mb-6 inline-flex size-12 items-center justify-center rounded-[18px]">
            <Download className="size-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h3 className="font-display text-foreground-strong text-xl leading-tight font-medium">
            {dict.dashboard.downloadApp}
          </h3>
          <p className="text-foreground-dim mt-3 text-sm">
            Download the RaceDash desktop app for your platform. Available once your subscription is active.
          </p>
        </article>
      </div>

      {/* Sign out + billing */}
      <div className="mt-12 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled
          className="eyebrow text-foreground-dim inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] px-5 py-2.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CreditCard className="size-3" aria-hidden />
          {dict.dashboard.manageBilling}
        </button>
        <button
          type="button"
          onClick={async () => {
            await signOut()
            router.push(`/${locale}`)
          }}
          className="eyebrow text-foreground-dim hover:text-accent inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] px-5 py-2.5 text-[11px] transition-colors"
        >
          <LogOut className="size-3" aria-hidden />
          {dict.dashboard.signOut}
        </button>
      </div>
    </Section>
  )
}

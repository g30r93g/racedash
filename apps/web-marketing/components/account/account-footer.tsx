'use client'

import { useClerk } from '@clerk/nextjs'
import { ArrowUpRight, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type AccountFooterProps = {
  locale: Locale
  dict: Dictionary['account']['dashboard']['footer']
}

// Footer row for the account dashboard. Sign out (left) + support link
// (right). Lives below the three content sections so destructive actions
// like sign out don't sit next to the main CTAs.
export function AccountFooter({ locale, dict }: AccountFooterProps) {
  const { signOut } = useClerk()
  const router = useRouter()

  return (
    <footer className="mx-auto max-w-7xl px-6 pt-6 pb-20 md:px-10">
      <div className="tick-rule mb-8" aria-hidden />
      <div className="flex flex-col-reverse items-start justify-between gap-4 md:flex-row md:items-center">
        <button
          type="button"
          onClick={async () => {
            await signOut()
            router.push(`/${locale}`)
          }}
          className="eyebrow text-foreground-dim hover:text-accent inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] px-5 py-2.5 text-[11px] transition-colors"
        >
          <LogOut className="size-3" aria-hidden />
          {dict.signOut}
        </button>
        <Link
          href={`/${locale}/contact`}
          className="eyebrow text-foreground-dim hover:text-accent inline-flex items-center gap-1 text-[11px] transition-colors"
        >
          {dict.supportLabel}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
    </footer>
  )
}

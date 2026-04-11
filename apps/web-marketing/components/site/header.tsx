import { Wordmark } from '@/components/brand/wordmark'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'
import Link from 'next/link'

type HeaderProps = {
  locale: Locale
  dict: Dictionary
}

// Thin, translucent header. Sticks to the top and gets a faint blur once the
// user scrolls (handled purely via backdrop-blur + bg opacity — no JS).
export function Header({ locale, dict }: HeaderProps) {
  const navItems = [
    { label: dict.nav.features, href: '#features' },
    { label: dict.nav.pricing, href: '#pricing' },
    { label: dict.nav.changelog, href: '/changelog' },
  ]

  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <div className="border-b border-border-soft bg-(--color-background)/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 md:px-10">
          {/* Left — wordmark */}
          <Link href={`/${locale}`} className="text-foreground-strong hover:text-accent transition-colors">
            <Wordmark className="h-7" />
          </Link>

          {/* Center — nav links */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="eyebrow text-foreground-dim hover:text-accent text-[11px] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right — waitlist CTA */}
          <div className="flex items-center">
            <Link
              href="#waitlist"
              className="eyebrow border-accent/50 text-accent hover:bg-accent/10 inline-flex items-center rounded-full border px-4 py-1.5 text-[11px] transition-colors"
            >
              {dict.nav.waitlist}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

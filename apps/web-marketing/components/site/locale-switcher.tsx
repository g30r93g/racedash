'use client'

import { ChevronDown } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { locales, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type LocaleSwitcherProps = {
  currentLocale: Locale
  className?: string
}

// Minimal locale switcher — no flags (the brand voice is typographic, not
// pictographic), just the uppercase ISO code in the eyebrow font. Clicking
// swaps the leading path segment and sets a cookie so subsequent visits stick.
export function LocaleSwitcher({ currentLocale, className }: LocaleSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()

  const switchTo = (locale: Locale) => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`
    const segments = pathname.split('/')
    segments[1] = locale
    const next = segments.join('/') || `/${locale}`
    startTransition(() => {
      router.push(next)
      setOpen(false)
    })
  }

  // Single-locale case: render a static label, no menu.
  if (locales.length === 1) {
    return (
      <span className={cn('eyebrow text-foreground-dim inline-flex items-center gap-1 text-[11px]', className)}>
        {currentLocale}
      </span>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="eyebrow hover:text-accent inline-flex items-center gap-1 text-[11px] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {currentLocale}
        <ChevronDown className="size-3" aria-hidden />
      </button>
      {open && (
        <ul role="listbox" className="glass-tile-sm absolute right-0 top-full z-50 mt-2 min-w-[96px] py-1">
          {locales.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                role="option"
                aria-selected={locale === currentLocale}
                onClick={() => switchTo(locale)}
                className="eyebrow hover:text-accent block w-full px-4 py-2 text-left text-[11px] transition-colors"
              >
                {locale}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

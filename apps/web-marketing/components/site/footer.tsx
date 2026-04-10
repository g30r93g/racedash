import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { LocaleSwitcher } from '@/components/site/locale-switcher'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type FooterProps = {
  locale: Locale
  dict: Dictionary
}

// Thin footer — wordmark, three link columns, locale switcher duplicated,
// tick-rule divider, and the final "Made by racers, for racers." line.
export function Footer({ locale, dict }: FooterProps) {
  const columns = [
    { title: dict.footer.product, links: dict.footer.links.product },
    { title: dict.footer.company, links: dict.footer.links.company },
    { title: dict.footer.legal, links: dict.footer.links.legal },
  ]

  return (
    <footer className="mt-32">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10 md:px-10">
        <div className="grid grid-cols-2 gap-12 md:grid-cols-5">
          <div className="col-span-2 md:col-span-2">
            <Link
              href={`/${locale}`}
              className="text-foreground-strong hover:text-accent inline-block transition-colors"
            >
              <Wordmark className="h-8" />
            </Link>
            <p className="text-foreground-dim mt-4 max-w-xs text-sm leading-relaxed">
              Professional race video overlays, built by racers.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="eyebrow mb-4 text-[11px]">{col.title}</h3>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-foreground-dim hover:text-accent text-sm transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="tick-rule mt-16 mb-6" aria-hidden />

        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p className="text-foreground-dim text-sm">{dict.footer.copyright}</p>
          <LocaleSwitcher currentLocale={locale} />
        </div>
      </div>
    </footer>
  )
}

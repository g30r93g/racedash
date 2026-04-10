import { Footer } from '@/components/site/footer'
import { Header } from '@/components/site/header'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type PageShellProps = {
  locale: Locale
  dict: Dictionary
  children: React.ReactNode
}

// Standard page wrapper: sticky Header, content, Footer. Used by every
// non-homepage route so there's one place to adjust site chrome. The
// homepage uses the Header + Footer directly because its hero sits above
// the header (transparent overlay) and a wrapping element would complicate
// that layering.
export function PageShell({ locale, dict, children }: PageShellProps) {
  return (
    <>
      <Header locale={locale} dict={dict} />
      <main className="pt-24">{children}</main>
      <Footer locale={locale} dict={dict} />
    </>
  )
}

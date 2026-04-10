import { ChronographAperture } from '@/components/brand/chronograph-aperture'
import { Footer } from '@/components/site/footer'
import { Header } from '@/components/site/header'
import { getDictionary } from '@/lib/dictionary'
import { defaultLocale } from '@/lib/i18n'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

// Per-locale 404 page. Next renders this when `notFound()` is called inside
// a route that lives under [locale]. For hard 404s that fall outside the
// locale segment entirely, `app/not-found.tsx` handles the fallback.
export default async function LocaleNotFound() {
  // `not-found.tsx` doesn't get params from Next, so we default to `en`.
  // If we add more locales we'll revisit this — likely by reading the cookie.
  const dict = await getDictionary(defaultLocale)

  return (
    <>
      <Header locale={defaultLocale} dict={dict} />
      <main className="flex min-h-[80vh] flex-col items-center justify-center px-6 pt-24 pb-20 text-center md:px-10">
        <ChronographAperture size={220}>
          <div className="flex h-full w-full items-center justify-center">
            <div className="font-display text-accent text-5xl font-medium tabular-nums">404</div>
          </div>
        </ChronographAperture>

        <div className="eyebrow mt-10">— {dict.notFound.eyebrow} —</div>
        <h1 className="font-display text-foreground-strong mt-6 text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
          {dict.notFound.heading}
        </h1>
        <p className="text-foreground-dim mt-6 max-w-md text-lg">{dict.notFound.body}</p>

        <Link
          href={`/${defaultLocale}`}
          className="border-accent/50 text-foreground hover:bg-accent/10 mt-10 inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.notFound.cta}
        </Link>
      </main>
      <Footer locale={defaultLocale} dict={dict} />
    </>
  )
}

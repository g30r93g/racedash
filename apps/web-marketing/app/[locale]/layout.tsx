import type { Metadata } from 'next'
import { Chakra_Petch, Geist_Mono, Sora, Space_Grotesk } from 'next/font/google'
import { notFound } from 'next/navigation'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, locales, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import './globals.css'

// Display — instrument-panel geometry, mirrors the brand wordmark's feel.
const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

// Body — humanist, soft, highly legible at paragraph size.
const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

// Eyebrow / technical label — spaced uppercase.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-eyebrow',
  display: 'swap',
})

// Monospace — every real number on the page uses this (lap times, versions,
// counters, file sizes). Tabular numerals create a chronograph-like rhythm.
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

// Next.js 16 generates a strict Route-aware LayoutProps constraint. We use
// a broad handwritten shape that accepts any `params` Promise and narrow
// via `isLocale` inside the function body.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    metadataBase: new URL('https://www.racedash.io'),
    title: dict.metadata.title,
    description: dict.metadata.description,
    openGraph: {
      title: dict.metadata.title,
      description: dict.metadata.description,
      url: `https://www.racedash.io/${locale}`,
      siteName: 'RaceDash',
      locale,
      type: 'website',
    },
    alternates: {
      canonical: `https://www.racedash.io/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l, `https://www.racedash.io/${l}`])),
    },
  }
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html
      lang={locale}
      // `data-scroll-behavior="smooth"` tells Next.js 16 to scope our
      // `scroll-behavior: smooth` CSS to in-page anchor navigation only —
      // route transitions snap instantly so they don't feel laggy.
      data-scroll-behavior="smooth"
      className={cn(
        'dark font-sans antialiased',
        chakraPetch.variable,
        sora.variable,
        spaceGrotesk.variable,
        geistMono.variable,
      )}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-screen">{children}</body>
    </html>
  )
}

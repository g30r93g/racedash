import { notFound } from 'next/navigation'
import { Hero } from '@/components/hero/hero'
import { FeaturesGrid } from '@/components/sections/features-grid'
import { PricingTeaser } from '@/components/sections/pricing-teaser'
import { Primitives } from '@/components/sections/primitives'
import { Showcase } from '@/components/sections/showcase'
import { Testimonials } from '@/components/sections/testimonials'
import { WaitlistCta } from '@/components/sections/waitlist-cta'
import { Why } from '@/components/sections/why'
import { Footer } from '@/components/site/footer'
import { Header } from '@/components/site/header'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'

type PageProps = {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  return (
    <>
      <Header locale={typedLocale} dict={dict} />
      <main>
        <Hero dict={dict} />
        <Primitives dict={dict} />
        <Showcase dict={dict} />
        <FeaturesGrid dict={dict} />
        <Testimonials locale={typedLocale} dict={dict} />
        <Why dict={dict} />
        <PricingTeaser dict={dict} />
        <WaitlistCta dict={dict} />
      </main>
      <Footer locale={typedLocale} dict={dict} />
    </>
  )
}

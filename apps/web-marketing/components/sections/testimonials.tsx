import { ArrowUpRight, Quote } from 'lucide-react'
import Link from 'next/link'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'
import { getFeaturedTestimonials } from '@/lib/testimonials'

type TestimonialsProps = {
  locale: Locale
  dict: Dictionary
}

// Server component — reads the MDX files at build time via the testimonials
// loader and renders each quote as a glass tile. Body content is real MDX so
// authors can use emphasis, links, etc.
export async function Testimonials({ locale, dict }: TestimonialsProps) {
  const testimonials = await getFeaturedTestimonials(locale)
  if (testimonials.length === 0) return null

  return (
    <Section id="testimonials" eyebrow={dict.testimonials.eyebrow} heading={dict.testimonials.heading}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t) => (
          <article key={t.slug} className="glass-tile relative flex flex-col gap-6 p-8">
            <Quote className="text-accent/25 size-10 shrink-0" strokeWidth={1.25} aria-hidden />
            <div className="text-foreground flex-1 text-lg leading-relaxed">
              <MDXRemote source={t.body} />
            </div>
            <div className="tick-rule -mx-8" aria-hidden />
            <footer>
              <div className="font-display text-foreground-strong text-lg">{t.name}</div>
              <div className="eyebrow mt-1 text-[10px]">{[t.role, t.car, t.circuit].filter(Boolean).join(' · ')}</div>
            </footer>
          </article>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <Link
          href="#waitlist"
          className="eyebrow text-foreground-dim hover:text-accent inline-flex items-center gap-2 text-[11px] transition-colors"
        >
          {dict.testimonials.addYours}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>
    </Section>
  )
}

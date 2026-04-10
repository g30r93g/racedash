import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { mdxComponents } from '@/components/mdx/mdx-prose'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, locales, type Locale } from '@/lib/i18n'
import { getArticle, listSlugs } from '@/lib/mdx'

type SupportArticleFrontmatter = {
  title: string
  description: string
  category: string
  order: number
  updatedAt: string
}

type PageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const entries: Array<{ locale: string; slug: string }> = []
  for (const locale of locales) {
    const slugs = await listSlugs('support', locale)
    for (const slug of slugs) entries.push({ locale, slug })
  }
  return entries
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const article = await getArticle<SupportArticleFrontmatter>('support', locale as Locale, slug)
  if (!article) return {}
  return {
    title: `${article.title} — RaceDash Support`,
    description: article.description,
  }
}

export default async function SupportArticlePage({ params }: PageProps) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)
  const article = await getArticle<SupportArticleFrontmatter>('support', typedLocale, slug)
  if (!article) notFound()

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <article className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <Link
          href={`/${typedLocale}/support`}
          className="text-foreground-dim hover:text-accent mb-10 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.support.backToSupport}
        </Link>

        <header className="mb-12">
          <div className="eyebrow mb-4">{article.category}</div>
          <h1 className="font-display text-foreground-strong text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
            {article.title}
          </h1>
          <p className="text-foreground-dim mt-4 text-lg leading-relaxed">{article.description}</p>
          <div className="text-foreground-dim mt-6 font-mono text-xs tracking-wider">
            {dict.legal.privacy.lastUpdated} {article.updatedAt}
          </div>
        </header>

        <div className="tick-rule mb-12" aria-hidden />

        <div>
          <MDXRemote source={article.body} components={mdxComponents} />
        </div>

        <div className="tick-rule mt-16 mb-8" aria-hidden />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={`/${typedLocale}/support`}
            className="text-foreground-dim hover:text-accent inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {dict.support.backToSupport}
          </Link>
          <Link
            href={`/${typedLocale}/contact`}
            className="eyebrow border-accent/50 text-accent hover:bg-accent/10 inline-flex items-center rounded-full border px-4 py-1.5 text-[11px] transition-colors"
          >
            {dict.support.contactCta}
          </Link>
        </div>
      </article>
    </PageShell>
  )
}

import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Section } from '@/components/sections/section'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'
import { listArticles } from '@/lib/mdx'

type SupportArticleFrontmatter = {
  title: string
  description: string
  category: string
  order: number
  updatedAt: string
}

type PageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    title: dict.support.metadata.title,
    description: dict.support.metadata.description,
  }
}

export default async function SupportIndex({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  const articles = await listArticles<SupportArticleFrontmatter>('support', typedLocale)
  articles.sort((a, b) => a.order - b.order)

  // Group articles by category to render a sectioned index.
  const grouped = new Map<string, typeof articles>()
  for (const article of articles) {
    const list = grouped.get(article.category) ?? []
    list.push(article)
    grouped.set(article.category, list)
  }

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <Section eyebrow={dict.support.eyebrow} heading={dict.support.heading} body={dict.support.body} align="center">
        {articles.length === 0 ? (
          <p className="text-foreground-dim text-center">{dict.support.emptyState}</p>
        ) : (
          <div className="flex flex-col gap-16">
            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <h3 className="eyebrow text-foreground-dim mb-6 text-[11px]">{category}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {items.map((article) => (
                    <Link
                      key={article.slug}
                      href={`/${typedLocale}/support/${article.slug}`}
                      className="glass-tile-sm group hover:border-accent/60 flex flex-col p-6 transition-colors"
                    >
                      <h4 className="font-display text-foreground-strong group-hover:text-accent text-lg leading-tight font-medium transition-colors">
                        {article.title}
                      </h4>
                      <p className="text-foreground-dim mt-2 text-sm leading-relaxed">{article.description}</p>
                      <div className="text-accent mt-4 flex items-center gap-1 text-xs">
                        <span className="eyebrow text-[10px]">Read</span>
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  )
}

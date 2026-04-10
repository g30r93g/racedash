import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Section } from '@/components/sections/section'
import { PageShell } from '@/components/site/page-shell'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'
import { listArticles } from '@/lib/mdx'

type BlogPostFrontmatter = {
  title: string
  description: string
  author: string
  publishedAt: string
  tags: string[]
  featured: boolean
}

type PageProps = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return {
    title: dict.blog.metadata.title,
    description: dict.blog.metadata.description,
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function BlogIndex({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)

  const posts = await listArticles<BlogPostFrontmatter>('blog', typedLocale)
  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <Section eyebrow={dict.blog.eyebrow} heading={dict.blog.heading} body={dict.blog.body} align="center">
        {posts.length === 0 ? (
          <p className="text-foreground-dim text-center">{dict.blog.emptyState}</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/${typedLocale}/blog/${post.slug}`}
                className="glass-tile group hover:border-accent/60 flex flex-col p-8 transition-colors md:p-10"
              >
                <div className="text-foreground-dim font-mono text-xs tracking-wider">
                  {formatDate(post.publishedAt)} · {post.author}
                </div>
                <h2 className="font-display text-foreground-strong group-hover:text-accent mt-4 text-2xl leading-tight font-medium transition-colors md:text-3xl">
                  {post.title}
                </h2>
                <p className="text-foreground-dim mt-3 leading-relaxed">{post.description}</p>
                <div className="text-accent mt-6 flex items-center gap-1 text-xs">
                  <span className="eyebrow text-[10px]">{dict.blog.readMore}</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  )
}

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

type BlogPostFrontmatter = {
  title: string
  description: string
  author: string
  publishedAt: string
  tags: string[]
  featured: boolean
}

type PageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  const entries: Array<{ locale: string; slug: string }> = []
  for (const locale of locales) {
    const slugs = await listSlugs('blog', locale)
    for (const slug of slugs) entries.push({ locale, slug })
  }
  return entries
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const post = await getArticle<BlogPostFrontmatter>('blog', locale as Locale, slug)
  if (!post) return {}
  return {
    title: `${post.title} — RaceDash`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author],
    },
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)
  const post = await getArticle<BlogPostFrontmatter>('blog', typedLocale, slug)
  if (!post) notFound()

  return (
    <PageShell locale={typedLocale} dict={dict}>
      <article className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <Link
          href={`/${typedLocale}/blog`}
          className="text-foreground-dim hover:text-accent mb-10 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.blog.backToBlog}
        </Link>

        <header className="mb-12">
          <div className="text-foreground-dim font-mono text-xs tracking-wider">
            {formatDate(post.publishedAt)} · {post.author}
          </div>
          <h1 className="font-display text-foreground-strong mt-4 text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
            {post.title}
          </h1>
          <p className="text-foreground-dim mt-4 text-lg leading-relaxed">{post.description}</p>
          {post.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="eyebrow border-accent/30 text-accent rounded-full border px-3 py-1 text-[9px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="tick-rule mb-12" aria-hidden />

        <div>
          <MDXRemote source={post.body} components={mdxComponents} />
        </div>

        <div className="tick-rule mt-16 mb-8" aria-hidden />

        <Link
          href={`/${typedLocale}/blog`}
          className="text-foreground-dim hover:text-accent inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.blog.backToBlog}
        </Link>
      </article>
    </PageShell>
  )
}

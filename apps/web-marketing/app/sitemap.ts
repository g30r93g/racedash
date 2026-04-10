import type { MetadataRoute } from 'next'
import { locales } from '@/lib/i18n'
import { listSlugs } from '@/lib/mdx'

const SITE_URL = 'https://www.racedash.io'

// Static routes every locale has. Dynamic routes (support articles, blog
// posts) are appended in `sitemap()` below by reading the MDX content
// directory at build time.
const STATIC_ROUTES = [
  '',
  '/pricing',
  '/support',
  '/blog',
  '/changelog',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/account',
  '/account/create',
  '/account/authenticate',
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    for (const route of STATIC_ROUTES) {
      entries.push({
        url: `${SITE_URL}/${locale}${route}`,
        lastModified: now,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: route === '' ? 1 : 0.7,
      })
    }

    // Support articles
    const supportSlugs = await listSlugs('support', locale)
    for (const slug of supportSlugs) {
      entries.push({
        url: `${SITE_URL}/${locale}/support/${slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }

    // Blog posts
    const blogSlugs = await listSlugs('blog', locale)
    for (const slug of blogSlugs) {
      entries.push({
        url: `${SITE_URL}/${locale}/blog/${slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
  }

  return entries
}

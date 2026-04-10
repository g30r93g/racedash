import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.racedash.io'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Account routes are gated by Clerk — no need to crawl or index.
        disallow: ['/api/', '/*/account/', '/*/account'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}

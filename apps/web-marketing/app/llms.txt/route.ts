import { listArticles } from '@/lib/mdx'

// llms.txt — a lightweight discovery file for LLMs and AI agents crawling the
// site. Follows the draft convention at https://llmstxt.org/: a Markdown
// document that describes the site, links to key pages, and lists content
// LLMs are welcome to ingest.
//
// We build it dynamically so new support articles / blog posts show up
// automatically without having to hand-edit a static file.

export const dynamic = 'force-static'

const SITE_URL = 'https://www.racedash.io'

type SupportArticle = {
  title: string
  description: string
  category: string
}

type BlogPost = {
  title: string
  description: string
  publishedAt: string
}

export async function GET() {
  const supportArticles = await listArticles<SupportArticle>('support', 'en')
  const blogPosts = await listArticles<BlogPost>('blog', 'en')
  blogPosts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

  const lines: string[] = []
  lines.push('# RaceDash')
  lines.push('')
  lines.push(
    '> RaceDash turns race footage into broadcast-grade race videos — with live timing, telemetry and lap-by-lap overlays baked in. Built for drivers and racers who want to review and share their laps without becoming video editors.',
  )
  lines.push('')
  lines.push('RaceDash is a paid desktop app (macOS & Windows) with optional cloud rendering.')
  lines.push('Annual subscription. GBP pricing. Currently pre-launch with a waitlist open.')
  lines.push('')

  lines.push('## Key pages')
  lines.push('')
  lines.push(`- [Homepage](${SITE_URL}/en): Product overview, waitlist signup`)
  lines.push(`- [Pricing](${SITE_URL}/en/pricing): Plus and Pro subscription tiers, cloud render credits`)
  lines.push(`- [About](${SITE_URL}/en/about): Club100 origin story and company values`)
  lines.push(`- [Support](${SITE_URL}/en/support): Help articles and tutorials`)
  lines.push(`- [Blog](${SITE_URL}/en/blog): Product updates and stories`)
  lines.push(`- [Contact](${SITE_URL}/en/contact): How to reach the team`)
  lines.push('')

  if (supportArticles.length > 0) {
    lines.push('## Support articles')
    lines.push('')
    for (const article of supportArticles) {
      lines.push(`- [${article.title}](${SITE_URL}/en/support/${article.slug}): ${article.description}`)
    }
    lines.push('')
  }

  if (blogPosts.length > 0) {
    lines.push('## Blog posts')
    lines.push('')
    for (const post of blogPosts) {
      lines.push(`- [${post.title}](${SITE_URL}/en/blog/${post.slug}): ${post.description}`)
    }
    lines.push('')
  }

  lines.push('## Legal')
  lines.push('')
  lines.push(`- [Privacy](${SITE_URL}/en/privacy)`)
  lines.push(`- [Terms](${SITE_URL}/en/terms)`)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}

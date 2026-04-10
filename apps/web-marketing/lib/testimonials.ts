import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { Locale } from './i18n'

export type Testimonial = {
  slug: string
  name: string
  role: string
  car?: string
  circuit?: string
  order: number
  featured: boolean
  /** Raw MDX body — rendered by the consumer via next-mdx-remote. */
  body: string
}

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'testimonials')

// Reads all testimonials for a locale at build time. Returns only the
// `featured` entries, sorted by `order`. Adding a testimonial is literally
// dropping a new .mdx file in content/testimonials/<locale>/ — no code change
// required.
export async function getFeaturedTestimonials(locale: Locale): Promise<Testimonial[]> {
  const dir = path.join(CONTENT_ROOT, locale)
  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch {
    // Locale has no testimonials yet — return empty, caller renders nothing.
    return []
  }

  const entries = await Promise.all(
    files
      .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
      .map(async (file) => {
        const raw = await fs.readFile(path.join(dir, file), 'utf8')
        const { data, content } = matter(raw)
        return {
          slug: file.replace(/\.mdx?$/, ''),
          name: String(data.name ?? 'Anonymous'),
          role: String(data.role ?? ''),
          car: data.car ? String(data.car) : undefined,
          circuit: data.circuit ? String(data.circuit) : undefined,
          order: Number(data.order ?? 9999),
          featured: Boolean(data.featured),
          body: content.trim(),
        } satisfies Testimonial
      }),
  )

  return entries.filter((e) => e.featured).sort((a, b) => a.order - b.order)
}

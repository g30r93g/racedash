import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { Locale } from './i18n'

// Generic MDX article loader shared by /support, /blog and /legal routes.
// Each article is an .mdx file with frontmatter + body. Files live under
// content/<collection>/<locale>/<slug>.mdx and are read at build time.
//
// This intentionally stays dumb: it parses frontmatter with gray-matter and
// returns the raw body string. Consumers render the body via next-mdx-remote
// in their own Server Components so they can pass custom MDX components.

export type Article<Frontmatter = Record<string, unknown>> = Frontmatter & {
  slug: string
  body: string
}

const CONTENT_ROOT = path.join(process.cwd(), 'content')

async function readCollection(collection: string, locale: Locale): Promise<string[]> {
  const dir = path.join(CONTENT_ROOT, collection, locale)
  try {
    const entries = await fs.readdir(dir)
    return entries.filter((e) => e.endsWith('.mdx') || e.endsWith('.md'))
  } catch {
    return []
  }
}

// YAML auto-coerces date-looking values (e.g. `2026-04-10`) into JavaScript
// `Date` objects, which blow up when rendered directly as React children.
// Walk the frontmatter once and convert any Date values to ISO date strings.
// Authors should write dates in frontmatter as plain YYYY-MM-DD and consumers
// should treat them as strings.
function normalizeFrontmatter<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10)
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (item instanceof Date ? item.toISOString().slice(0, 10) : item))
    } else {
      out[key] = value
    }
  }
  return out as T
}

async function loadFile<F extends Record<string, unknown>>(
  collection: string,
  locale: Locale,
  filename: string,
): Promise<Article<F>> {
  const raw = await fs.readFile(path.join(CONTENT_ROOT, collection, locale, filename), 'utf8')
  const { data, content } = matter(raw)
  return {
    ...normalizeFrontmatter(data as F),
    slug: filename.replace(/\.mdx?$/, ''),
    body: content.trim(),
  }
}

/**
 * List every article in a collection for a locale. Returns an empty array if
 * the collection/locale has no content yet — callers should handle the empty
 * state rather than treating it as an error.
 */
export async function listArticles<F extends Record<string, unknown>>(
  collection: string,
  locale: Locale,
): Promise<Article<F>[]> {
  const files = await readCollection(collection, locale)
  return Promise.all(files.map((f) => loadFile<F>(collection, locale, f)))
}

/**
 * Load a single article by slug. Returns null when the file is missing so
 * the caller can render a 404 via Next's `notFound()`.
 */
export async function getArticle<F extends Record<string, unknown>>(
  collection: string,
  locale: Locale,
  slug: string,
): Promise<Article<F> | null> {
  const filename = `${slug}.mdx`
  try {
    return await loadFile<F>(collection, locale, filename)
  } catch {
    try {
      return await loadFile<F>(collection, locale, `${slug}.md`)
    } catch {
      return null
    }
  }
}

/**
 * List every slug in a collection for a locale. Used by `generateStaticParams`
 * so dynamic routes pre-render at build time.
 */
export async function listSlugs(collection: string, locale: Locale): Promise<string[]> {
  const files = await readCollection(collection, locale)
  return files.map((f) => f.replace(/\.mdx?$/, ''))
}

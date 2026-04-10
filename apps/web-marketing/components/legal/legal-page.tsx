import { MDXRemote } from 'next-mdx-remote/rsc'
import { mdxComponents } from '@/components/mdx/mdx-prose'
import { PageShell } from '@/components/site/page-shell'
import type { Dictionary } from '@/lib/dictionary'
import type { Locale } from '@/lib/i18n'

type LegalPageProps = {
  locale: Locale
  dict: Dictionary
  eyebrow: string
  heading: string
  lastUpdatedLabel: string
  updatedAt: string
  body: string
}

// Shared layout for legal pages (privacy, terms). They're single-page, long-
// form documents with a stable structure, so sharing the chrome means any
// future legal page only needs an MDX file + a route that calls this.
export function LegalPage({ locale, dict, eyebrow, heading, lastUpdatedLabel, updatedAt, body }: LegalPageProps) {
  return (
    <PageShell locale={locale} dict={dict}>
      <article className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <header className="mb-12">
          <div className="eyebrow mb-4">{eyebrow}</div>
          <h1 className="font-display text-foreground-strong text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
            {heading}
          </h1>
          <div className="text-foreground-dim mt-6 font-mono text-xs tracking-wider">
            {lastUpdatedLabel} {updatedAt}
          </div>
        </header>

        <div className="tick-rule mb-12" aria-hidden />

        <div>
          <MDXRemote source={body} components={mdxComponents} />
        </div>
      </article>
    </PageShell>
  )
}

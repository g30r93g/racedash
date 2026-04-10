import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LegalPage } from '@/components/legal/legal-page'
import { getDictionary } from '@/lib/dictionary'
import { isLocale, type Locale } from '@/lib/i18n'
import { getArticle } from '@/lib/mdx'

type LegalFrontmatter = {
  title: string
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
    title: dict.legal.privacy.metadata.title,
    description: dict.legal.privacy.metadata.description,
  }
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const typedLocale = locale as Locale
  const dict = await getDictionary(typedLocale)
  const article = await getArticle<LegalFrontmatter>('legal', typedLocale, 'privacy')
  if (!article) notFound()

  return (
    <LegalPage
      locale={typedLocale}
      dict={dict}
      eyebrow={dict.legal.privacy.eyebrow}
      heading={dict.legal.privacy.heading}
      lastUpdatedLabel={dict.legal.privacy.lastUpdated}
      updatedAt={article.updatedAt}
      body={article.body}
    />
  )
}

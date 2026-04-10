import 'server-only'
import en from '@/dictionaries/en.json'
import type { Locale } from './i18n'

// The `en` dictionary is the source of truth for the shape. Other locales are
// expected to match this type — TypeScript will flag any drift.
export type Dictionary = typeof en

// Lazy-loaded per-locale dictionaries. Adding a new locale is a one-file job:
// create dictionaries/<locale>.json and add the locale to lib/i18n.ts.
const dictionaries = {
  en: () => import('@/dictionaries/en.json').then((mod) => mod.default as Dictionary),
} satisfies Record<Locale, () => Promise<Dictionary>>

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loader = dictionaries[locale] ?? dictionaries.en
  return loader()
}

// i18n configuration for the RaceDash marketing site.
//
// v1 ships English only. The infrastructure (proxy locale detection, [locale]
// segment, dictionaries, localized content) is in place so additional locales
// can be added by dropping a new dictionary file + testimonial folder.

export const locales = ['en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

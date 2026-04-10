import { ImageResponse } from 'next/og'
import { getDictionary } from '@/lib/dictionary'
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n'

// Dynamic OG image for the homepage (and every per-locale landing). Next
// reads this file and generates a static PNG at build time per locale.
// The design mirrors the hero: deep navy background, a tick-marked
// chronograph arc, the wordmark + headline, rendered at 1200×630.

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Params = { params: Promise<{ locale: string }> }

export default async function OpengraphImage({ params }: Params) {
  const { locale } = await params
  const typedLocale = (isLocale(locale) ? locale : defaultLocale) as Locale
  const dict = await getDictionary(typedLocale)

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #0B1220 0%, #132236 60%, #1a3152 100%)',
        color: '#E8F3FFC2',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Top row — wordmark + eyebrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Simplified chronograph mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            border: '3px solid #8CC8FF',
            borderRadius: '50%',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 4,
              height: 28,
              background: '#8CC8FF',
              top: 6,
              left: '50%',
              marginLeft: -2,
              transform: 'rotate(35deg)',
              transformOrigin: 'bottom center',
              borderRadius: 2,
            }}
          />
          <div
            style={{
              width: 6,
              height: 6,
              background: '#8CC8FF',
              borderRadius: '50%',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: '#F5FAFF',
            letterSpacing: -1,
          }}
        >
          RaceDash
        </div>
      </div>

      {/* Middle — headline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            fontSize: 18,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#8CC8FF',
          }}
        >
          {dict.hero.eyebrow}
        </div>
        <div
          style={{
            fontSize: 86,
            fontWeight: 600,
            color: '#F5FAFF',
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 960,
          }}
        >
          {dict.hero.headline}
        </div>
      </div>

      {/* Bottom row — meta + accent bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontFamily: 'monospace',
            letterSpacing: 2,
            color: '#8CC8FF',
          }}
        >
          www.racedash.io · {dict.hero.meta}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 2,
                height: i % 3 === 0 ? 20 : 12,
                background: '#8CC8FF',
                opacity: i % 3 === 0 ? 0.8 : 0.4,
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    { ...size },
  )
}

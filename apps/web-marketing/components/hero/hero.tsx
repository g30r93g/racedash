import Link from 'next/link'
import { ChronographAperture } from '@/components/brand/chronograph-aperture'
import { EditorWindow } from '@/components/hero/editor-window'
import type { Dictionary } from '@/lib/dictionary'

type HeroProps = {
  dict: Dictionary
}

export function Hero({ dict }: HeroProps) {
  return (
    <section className="relative overflow-hidden pt-40 pb-24 md:pt-48 md:pb-32">
      {/* Radial glow background — top-left, accent color, very soft. */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 -z-10 h-[900px] w-[900px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, #8cc8ff22 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 md:grid-cols-[1.1fr_1fr] md:px-10 lg:gap-20">
        {/* Left — headline column */}
        <div className="max-w-[600px]">
          <div className="animate-rise-in" style={{ animationDelay: '0ms' }}>
            <span className="eyebrow">— {dict.hero.eyebrow} —</span>
          </div>
          <h1
            className="font-display text-foreground-strong mt-6 text-[clamp(2.75rem,6vw,5rem)] leading-[0.98] font-medium tracking-tight animate-rise-in"
            style={{ animationDelay: '100ms' }}
          >
            {dict.hero.headline}
          </h1>
          <p
            className="text-foreground-dim mt-6 max-w-[520px] text-lg leading-relaxed animate-rise-in"
            style={{ animationDelay: '200ms' }}
          >
            {dict.hero.subhead}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4 animate-rise-in" style={{ animationDelay: '300ms' }}>
            <Link
              href="#waitlist"
              className="bg-accent inline-flex items-center rounded-full px-7 py-3.5 text-sm font-medium text-[color:var(--color-background)] transition-all hover:bg-[color:var(--color-accent-strong)] hover:shadow-[0_0_32px_#8CC8FF40]"
            >
              {dict.hero.ctaPrimary}
            </Link>
            <Link
              href="#pricing"
              className="text-foreground hover:text-accent inline-flex items-center rounded-full border border-[color:var(--color-border)] px-7 py-3.5 text-sm font-medium transition-colors hover:border-[color:var(--color-border-strong)]"
            >
              {dict.hero.ctaSecondary}
            </Link>
          </div>

          <div
            className="text-foreground-dim mt-10 font-mono text-[11px] tracking-wider animate-rise-in"
            style={{ animationDelay: '400ms' }}
          >
            {dict.hero.meta}
          </div>
        </div>

        {/* Right — chronograph aperture with editor window inside */}
        <div
          className="relative mx-auto flex items-center justify-center animate-fade-in"
          style={{ animationDelay: '500ms' }}
        >
          <ChronographAperture size={520} className="max-w-full">
            <EditorWindow />
          </ChronographAperture>
        </div>
      </div>
    </section>
  )
}

import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'

type WhyProps = {
  dict: Dictionary
}

// Editorial single-column paragraph section. This is where the privacy /
// local-first message lives ("keeps your footage yours unless you choose
// otherwise") — the features grid no longer carries it since Cloud Rendering
// took that slot.
export function Why({ dict }: WhyProps) {
  return (
    <Section id="why" className="py-32 md:py-40">
      <div className="mx-auto max-w-2xl text-center">
        <div className="eyebrow mb-6">— {dict.why.eyebrow} —</div>
        <h2 className="font-display text-foreground-strong text-4xl leading-[1.08] font-medium tracking-tight md:text-5xl">
          {dict.why.heading}
        </h2>
        <div className="tick-rule mx-auto my-12 max-w-xs" aria-hidden />
        <p className="text-foreground text-xl leading-relaxed">{dict.why.body}</p>
      </div>
    </Section>
  )
}

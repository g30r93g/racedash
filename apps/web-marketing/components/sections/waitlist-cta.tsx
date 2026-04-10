import { ChronographAperture } from '@/components/brand/chronograph-aperture'
import { Section } from '@/components/sections/section'
import { WaitlistForm } from '@/components/waitlist-form'
import type { Dictionary } from '@/lib/dictionary'

type WaitlistCtaProps = {
  dict: Dictionary
}

// The final CTA section. Brings back the chronograph aperture (smaller, 220px)
// as a visual bookend, with the waitlist form centered below.
export function WaitlistCta({ dict }: WaitlistCtaProps) {
  return (
    <Section id="waitlist" className="py-32 md:py-40">
      <div className="flex flex-col items-center text-center">
        <ChronographAperture size={220}>
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <div className="eyebrow text-[10px]">v1.0</div>
              <div className="font-display text-foreground-strong mt-1 text-3xl">2026</div>
            </div>
          </div>
        </ChronographAperture>

        <div className="eyebrow mt-10">— {dict.waitlistCta.eyebrow} —</div>
        <h2 className="font-display text-foreground-strong mt-6 text-5xl leading-[1.05] font-medium tracking-tight md:text-6xl">
          {dict.waitlistCta.heading}
        </h2>
        <p className="text-foreground-dim mt-6 max-w-md text-lg">{dict.waitlistCta.body}</p>

        <div className="mt-10 flex justify-center">
          <WaitlistForm
            placeholder={dict.waitlistCta.placeholder}
            submitLabel={dict.waitlistCta.submit}
            successMessage={dict.waitlistCta.success}
            errorMessage={dict.waitlistCta.error}
          />
        </div>
      </div>
    </Section>
  )
}

import { ChronographAperture } from '@/components/brand/chronograph-aperture'
import { LogoMark } from '@/components/brand/logo-mark'
import { cn } from '@/lib/utils'

type AuthShellProps = {
  eyebrow: string
  heading: string
  body?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

// Shared shell for the sign-in / sign-up / verify screens. Centred single
// column with a small chronograph ornament above the heading for visual
// identity, then the form inside a glass tile, and a secondary row under
// the tile for the "don't have an account" / "already have an account"
// cross-links.
export function AuthShell({ eyebrow, heading, body, children, footer, className }: AuthShellProps) {
  return (
    <section className={cn('relative py-20 md:py-28', className)}>
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 text-center md:px-0">
        <ChronographAperture size={140}>
          {/* Asymmetric padding — the R-mark's visual weight sits on its
              right side (the chronograph bowl + diagonal), so we offset it
              rightwards with extra left padding to feel optically centered
              rather than mathematically centered. */}
          <div className="flex h-full w-full items-center justify-center pt-4 pr-4 pb-4 pl-6">
            <div className="aspect-[179.496/257.624] h-[78%]">
              <LogoMark aria-label="RaceDash" />
            </div>
          </div>
        </ChronographAperture>

        <div className="eyebrow mt-10">— {eyebrow} —</div>
        <h1 className="font-display text-foreground-strong mt-4 text-3xl leading-[1.1] font-medium tracking-tight md:text-4xl">
          {heading}
        </h1>
        {body && <p className="text-foreground-dim mt-4 max-w-sm text-base leading-relaxed">{body}</p>}

        <div className="glass-tile mt-10 w-full p-8 text-left md:p-10">{children}</div>

        {footer && <div className="mt-6 text-sm">{footer}</div>}
      </div>
    </section>
  )
}

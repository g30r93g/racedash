import { LogoMark } from '@/components/brand/logo-mark'
import { cn } from '@/lib/utils'

type WordmarkProps = {
  className?: string
  'aria-label'?: string
  /** When true, render only the R-mark without the "RaceDash" text. */
  markOnly?: boolean
}

// Full RaceDash wordmark: real R-mark asset (from the desktop app) + "RaceDash"
// set in Chakra Petch at a matching weight. The logo's intrinsic aspect is
// tall and narrow, so the mark is sized to match the cap height of the text.
export function Wordmark({ className, 'aria-label': ariaLabel = 'RaceDash', markOnly = false }: WordmarkProps) {
  if (markOnly) {
    return (
      <div role="img" aria-label={ariaLabel} className={cn('inline-flex aspect-[179.496/257.624] h-8', className)}>
        <LogoMark />
      </div>
    )
  }

  return (
    <div role="img" aria-label={ariaLabel} className={cn('inline-flex h-8 items-center gap-2', className)}>
      {/* The mark is significantly taller than wide; size it slightly larger
          than the text cap height so the two feel visually balanced. */}
      <div className="aspect-[179.496/257.624] h-[135%]">
        <LogoMark />
      </div>
      <span className="font-display text-foreground-strong relative top-0.75 text-[1.6em] leading-none font-medium tracking-tight">
        RaceDash
      </span>
    </div>
  )
}

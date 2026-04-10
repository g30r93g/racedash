import { cn } from '@/lib/utils'

type SectionProps = {
  id?: string
  eyebrow?: string
  heading?: string
  body?: string
  className?: string
  children: React.ReactNode
  align?: 'left' | 'center'
}

// Shared section shell — consistent vertical rhythm, eyebrow/heading/body
// header block, and max-width constraint. Used by every content section so
// the page has a single spacing system.
export function Section({ id, eyebrow, heading, body, className, children, align = 'left' }: SectionProps) {
  return (
    <section id={id} className={cn('relative py-24 md:py-32', className)}>
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        {(eyebrow || heading || body) && (
          <header className={cn('mb-16 max-w-3xl', align === 'center' && 'mx-auto text-center')}>
            {eyebrow && <div className="eyebrow mb-5">— {eyebrow} —</div>}
            {heading && (
              <h2 className="font-display text-foreground-strong text-4xl leading-[1.05] font-medium tracking-tight md:text-5xl">
                {heading}
              </h2>
            )}
            {body && <p className="text-foreground-dim mt-6 text-lg leading-relaxed">{body}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  )
}

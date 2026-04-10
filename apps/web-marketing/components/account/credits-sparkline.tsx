import { cn } from '@/lib/utils'

type CreditsSparklineProps = {
  /** One number per day. Zeros are valid (no activity). */
  values: number[]
  className?: string
}

// Subtle usage sparkline. Uses the chronograph-aperture vocabulary: accent
// dots at the data points, a faint connecting line, no axes or gridlines.
// Deliberately low visual weight — the credit balance is the hero, the
// sparkline is a glance-level contextual detail.
export function CreditsSparkline({ values, className }: CreditsSparklineProps) {
  const width = 240
  const height = 40
  const padding = 4

  if (values.length === 0) {
    return null
  }

  const max = Math.max(1, ...values)
  const step = (width - padding * 2) / Math.max(1, values.length - 1)
  const points = values.map((v, i) => ({
    x: padding + i * step,
    y: padding + (1 - v / max) * (height - padding * 2),
    value: v,
  }))

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-10 w-full max-w-[240px]', className)} aria-hidden>
      {/* Connecting line — low opacity so it reads as atmospheric, not data */}
      <path d={path} stroke="#8CC8FF" strokeOpacity="0.35" strokeWidth="1" fill="none" />
      {/* Dots — only non-zero days get the accent dot */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.value === 0 ? 0.8 : 1.8}
          fill="#8CC8FF"
          opacity={p.value === 0 ? 0.3 : 0.85}
        />
      ))}
    </svg>
  )
}

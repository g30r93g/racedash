import { cn } from '@/lib/utils'

type ChronographApertureProps = {
  className?: string
  /** Size in px, used for both width and height. Defaults to 480. */
  size?: number
  /** Content to render inside the aperture (e.g. the fake editor window). */
  children?: React.ReactNode
}

// Chronograph aperture — the hero's signature device. A large squircle with
// the brand glass recipe, framed by a slowly-rotating tick-marked arc. The
// slot inside holds whatever showcase content we want (a fake editor window,
// a video, a poster frame).
//
// Sized to work well around 480px on desktop and scales down gracefully.
export function ChronographAperture({ className, size = 480, children }: ChronographApertureProps) {
  const radius = size / 2
  const tickOuter = radius - 2
  const tickInner = radius - 14

  // 60 ticks — one per "second" on a chronograph face. Every 5th is longer
  // to mark the 5-second intervals, matching a real stopwatch bezel.
  const ticks = Array.from({ length: 60 }).map((_, i) => {
    const angle = (i * 6 * Math.PI) / 180
    const isMajor = i % 5 === 0
    const inner = isMajor ? tickInner - 4 : tickInner
    const x1 = radius + Math.sin(angle) * inner
    const y1 = radius - Math.cos(angle) * inner
    const x2 = radius + Math.sin(angle) * tickOuter
    const y2 = radius - Math.cos(angle) * tickOuter
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#8CC8FF"
        strokeWidth={isMajor ? 2 : 1}
        strokeLinecap="round"
        opacity={isMajor ? 0.55 : 0.25}
      />
    )
  })

  return (
    <div className={cn('relative isolate', className)} style={{ width: size, height: size }}>
      {/* Rotating tick-marked bezel */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="animate-slow-spin pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {ticks}
      </svg>

      {/* Inner glass aperture — the thing that holds the showcase */}
      <div
        className="glass-tile absolute overflow-hidden"
        style={{
          inset: 24,
          borderRadius: 'calc(var(--radius-4xl) - 24px)',
        }}
      >
        {children}
      </div>

      {/* Soft cyan glow behind everything, positioned top-left per the brand */}
      <div
        className="pointer-events-none absolute -inset-10 -z-10 blur-3xl"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 25% 20%, #8cc8ff33 0%, transparent 70%)',
        }}
        aria-hidden
      />
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// The hero's signature: a fake desktop editor window showing a session with
// real-product overlay data (lap number, lap time, position). The UI cycles
// through six laps in sequence; when it lands on the fastest, the "BEST LAP"
// badge lights up — exactly the feature Club100 drivers wanted between runs.
//
// Rendered in HTML/SVG rather than video so it's responsive, localizable,
// and advertises the actual product. Respects prefers-reduced-motion.

type Lap = {
  number: number
  timeMs: number
  position: number
}

const SESSION: Lap[] = [
  { number: 1, timeMs: 61_812, position: 6 },
  { number: 2, timeMs: 61_204, position: 5 },
  { number: 3, timeMs: 60_317, position: 4 }, // ← fastest
  { number: 4, timeMs: 60_918, position: 4 },
  { number: 5, timeMs: 61_038, position: 3 },
  { number: 6, timeMs: 61_523, position: 3 },
]

const FASTEST_INDEX = SESSION.reduce((best, lap, i, arr) => (lap.timeMs < arr[best].timeMs ? i : best), 0)

const LAP_DWELL_MS = 1800 // time spent on each lap before cycling

function formatLap(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

export function EditorWindow({ className }: { className?: string }) {
  const [lapIndex, setLapIndex] = useState(FASTEST_INDEX)
  const [scrub, setScrub] = useState(0.5)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      setLapIndex(FASTEST_INDEX)
      setScrub(0.5)
      return
    }

    startRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const stepIndex = Math.floor(elapsed / LAP_DWELL_MS) % SESSION.length
      setLapIndex(stepIndex)
      // Scrub the playhead across the full session as time progresses.
      const progress = ((elapsed % (LAP_DWELL_MS * SESSION.length)) / (LAP_DWELL_MS * SESSION.length)) % 1
      setScrub(progress)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const lap = SESSION[lapIndex]
  const isBest = lapIndex === FASTEST_INDEX

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-[inherit] bg-[color:var(--color-surface-deep)]',
        className,
      )}
    >
      {/* Fake titlebar */}
      <div className="flex h-8 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]/70" />
        <span className="size-2.5 rounded-full bg-[#febc2e]/70" />
        <span className="size-2.5 rounded-full bg-[#28c840]/70" />
        <div className="text-foreground-dim ml-3 font-mono text-[10px] tracking-wider">
          club100-may-heat-03.rdx — RaceDash
        </div>
      </div>

      {/* Track scene — abstract SVG, zero asset weight */}
      <div className="relative h-[calc(100%-64px)] w-full overflow-hidden">
        <TrackScene scrub={scrub} />

        {/* Floating lap overlay (top-right) — mirrors the real Banner style */}
        <div className="absolute top-4 right-4 w-[220px]">
          <div className="glass-tile-sm px-4 py-3">
            <div className="text-foreground-dim mb-2 flex items-center justify-between font-mono text-[9px] tracking-wider uppercase">
              <span>
                Lap {lap.number.toString().padStart(2, '0')} / {SESSION.length}
              </span>
              {isBest ? (
                <span className="text-accent flex items-center gap-1">
                  <span className="bg-accent size-1.5 animate-pulse rounded-full" />
                  BEST LAP
                </span>
              ) : (
                <span className="text-foreground-dim">—</span>
              )}
            </div>
            <div
              className={cn(
                'font-mono text-[28px] leading-none font-medium tabular-nums',
                isBest ? 'text-accent' : 'text-[color:var(--color-foreground-strong)]',
              )}
            >
              {formatLap(lap.timeMs)}
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-foreground-dim font-mono text-[9px] tracking-wider uppercase">Pos</div>
                <div className="text-foreground-strong font-mono text-lg tabular-nums">P{lap.position}</div>
              </div>
              <LapTrend lapIndex={lapIndex} />
            </div>
          </div>
        </div>

        {/* Session identifier (bottom-left) */}
        <div className="absolute bottom-4 left-4">
          <div className="eyebrow text-foreground-dim mb-1 text-[9px]">Club100 · Heat 03</div>
          <div className="font-display text-foreground-strong text-xl">Kart #47</div>
        </div>
      </div>

      {/* Timeline with lap markers + playhead showing session position */}
      <div className="relative h-8 border-t border-[color:var(--color-border-soft)] px-3">
        <div className="absolute inset-x-3 top-1/2 h-[2px] -translate-y-1/2 bg-[color:var(--color-border-soft)]" />
        {SESSION.map((l, i) => {
          const leftPct = (i / (SESSION.length - 1)) * 100
          const isActive = i === lapIndex
          return (
            <div
              key={l.number}
              className={cn(
                'absolute top-1/2 h-3 w-[2px] -translate-y-1/2 transition-colors',
                i === FASTEST_INDEX ? 'bg-accent' : 'bg-[color:var(--color-border-strong)]',
                isActive && 'h-5',
              )}
              style={{ left: `calc(12px + (100% - 24px) * ${leftPct / 100})` }}
            />
          )
        })}
        {/* Playhead */}
        <div
          className="bg-accent absolute top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_#8CC8FF]"
          style={{ left: `calc(12px + (100% - 24px) * ${scrub})` }}
        />
        <div className="text-foreground-dim absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[9px] tracking-wider">
          {formatLap(lap.timeMs)}
        </div>
      </div>
    </div>
  )
}

// Tiny sparkline showing the trend of lap times across the session, with the
// current lap highlighted. Purely visual — zero interactivity.
function LapTrend({ lapIndex }: { lapIndex: number }) {
  const max = Math.max(...SESSION.map((l) => l.timeMs))
  const min = Math.min(...SESSION.map((l) => l.timeMs))
  const range = max - min || 1
  const w = 72
  const h = 22
  const step = w / (SESSION.length - 1)

  const points = SESSION.map((l, i) => {
    const x = i * step
    const y = h - ((l.timeMs - min) / range) * h
    return { x, y }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-80" aria-hidden>
      <path d={path} stroke="#8CC8FF" strokeWidth="1.5" fill="none" opacity="0.5" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === lapIndex ? 2.5 : 1.5}
          fill={i === FASTEST_INDEX ? '#8CC8FF' : '#E8F3FF'}
          opacity={i === lapIndex ? 1 : 0.5}
        />
      ))}
    </svg>
  )
}

// Abstract track scene — deep navy sky, stylized horizon, dashed centre line
// that scrolls with the session playhead so the frame feels alive.
function TrackScene({ scrub }: { scrub: number }) {
  const stripeOffset = (scrub * 800) % 40
  return (
    <svg
      viewBox="0 0 640 360"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1220" />
          <stop offset="60%" stopColor="#132236" />
          <stop offset="100%" stopColor="#1a3152" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a3152" />
          <stop offset="100%" stopColor="#0B1220" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8CC8FF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8CC8FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="640" height="200" fill="url(#sky)" />
      <rect x="0" y="200" width="640" height="160" fill="url(#ground)" />
      <ellipse cx="320" cy="200" rx="280" ry="30" fill="url(#glow)" />
      <path
        d="M 120 360 L 280 200 L 360 200 L 520 360 Z"
        fill="#0B1220"
        stroke="#8CC8FF"
        strokeOpacity="0.2"
        strokeWidth="1"
      />
      <line
        x1="320"
        y1="200"
        x2="320"
        y2="360"
        stroke="#8CC8FF"
        strokeOpacity="0.5"
        strokeWidth="3"
        strokeDasharray="20 20"
        strokeDashoffset={-stripeOffset}
      />
      <path
        d="M 0 200 L 80 170 L 140 185 L 220 160 L 300 180 L 380 155 L 460 175 L 540 165 L 640 185 L 640 200 Z"
        fill="#8CC8FF"
        fillOpacity="0.08"
      />
      <g stroke="#8CC8FF" strokeOpacity="0.3" strokeWidth="1">
        {Array.from({ length: 20 }).map((_, i) => (
          <line key={i} x1={40 + i * 30} y1="198" x2={40 + i * 30} y2="202" />
        ))}
      </g>
    </svg>
  )
}

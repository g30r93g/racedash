import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'

type ShowcaseProps = {
  dict: Dictionary
}

// A single large glass tile that functions as a "hero feature" for overlays.
// Shows a stylized freeze-frame of a car with telemetry composited on top,
// rendered in pure SVG to avoid shipping real asset bytes for a placeholder.
export function Showcase({ dict }: ShowcaseProps) {
  return (
    <Section id="overlays" eyebrow={dict.showcase.eyebrow} heading={dict.showcase.heading} body={dict.showcase.body}>
      <div className="glass-tile relative aspect-[16/9] w-full overflow-hidden">
        <svg
          viewBox="0 0 1600 900"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <linearGradient id="showcase-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0B1220" />
              <stop offset="50%" stopColor="#132236" />
              <stop offset="100%" stopColor="#1a3a5c" />
            </linearGradient>
            <linearGradient id="showcase-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a3a5c" />
              <stop offset="100%" stopColor="#0B1220" />
            </linearGradient>
            <radialGradient id="showcase-sun" cx="30%" cy="30%" r="40%">
              <stop offset="0%" stopColor="#8CC8FF" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8CC8FF" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sky + ground */}
          <rect width="1600" height="480" fill="url(#showcase-sky)" />
          <rect y="480" width="1600" height="420" fill="url(#showcase-ground)" />
          <rect width="1600" height="900" fill="url(#showcase-sun)" />

          {/* Distant hills */}
          <path
            d="M 0 480 L 200 420 L 350 455 L 500 400 L 700 445 L 900 405 L 1100 440 L 1300 415 L 1500 450 L 1600 430 L 1600 480 Z"
            fill="#8CC8FF"
            fillOpacity="0.08"
          />

          {/* Track tarmac */}
          <path d="M 200 900 L 680 480 L 920 480 L 1400 900 Z" fill="#0B1220" stroke="#8CC8FF" strokeOpacity="0.15" />
          {/* Track centerline dashes */}
          <line
            x1="800"
            y1="480"
            x2="800"
            y2="900"
            stroke="#8CC8FF"
            strokeOpacity="0.5"
            strokeWidth="6"
            strokeDasharray="40 40"
          />
          {/* Track edges — white */}
          <line x1="680" y1="480" x2="200" y2="900" stroke="#e8f3ff" strokeOpacity="0.3" strokeWidth="3" />
          <line x1="920" y1="480" x2="1400" y2="900" stroke="#e8f3ff" strokeOpacity="0.3" strokeWidth="3" />

          {/* Stylized car silhouette (McLaren-ish GT4 low profile) */}
          <g transform="translate(800, 720)">
            <ellipse cx="0" cy="80" rx="180" ry="20" fill="#000" opacity="0.4" />
            {/* Body */}
            <path
              d="M -160 40 Q -140 0 -80 -10 L 80 -10 Q 140 0 160 40 L 150 60 L -150 60 Z"
              fill="#1a3a5c"
              stroke="#8CC8FF"
              strokeWidth="2"
              strokeOpacity="0.6"
            />
            {/* Windscreen */}
            <path d="M -70 -8 L -40 -30 L 40 -30 L 70 -8 Z" fill="#0B1220" opacity="0.9" />
            {/* Headlight glow */}
            <circle cx="-130" cy="20" r="8" fill="#8CC8FF" opacity="0.8" />
            <circle cx="130" cy="20" r="8" fill="#8CC8FF" opacity="0.8" />
            <circle cx="-130" cy="20" r="20" fill="#8CC8FF" opacity="0.2" />
            <circle cx="130" cy="20" r="20" fill="#8CC8FF" opacity="0.2" />
            {/* Wheels */}
            <ellipse cx="-110" cy="55" rx="28" ry="14" fill="#0B1220" />
            <ellipse cx="110" cy="55" rx="28" ry="14" fill="#0B1220" />
          </g>
        </svg>

        {/* Overlay composite — sits on top of the SVG scene. Mirrors the real
            product's Banner overlay: session, lap number, lap time, position.
            Intentionally narrow (no speed, gear, delta or telemetry) because
            that's what the app actually renders. */}
        <div className="absolute inset-0 p-6 md:p-10">
          {/* Top strip: session identifier */}
          <div className="flex items-start justify-between">
            <div>
              <div className="eyebrow text-[11px]">Club100 · Heat 03</div>
              <div className="font-display text-foreground-strong mt-2 text-2xl md:text-4xl">LAP 03 / 12</div>
            </div>
            <div className="glass-tile-sm border-accent/60 px-4 py-2">
              <div className="text-accent font-mono text-[9px] tracking-wider uppercase">Best Lap</div>
              <div className="text-accent font-mono text-2xl tabular-nums">★</div>
            </div>
          </div>

          {/* Bottom bar: the three readouts the product actually draws. */}
          <div className="absolute right-6 bottom-6 left-6 md:right-10 md:bottom-10 md:left-10">
            <div className="glass-tile-sm flex flex-wrap items-center gap-8 px-8 py-5 md:gap-16">
              <Readout label="Lap time" value="1:00.317" accent />
              <Readout label="Position" value="P4" />
              <Readout label="Driver" value="Kart #47" />
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="shrink-0">
      <div className="text-foreground-dim font-mono text-[9px] tracking-wider uppercase">{label}</div>
      <div
        className="font-mono text-xl tabular-nums md:text-2xl"
        style={{
          color: accent ? 'var(--color-accent)' : 'var(--color-foreground-strong)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

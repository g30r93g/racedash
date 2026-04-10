import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'

type PrimitivesProps = {
  dict: Dictionary
}

// Three horizontal glass-tile rows — Configure / Sync / Render. Each row has
// a huge outlined numeral on the left, the content in the middle, and a
// placeholder preview on the right. The preview is abstract (SVG) so we have
// something visual without needing real screenshots yet.
export function Primitives({ dict }: PrimitivesProps) {
  return (
    <Section id="how-it-works" eyebrow={dict.primitives.eyebrow} heading={dict.primitives.heading}>
      <div className="flex flex-col gap-8">
        {dict.primitives.items.map((item, i) => (
          <article
            key={item.number}
            className="glass-tile grid grid-cols-1 items-center gap-8 p-10 md:grid-cols-[auto_1fr_auto] md:gap-12 md:p-14"
          >
            {/* Big outlined numeral */}
            <div
              className="font-display text-[clamp(5rem,10vw,8rem)] leading-none font-medium tracking-tighter"
              style={{
                WebkitTextStroke: '1.5px #8CC8FF',
                color: 'transparent',
              }}
              aria-hidden
            >
              {item.number}
            </div>
            {/* Copy block */}
            <div className="max-w-xl">
              <div className="eyebrow mb-3">{item.eyebrow}</div>
              <h3 className="font-display text-foreground-strong text-2xl leading-tight font-medium md:text-3xl">
                {item.heading}
              </h3>
              <p className="text-foreground-dim mt-4 leading-relaxed">{item.body}</p>
            </div>
            {/* Preview placeholder */}
            <PreviewPlate variant={i} />
          </article>
        ))}
      </div>
    </Section>
  )
}

function PreviewPlate({ variant }: { variant: number }) {
  return (
    <div className="glass-tile-sm hidden h-[180px] w-[240px] shrink-0 overflow-hidden md:block">
      <svg viewBox="0 0 240 180" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`pv-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#132236" />
            <stop offset="100%" stopColor="#0B1220" />
          </linearGradient>
        </defs>
        <rect width="240" height="180" fill={`url(#pv-${variant})`} />
        {/* Titlebar */}
        <rect x="0" y="0" width="240" height="16" fill="#0B1220" />
        <circle cx="8" cy="8" r="2" fill="#8CC8FF" opacity="0.4" />
        <circle cx="16" cy="8" r="2" fill="#8CC8FF" opacity="0.4" />
        <circle cx="24" cy="8" r="2" fill="#8CC8FF" opacity="0.4" />

        {variant === 0 && <ConfigurePreview />}
        {variant === 1 && <SyncPreview />}
        {variant === 2 && <RenderPreview />}
      </svg>
    </div>
  )
}

function ConfigurePreview() {
  // A stack of form rows representing session setup
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="16" y={32 + i * 30} width="60" height="8" rx="2" fill="#8CC8FF" opacity="0.4" />
          <rect
            x="84"
            y={28 + i * 30}
            width="140"
            height="16"
            rx="4"
            fill="#14202E"
            stroke="#8CC8FF"
            strokeOpacity="0.3"
          />
        </g>
      ))}
    </g>
  )
}

function SyncPreview() {
  // A timeline with lap markers and a synced waveform
  return (
    <g>
      {/* Waveform */}
      <path
        d="M 16 80 Q 28 60 40 80 T 64 80 T 88 80 T 112 80 T 136 80 T 160 80 T 184 80 T 208 80 T 224 80"
        stroke="#8CC8FF"
        strokeWidth="2"
        fill="none"
        opacity="0.7"
      />
      {/* Timeline */}
      <line x1="16" y1="130" x2="224" y2="130" stroke="#8CC8FF" strokeOpacity="0.3" strokeWidth="2" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line
            x1={30 + i * 60}
            y1="124"
            x2={30 + i * 60}
            y2="136"
            stroke="#8CC8FF"
            strokeOpacity="0.6"
            strokeWidth="2"
          />
          <text
            x={30 + i * 60}
            y="152"
            fontFamily="Geist Mono, monospace"
            fontSize="8"
            fill="#8CC8FF"
            opacity="0.6"
            textAnchor="middle"
          >
            L{i + 1}
          </text>
        </g>
      ))}
    </g>
  )
}

function RenderPreview() {
  // A render queue with progress bars
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x="16"
            y={32 + i * 36}
            width="208"
            height="24"
            rx="4"
            fill="#14202E"
            stroke="#8CC8FF"
            strokeOpacity="0.2"
          />
          <rect
            x="18"
            y={34 + i * 36}
            width={i === 0 ? 204 : i === 1 ? 140 : 60}
            height="20"
            rx="3"
            fill="#8CC8FF"
            opacity={i === 0 ? 0.9 : i === 1 ? 0.5 : 0.3}
          />
          <text x="22" y={48 + i * 36} fontFamily="Geist Mono, monospace" fontSize="8" fill="#0B1220">
            lap-{(i + 1).toString().padStart(2, '0')}.mp4
          </text>
        </g>
      ))}
    </g>
  )
}

import { Cloud, Film, Flag, Gauge, Layers, Radio, Zap } from 'lucide-react'
import { Section } from '@/components/sections/section'
import type { Dictionary } from '@/lib/dictionary'
import { cn } from '@/lib/utils'

const iconMap = {
  radio: Radio,
  gauge: Gauge,
  zap: Zap,
  layers: Layers,
  film: Film,
  cloud: Cloud,
} as const

type IconKey = keyof typeof iconMap

type FeaturesGridProps = {
  dict: Dictionary
}

// 3x2 grid of glass tiles. Each tile: thin-stroke Lucide icon, heading, body.
// Two tiles get special treatment:
//   - Cloud Rendering is accent-ringed and flagged "New"
//   - Any feature marked `proOnly: true` in the dictionary shows a Pro pill
//     in the top-right corner, because it's gated to the Pro subscription
export function FeaturesGrid({ dict }: FeaturesGridProps) {
  return (
    <Section id="features" eyebrow={dict.features.eyebrow} heading={dict.features.heading}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {dict.features.items.map((feature) => {
          const Icon = iconMap[feature.icon as IconKey] ?? Flag
          const isCloud = feature.icon === 'cloud'
          const isProOnly = 'proOnly' in feature && feature.proOnly === true
          return (
            <article
              key={feature.heading}
              className={cn(
                'glass-tile group relative flex flex-col p-8 transition-all hover:-translate-y-1 hover:shadow-[0_32px_72px_#00000080]',
                isCloud && 'ring-accent/20 ring-1',
              )}
            >
              {isProOnly && (
                <span
                  className="border-accent/40 bg-accent/10 text-accent eyebrow absolute top-6 right-6 inline-flex items-center rounded-full border px-2.5 py-1 text-[9px]"
                  aria-label="Pro subscription required"
                >
                  Pro
                </span>
              )}
              <div className="border-accent/30 bg-accent/5 text-accent mb-6 inline-flex size-12 items-center justify-center rounded-[18px] border transition-colors group-hover:bg-[color:var(--color-accent)]/15">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="font-display text-foreground-strong text-xl leading-tight font-medium">
                {feature.heading}
              </h3>
              <p className="text-foreground-dim mt-3 leading-relaxed">{feature.body}</p>
              {isCloud && <div className="eyebrow text-accent mt-6 text-[10px]">— New —</div>}
            </article>
          )
        })}
      </div>
    </Section>
  )
}

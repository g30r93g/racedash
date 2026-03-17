import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type OverlayType = 'banner' | 'geometric-banner' | 'esports' | 'minimal' | 'modern'

const OVERLAYS: Array<{
  id: OverlayType
  name: string
  description: string
  preview: React.ReactElement
}> = [
  {
    id: 'banner',
    name: 'Banner',
    description: 'Classic bottom bar',
    preview: (
      <svg viewBox="0 0 160 90" className="h-full w-full">
        <rect width="160" height="90" fill="#1a1a1a" />
        <rect x="8" y="8" width="144" height="56" rx="2" fill="#2a2a2a" />
        <rect x="0" y="72" width="160" height="18" fill="#111" />
        <rect x="8" y="76" width="18" height="10" rx="1" fill="#3b82f6" />
        <rect x="30" y="78" width="40" height="6" rx="1" fill="#555" />
        <rect x="76" y="78" width="30" height="6" rx="1" fill="#444" />
      </svg>
    ),
  },
  {
    id: 'geometric-banner',
    name: 'Geometric Banner',
    description: 'Angled racing aesthetic',
    preview: (
      <svg viewBox="0 0 160 90" className="h-full w-full">
        <rect width="160" height="90" fill="#1a1a1a" />
        <rect x="8" y="8" width="144" height="56" rx="2" fill="#2a2a2a" />
        <polygon points="0,72 160,68 160,90 0,90" fill="#111" />
        <polygon points="6,74 30,73 26,82 2,83" fill="#3b82f6" />
        <rect x="34" y="75" width="40" height="5" rx="1" fill="#555" />
        <rect x="34" y="82" width="30" height="4" rx="1" fill="#444" />
      </svg>
    ),
  },
  {
    id: 'esports',
    name: 'Esports',
    description: 'Bold top bar + leaderboard',
    preview: (
      <svg viewBox="0 0 160 90" className="h-full w-full">
        <rect width="160" height="90" fill="#1a1a1a" />
        <rect x="0" y="0" width="160" height="16" fill="#111" />
        <rect x="6" y="4" width="16" height="8" rx="1" fill="#3b82f6" />
        <rect x="26" y="6" width="40" height="4" rx="1" fill="#555" />
        <rect x="110" y="20" width="44" height="62" rx="2" fill="#111" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="114" y={24 + i * 14} width="36" height="10" rx="1" fill={i === 0 ? '#3b82f6' : '#222'} />
        ))}
        <rect x="8" y="20" width="98" height="64" rx="2" fill="#2a2a2a" />
      </svg>
    ),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Subtle corner labels',
    preview: (
      <svg viewBox="0 0 160 90" className="h-full w-full">
        <rect width="160" height="90" fill="#1a1a1a" />
        <rect x="8" y="8" width="144" height="74" rx="2" fill="#2a2a2a" />
        <rect x="12" y="12" width="28" height="8" rx="1" fill="#1118" />
        <rect x="12" y="22" width="20" height="6" rx="1" fill="#1118" />
        <rect x="12" y="68" width="28" height="8" rx="1" fill="#1118" />
      </svg>
    ),
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Frosted glass card',
    preview: (
      <svg viewBox="0 0 160 90" className="h-full w-full">
        <rect width="160" height="90" fill="#1a1a1a" />
        <rect x="8" y="8" width="144" height="74" rx="2" fill="#2a2a2a" />
        <rect x="20" y="58" width="120" height="18" rx="4" fill="#ffffff18" />
        <rect x="26" y="62" width="22" height="5" rx="1" fill="#ffffff44" />
        <rect x="56" y="62" width="22" height="5" rx="1" fill="#ffffff44" />
        <rect x="86" y="62" width="22" height="5" rx="1" fill="#ffffff44" />
        <rect x="26" y="68" width="14" height="4" rx="1" fill="#3b82f680" />
        <rect x="56" y="68" width="14" height="4" rx="1" fill="#ffffff30" />
        <rect x="86" y="68" width="14" height="4" rx="1" fill="#ffffff30" />
      </svg>
    ),
  },
]

interface OverlayPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: OverlayType
  onApply: (overlay: OverlayType) => void
}

export function OverlayPickerModal({ open, onOpenChange, current, onApply }: OverlayPickerModalProps): React.ReactElement {
  const [selected, setSelected] = useState<OverlayType>(current)

  useEffect(() => {
    if (open) setSelected(current)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- current intentionally omitted, only reset on re-open

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[740px] max-w-[740px]">
        <h2 className="mb-1 text-base font-semibold text-foreground">Choose Overlay Style</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Select how your timing data is displayed on the video
        </p>

        <div className="mb-3 grid grid-cols-3 gap-3">
          {OVERLAYS.slice(0, 3).map((o) => (
            <OverlayCard key={o.id} overlay={o} isSelected={selected === o.id} onSelect={() => setSelected(o.id)} />
          ))}
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {OVERLAYS.slice(3).map((o) => (
            <OverlayCard key={o.id} overlay={o} isSelected={selected === o.id} onSelect={() => setSelected(o.id)} />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onApply(selected)}>Apply Style</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OverlayCard({
  overlay,
  isSelected,
  onSelect,
}: {
  overlay: (typeof OVERLAYS)[number]
  isSelected: boolean
  onSelect: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-lg border-2 bg-accent text-left transition-colors',
        isSelected ? 'border-primary' : 'border-transparent hover:border-border'
      )}
    >
      <div className="h-[90px] w-full overflow-hidden bg-[#111]">{overlay.preview}</div>
      <div className="p-2">
        <p className="text-xs font-medium text-foreground">{overlay.name}</p>
        <p className="text-[10px] text-muted-foreground">{overlay.description}</p>
      </div>
      {isSelected && (
        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  )
}

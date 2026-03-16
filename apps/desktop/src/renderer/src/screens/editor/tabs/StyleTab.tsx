import React, { useState } from 'react'
import type { OverlayType } from './OverlayPickerModal'
import { OverlayPickerModal } from './OverlayPickerModal'
import { SectionLabel } from '@/components/app/SectionLabel'
import { ColourRow } from '@/components/app/ColourRow'
import { Button } from '@/components/ui/button'

const OVERLAY_NAMES: Record<OverlayType, string> = {
  banner: 'Banner',
  'geometric-banner': 'Geometric Banner',
  esports: 'Esports',
  minimal: 'Minimal',
  modern: 'Modern',
}

export function StyleTab(): React.ReactElement {
  const [overlayType, setOverlayType] = useState<OverlayType>('banner')
  const [showOverlayPicker, setShowOverlayPicker] = useState(false)
  const [accentColour, setAccentColour] = useState('#3b82f6')
  const [bannerTimerText, setBannerTimerText] = useState('#ffffff')
  const [bannerTimerBg, setBannerTimerBg] = useState('#111111')
  const [bannerBannerBg, setBannerBannerBg] = useState('#1c1c1c')
  const [esportsOurRow, setEsportsOurRow] = useState('#3b82f6')
  const [esportsText, setEsportsText] = useState('#ffffff')

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* OVERLAY TYPE */}
      <section>
        <SectionLabel>Overlay Type</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-6 rounded-sm bg-primary opacity-80" />
            <span className="text-sm text-foreground">{OVERLAY_NAMES[overlayType]}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowOverlayPicker(true)}>
            Change
          </Button>
        </div>
      </section>

      {/* ACCENT COLOUR */}
      <section>
        <SectionLabel>Accent Colour</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <ColourRow label="Accent" value={accentColour} onChange={setAccentColour} />
        </div>
      </section>

      {/* STYLE-SPECIFIC */}
      {overlayType === 'banner' && (
        <section>
          <SectionLabel>Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Timer text" value={bannerTimerText} onChange={setBannerTimerText} />
            <div className="border-t border-border" />
            <ColourRow label="Timer background" value={bannerTimerBg} onChange={setBannerTimerBg} />
            <div className="border-t border-border" />
            <ColourRow label="Banner background" value={bannerBannerBg} onChange={setBannerBannerBg} />
          </div>
        </section>
      )}

      {overlayType === 'esports' && (
        <section>
          <SectionLabel>Leaderboard</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Our row" value={esportsOurRow} onChange={setEsportsOurRow} />
            <div className="border-t border-border" />
            <ColourRow label="Text" value={esportsText} onChange={setEsportsText} />
          </div>
        </section>
      )}

      <OverlayPickerModal
        open={showOverlayPicker}
        onOpenChange={setShowOverlayPicker}
        current={overlayType}
        onApply={(overlay) => { setOverlayType(overlay); setShowOverlayPicker(false) }}
      />
    </div>
  )
}

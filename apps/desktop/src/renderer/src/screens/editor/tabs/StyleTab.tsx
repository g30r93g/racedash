import React, { useCallback, useRef, useState } from 'react'
import type { OverlayStyling } from '@racedash/core'
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

export interface StyleState {
  overlayType: OverlayType
  styling: OverlayStyling
}

interface StyleTabProps {
  styleState: StyleState
  onStyleChange: (next: StyleState) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function StyleTab({ styleState, onStyleChange, onUndo, onRedo, canUndo, canRedo }: StyleTabProps): React.ReactElement {
  const [showOverlayPicker, setShowOverlayPicker] = useState(false)
  const { overlayType, styling } = styleState

  // Debounced colour change: waits 400ms after the last drag tick before committing
  // to history. Only one onStyleChange call fires per drag — NOT immediately.
  // Uses a latestRef to avoid stale-closure issues.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<{ styleState: StyleState; patch: OverlayStyling }>({ styleState, patch: {} })

  const handleColourChange = useCallback((patch: OverlayStyling) => {
    latestRef.current = { styleState, patch }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const { styleState: s, patch: p } = latestRef.current
      onStyleChange({ ...s, styling: { ...s.styling, ...p } })
    }, 400)
  }, [styleState, onStyleChange])

  const accent = styling.accentColor ?? '#3b82f6'
  const bannerTimerText = styling.banner?.timerTextColor ?? '#ffffff'
  const bannerTimerBg = styling.banner?.timerBgColor ?? '#111111'
  const bannerBannerBg = styling.banner?.bgColor ?? '#1c1c1c'
  const esportsOurRow = styling.leaderboard?.ourRowBgColor ?? '#3b82f6'
  const esportsText = styling.leaderboard?.textColor ?? '#ffffff'

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* UNDO / REDO */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo}>Undo</Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo}>Redo</Button>
      </div>

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
          <ColourRow
            label="Accent"
            value={accent}
            onChange={(v) => handleColourChange({ accentColor: v })}
          />
        </div>
      </section>

      {/* STYLE-SPECIFIC */}
      {overlayType === 'banner' && (
        <section>
          <SectionLabel>Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Timer text" value={bannerTimerText} onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerTextColor: v } })} />
            <div className="border-t border-border" />
            <ColourRow label="Timer background" value={bannerTimerBg} onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerBgColor: v } })} />
            <div className="border-t border-border" />
            <ColourRow label="Banner background" value={bannerBannerBg} onChange={(v) => handleColourChange({ banner: { ...styling.banner, bgColor: v } })} />
          </div>
        </section>
      )}

      {overlayType === 'esports' && (
        <section>
          <SectionLabel>Leaderboard</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Our row" value={esportsOurRow} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, ourRowBgColor: v } })} />
            <div className="border-t border-border" />
            <ColourRow label="Text" value={esportsText} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, textColor: v } })} />
          </div>
        </section>
      )}

      <OverlayPickerModal
        open={showOverlayPicker}
        onOpenChange={setShowOverlayPicker}
        current={overlayType}
        onApply={(overlay) => {
          onStyleChange({ ...styleState, overlayType: overlay })
          setShowOverlayPicker(false)
        }}
      />
    </div>
  )
}

import { ColourRow } from '@/components/app/ColourRow'
import { SectionLabel } from '@/components/app/SectionLabel'
import { Button } from '@/components/ui/button'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'
import { Redo, Undo } from 'lucide-react'
import React, { useCallback, useRef, useState } from 'react'
import type { OverlayType } from './OverlayPickerModal'
import { OverlayPickerModal } from './OverlayPickerModal'

const OVERLAY_NAMES: Record<OverlayType, string> = {
  banner: 'Banner',
  'geometric-banner': 'Geometric Banner',
  esports: 'Esports',
  minimal: 'Minimal',
  modern: 'Modern',
}

const BOX_POSITION_OPTIONS: Array<{ value: BoxPosition; label: string }> = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Centre' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Centre' },
  { value: 'top-right', label: 'Top Right' },
]

const CORNER_POSITION_OPTIONS: Array<{ value: CornerPosition; label: string }> = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
]

const OVERLAY_COMPONENT_OPTIONS: Array<{ value: NonNullable<OverlayComponentsConfig['leaderboard']>; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
]

export interface StyleState {
  overlayType: OverlayType
  styling: OverlayStyling
  boxPosition?: BoxPosition
  qualifyingTablePosition?: CornerPosition
  overlayComponents?: OverlayComponentsConfig
}

interface StyleTabProps {
  styleState: StyleState
  onStyleChange: (next: StyleState) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

function Divider(): React.ReactElement {
  return <div className="border-t border-border" />
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

  const handlePositionChange = useCallback((key: 'boxPosition' | 'qualifyingTablePosition', value: string) => {
    onStyleChange({ ...styleState, [key]: value !== '' ? value : undefined })
  }, [styleState, onStyleChange])

  const handleOverlayComponentChange = useCallback((key: keyof OverlayComponentsConfig, value: NonNullable<OverlayComponentsConfig['leaderboard']>) => {
    onStyleChange({
      ...styleState,
      overlayComponents: {
        ...styleState.overlayComponents,
        [key]: value,
      },
    })
  }, [styleState, onStyleChange])

  // Global
  const accent = styling.accentColor ?? '#3DD73D'
  const textColor = styling.textColor ?? '#ffffff'

  // Banner
  const bannerBg = styling.banner?.bgColor ?? '#3DD73D'
  const bannerTimerText = styling.banner?.timerTextColor ?? '#ffffff'
  const bannerTimerBg = styling.banner?.timerBgColor ?? '#111111'
  const bannerLapPurple = styling.banner?.lapColorPurple ?? 'rgba(107, 33, 168, 0.95)'
  const bannerLapGreen = styling.banner?.lapColorGreen ?? 'rgba(21, 128, 61, 0.95)'
  const bannerLapRed = styling.banner?.lapColorRed ?? 'rgba(185, 28, 28, 0.95)'

  // Geometric Banner
  const geoBannerPositionCounter = styling.geometricBanner?.positionCounterColor ?? '#0bc770'
  const geoBannerLastLap = styling.geometricBanner?.lastLapColor ?? '#16aa9c'
  const geoBannerNeutral = styling.geometricBanner?.lapTimerNeutralColor ?? '#0e0ab8'
  const geoBannerPrevLap = styling.geometricBanner?.previousLapColor ?? '#7c16aa'
  const geoBannerLapCounter = styling.geometricBanner?.lapCounterColor ?? '#c70b4d'
  const geoBannerTimerText = styling.geometricBanner?.timerTextColor ?? '#ffffff'
  const geoBannerLapPurple = styling.geometricBanner?.lapColorPurple ?? 'rgba(107, 33, 168, 0.95)'
  const geoBannerLapGreen = styling.geometricBanner?.lapColorGreen ?? 'rgba(21, 128, 61, 0.95)'
  const geoBannerLapRed = styling.geometricBanner?.lapColorRed ?? 'rgba(185, 28, 28, 0.95)'

  // Esports
  const esportsAccentBar = styling.esports?.accentBarColor ?? '#2563eb'
  const esportsAccentBarEnd = styling.esports?.accentBarColorEnd ?? '#7c3aed'
  const esportsTimePanels = styling.esports?.timePanelsBgColor ?? '#3f4755'
  const esportsCurrentBar = styling.esports?.currentBarBgColor ?? '#111111'
  const esportsLabel = styling.esports?.labelColor ?? '#9ca3af'
  const esportsLastLapIcon = styling.esports?.lastLapIconColor ?? '#16a34a'
  const esportsSessionBestIcon = styling.esports?.sessionBestIconColor ?? '#7c3aed'

  // Leaderboard (esports)
  const lbBg = styling.leaderboard?.bgColor ?? 'rgba(0, 0, 0, 0.65)'
  const lbOurRowBg = styling.leaderboard?.ourRowBgColor ?? 'rgba(0, 0, 0, 0.82)'
  const lbText = styling.leaderboard?.textColor ?? '#ffffff'
  const lbPositionText = styling.leaderboard?.positionTextColor ?? 'rgba(255, 255, 255, 0.5)'
  const lbKartText = styling.leaderboard?.kartTextColor ?? 'rgba(255, 255, 255, 0.7)'
  const lbLapTimeText = styling.leaderboard?.lapTimeTextColor ?? 'rgba(255, 255, 255, 0.8)'
  const lbSeparator = styling.leaderboard?.separatorColor ?? 'rgba(255, 255, 255, 0.15)'

  // Minimal
  const minimalBg = styling.minimal?.bgColor ?? 'rgba(20, 22, 28, 0.88)'
  const minimalBadgeBg = styling.minimal?.badgeBgColor ?? '#ffffff'
  const minimalBadgeText = styling.minimal?.badgeTextColor ?? '#222222'
  const minimalStatLabel = styling.minimal?.statLabelColor ?? '#aaaaaa'

  // Modern
  const modernBg = styling.modern?.bgColor ?? 'rgba(13, 15, 20, 0.88)'
  const modernDivider = styling.modern?.dividerColor ?? 'rgba(255, 255, 255, 0.2)'
  const modernStatLabel = styling.modern?.statLabelColor ?? 'rgba(255, 255, 255, 0.5)'

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* UNDO / REDO */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo}><Undo /></Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo}><Redo /></Button>
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

      {/* POSITION */}
      <section>
        <SectionLabel>Position</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Overlay position</span>
            <select
              value={styleState.boxPosition ?? ''}
              onChange={(e) => handlePositionChange('boxPosition', e.target.value)}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Default</option>
              {BOX_POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Divider />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Qualifying table</span>
            <select
              value={styleState.qualifyingTablePosition ?? ''}
              onChange={(e) => handlePositionChange('qualifyingTablePosition', e.target.value)}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Default</option>
              {CORNER_POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel>Overlay Components</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Leaderboard</span>
            <select
              value={styleState.overlayComponents?.leaderboard === false || styleState.overlayComponents?.leaderboard === 'off' ? 'off' : 'on'}
              onChange={(e) => handleOverlayComponentChange('leaderboard', e.target.value as NonNullable<OverlayComponentsConfig['leaderboard']>)}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {OVERLAY_COMPONENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* GLOBAL COLOURS */}
      <section>
        <SectionLabel>Global</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <ColourRow
            label="Accent"
            value={accent}
            onChange={(v) => handleColourChange({ accentColor: v })}
          />
          <Divider />
          <ColourRow
            label="Text"
            value={textColor}
            onChange={(v) => handleColourChange({ textColor: v })}
          />
        </div>
      </section>

      {/* BANNER */}
      {overlayType === 'banner' && (
        <section>
          <SectionLabel>Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Background" value={bannerBg} onChange={(v) => handleColourChange({ banner: { ...styling.banner, bgColor: v } })} />
            <Divider />
            <ColourRow label="Timer text" value={bannerTimerText} onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerTextColor: v } })} />
            <Divider />
            <ColourRow label="Timer background" value={bannerTimerBg} onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerBgColor: v } })} />
            <Divider />
            <ColourRow label="Personal best flash" value={bannerLapPurple} onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorPurple: v } })} />
            <Divider />
            <ColourRow label="Session best flash" value={bannerLapGreen} onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorGreen: v } })} />
            <Divider />
            <ColourRow label="Slower lap flash" value={bannerLapRed} onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorRed: v } })} />
          </div>
        </section>
      )}

      {/* GEOMETRIC BANNER */}
      {overlayType === 'geometric-banner' && (
        <section>
          <SectionLabel>Geometric Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Position counter" value={geoBannerPositionCounter} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, positionCounterColor: v } })} />
            <Divider />
            <ColourRow label="Last lap" value={geoBannerLastLap} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lastLapColor: v } })} />
            <Divider />
            <ColourRow label="Lap timer (neutral)" value={geoBannerNeutral} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapTimerNeutralColor: v } })} />
            <Divider />
            <ColourRow label="Previous lap" value={geoBannerPrevLap} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, previousLapColor: v } })} />
            <Divider />
            <ColourRow label="Lap counter" value={geoBannerLapCounter} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapCounterColor: v } })} />
            <Divider />
            <ColourRow label="Timer text" value={geoBannerTimerText} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, timerTextColor: v } })} />
            <Divider />
            <ColourRow label="Personal best flash" value={geoBannerLapPurple} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorPurple: v } })} />
            <Divider />
            <ColourRow label="Session best flash" value={geoBannerLapGreen} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorGreen: v } })} />
            <Divider />
            <ColourRow label="Slower lap flash" value={geoBannerLapRed} onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorRed: v } })} />
          </div>
        </section>
      )}

      {/* ESPORTS */}
      {overlayType === 'esports' && (
        <>
          <section>
            <SectionLabel>Top Bar</SectionLabel>
            <div className="rounded-md border border-border bg-accent px-3">
              <ColourRow label="Accent bar start" value={esportsAccentBar} onChange={(v) => handleColourChange({ esports: { ...styling.esports, accentBarColor: v } })} />
              <Divider />
              <ColourRow label="Accent bar end" value={esportsAccentBarEnd} onChange={(v) => handleColourChange({ esports: { ...styling.esports, accentBarColorEnd: v } })} />
              <Divider />
              <ColourRow label="Time panels" value={esportsTimePanels} onChange={(v) => handleColourChange({ esports: { ...styling.esports, timePanelsBgColor: v } })} />
              <Divider />
              <ColourRow label="Current time bar" value={esportsCurrentBar} onChange={(v) => handleColourChange({ esports: { ...styling.esports, currentBarBgColor: v } })} />
              <Divider />
              <ColourRow label="Label" value={esportsLabel} onChange={(v) => handleColourChange({ esports: { ...styling.esports, labelColor: v } })} />
              <Divider />
              <ColourRow label="Last lap icon" value={esportsLastLapIcon} onChange={(v) => handleColourChange({ esports: { ...styling.esports, lastLapIconColor: v } })} />
              <Divider />
              <ColourRow label="Session best icon" value={esportsSessionBestIcon} onChange={(v) => handleColourChange({ esports: { ...styling.esports, sessionBestIconColor: v } })} />
            </div>
          </section>
          <section>
            <SectionLabel>Leaderboard</SectionLabel>
            <div className="rounded-md border border-border bg-accent px-3">
              <ColourRow label="Row background" value={lbBg} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, bgColor: v } })} />
              <Divider />
              <ColourRow label="Our row background" value={lbOurRowBg} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, ourRowBgColor: v } })} />
              <Divider />
              <ColourRow label="Driver name" value={lbText} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, textColor: v } })} />
              <Divider />
              <ColourRow label="Position" value={lbPositionText} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, positionTextColor: v } })} />
              <Divider />
              <ColourRow label="Kart number" value={lbKartText} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, kartTextColor: v } })} />
              <Divider />
              <ColourRow label="Lap time" value={lbLapTimeText} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, lapTimeTextColor: v } })} />
              <Divider />
              <ColourRow label="Separator" value={lbSeparator} onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, separatorColor: v } })} />
            </div>
          </section>
        </>
      )}

      {/* MINIMAL */}
      {overlayType === 'minimal' && (
        <section>
          <SectionLabel>Minimal</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Background" value={minimalBg} onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, bgColor: v } })} />
            <Divider />
            <ColourRow label="Badge background" value={minimalBadgeBg} onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, badgeBgColor: v } })} />
            <Divider />
            <ColourRow label="Badge text" value={minimalBadgeText} onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, badgeTextColor: v } })} />
            <Divider />
            <ColourRow label="Stat label" value={minimalStatLabel} onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, statLabelColor: v } })} />
          </div>
        </section>
      )}

      {/* MODERN */}
      {overlayType === 'modern' && (
        <section>
          <SectionLabel>Modern</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow label="Background" value={modernBg} onChange={(v) => handleColourChange({ modern: { ...styling.modern, bgColor: v } })} />
            <Divider />
            <ColourRow label="Divider" value={modernDivider} onChange={(v) => handleColourChange({ modern: { ...styling.modern, dividerColor: v } })} />
            <Divider />
            <ColourRow label="Stat label" value={modernStatLabel} onChange={(v) => handleColourChange({ modern: { ...styling.modern, statLabelColor: v } })} />
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

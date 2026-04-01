import { ColourRow } from '@/components/style/ColourRow'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import type { BoxPosition, ComponentToggle, CornerPosition, MarginConfig, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'
import { isOverlayComponentEnabled } from '@racedash/core'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_OUT_DURATION_SECONDS,
  DEFAULT_FADE_POST_ROLL_SECONDS,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_SEGMENT_LABEL_ENABLED,
  DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS,
  DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS,
  DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS,
  DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS,
} from '@racedash/core'
import { ChevronRight, Redo, Undo } from 'lucide-react'
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

interface ComponentAccordionItemProps {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children?: React.ReactNode
}

function ComponentAccordionItem({ label, enabled, onToggle, children }: ComponentAccordionItemProps): React.ReactElement {
  return (
    <Collapsible>
      <div className="flex items-center justify-between py-1.5">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-foreground [&[data-state=open]>svg]:rotate-90">
          <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform" />
          {label}
        </CollapsibleTrigger>
        <Switch checked={enabled} onCheckedChange={onToggle} className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3" />
      </div>
      {children && (
        <CollapsibleContent>
          <div className="ml-4 border-l border-border pl-2">{children}</div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export interface StyleState {
  overlayType: OverlayType
  styling: OverlayStyling
  boxPosition?: BoxPosition
  qualifyingTablePosition?: CornerPosition
  overlayComponents?: OverlayComponentsConfig
  /** Per-segment style overrides, keyed by segment label. Merged on top of base `styling`. */
  segmentStyles?: Record<string, Partial<OverlayStyling>>
}

interface StyleTabProps {
  styleState: StyleState
  onStyleChange: (next: StyleState) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Segment labels from the project config, used to render segment tabs. */
  segmentLabels?: string[]
}

function Divider(): React.ReactElement {
  return <div className="border-t border-border" />
}

function StepperRow({
  label,
  value,
  onChange,
  step = 0.25,
  min = 0,
  suffix = 's',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-background"
        >
          −
        </button>
        <span className="w-10 text-center font-mono text-xs tabular-nums text-foreground">
          {value.toFixed(2)}{suffix}
        </span>
        <button
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-background"
        >
          +
        </button>
      </div>
    </div>
  )
}

function MarginEditor({
  value,
  onChange,
}: {
  value: MarginConfig | undefined
  onChange: (margin: MarginConfig) => void
}): React.ReactElement {
  const t = value?.top ?? 0
  const r = value?.right ?? 0
  const b = value?.bottom ?? 0
  const l = value?.left ?? 0
  const set = (key: keyof MarginConfig, v: number) => onChange({ ...value, [key]: Math.max(0, v) })
  const step = 1

  function MarginInput({ label, val, field }: { label: string; val: number; field: keyof MarginConfig }) {
    return (
      <div className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <button onClick={() => set(field, val - step)} className="text-[10px] text-muted-foreground hover:text-foreground">−</button>
        <span className="w-5 text-center font-mono text-[10px] text-foreground">{val}</span>
        <button onClick={() => set(field, val + step)} className="text-[10px] text-muted-foreground hover:text-foreground">+</button>
        <span className="text-[9px] text-muted-foreground">px</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <span className="text-xs text-muted-foreground">Margin</span>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-20 items-center justify-center rounded border border-border bg-background">
          <div className="relative flex h-8 w-12 items-center justify-center rounded border-2 border-primary/40 bg-primary/5">
            <span className="absolute -top-3 font-mono text-[8px] text-muted-foreground">{t}</span>
            <span className="absolute -bottom-3 font-mono text-[8px] text-muted-foreground">{b}</span>
            <span className="absolute -left-3.5 font-mono text-[8px] text-muted-foreground">{l}</span>
            <span className="absolute -right-3.5 font-mono text-[8px] text-muted-foreground">{r}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <MarginInput label="T" val={t} field="top" />
          <MarginInput label="B" val={b} field="bottom" />
          <MarginInput label="L" val={l} field="left" />
          <MarginInput label="R" val={r} field="right" />
        </div>
      </div>
    </div>
  )
}

export function StyleTab({
  styleState,
  onStyleChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  segmentLabels = [],
}: StyleTabProps): React.ReactElement {
  const [showOverlayPicker, setShowOverlayPicker] = useState(false)
  // null = editing base (all segments), string = editing a specific segment's overrides
  const [activeSegment, setActiveSegment] = useState<string | null>(null)
  const { overlayType } = styleState

  // Effective styling: base merged with segment overrides when a segment is selected
  const segmentOverrides = activeSegment ? styleState.segmentStyles?.[activeSegment] : undefined
  const styling: OverlayStyling = segmentOverrides ? { ...styleState.styling, ...segmentOverrides } : styleState.styling

  /** Applies a styling patch to the correct target: base styling or segment override. */
  const applyStylingPatch = useCallback(
    (state: StyleState, patch: OverlayStyling): StyleState => {
      if (!activeSegment) {
        return { ...state, styling: { ...state.styling, ...patch } }
      }
      return {
        ...state,
        segmentStyles: {
          ...state.segmentStyles,
          [activeSegment]: { ...state.segmentStyles?.[activeSegment], ...patch },
        },
      }
    },
    [activeSegment],
  )

  // Debounced colour change: waits 400ms after the last drag tick before committing
  // to history. Only one onStyleChange call fires per drag — NOT immediately.
  // Uses a latestRef to avoid stale-closure issues.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<{ styleState: StyleState; patch: OverlayStyling }>({ styleState, patch: {} })

  const handleColourChange = useCallback(
    (patch: OverlayStyling) => {
      latestRef.current = { styleState, patch }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const { styleState: s, patch: p } = latestRef.current
        onStyleChange(applyStylingPatch(s, p))
      }, 400)
    },
    [styleState, onStyleChange, applyStylingPatch],
  )

  const handleComponentToggle = useCallback(
    (key: keyof OverlayComponentsConfig, enabled: boolean) => {
      onStyleChange({
        ...styleState,
        overlayComponents: {
          ...styleState.overlayComponents,
          [key]: enabled ? 'on' : 'off',
        },
      })
    },
    [styleState, onStyleChange],
  )

  const handlePositionChange = useCallback(
    (key: 'boxPosition' | 'qualifyingTablePosition', value: string) => {
      onStyleChange({ ...styleState, [key]: value !== '' ? value : undefined })
    },
    [styleState, onStyleChange],
  )

  const handleFadeToggle = useCallback(
    (enabled: boolean) => {
      onStyleChange(applyStylingPatch(styleState, { fade: { ...styling.fade, enabled } }))
    },
    [styleState, styling, onStyleChange, applyStylingPatch],
  )

  const handleFadeSliderChange = useCallback(
    (key: 'durationSeconds' | 'fadeOutDurationSeconds' | 'preRollSeconds' | 'postRollSeconds', value: number) => {
      latestRef.current = {
        styleState,
        patch: { fade: { ...styling.fade, [key]: value } },
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const { styleState: s, patch: p } = latestRef.current
        onStyleChange(applyStylingPatch(s, p))
      }, 400)
    },
    [styleState, styling, onStyleChange, applyStylingPatch],
  )

  const handleSegmentLabelToggle = useCallback(
    (enabled: boolean) => {
      onStyleChange(applyStylingPatch(styleState, { segmentLabel: { ...styling.segmentLabel, enabled } }))
    },
    [styleState, styling, onStyleChange, applyStylingPatch],
  )

  const handleSegmentLabelSliderChange = useCallback(
    (key: 'fadeInDurationSeconds' | 'fadeOutDurationSeconds' | 'preRollSeconds' | 'postRollSeconds', value: number) => {
      latestRef.current = {
        styleState,
        patch: { segmentLabel: { ...styling.segmentLabel, [key]: value } },
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const { styleState: s, patch: p } = latestRef.current
        onStyleChange(applyStylingPatch(s, p))
      }, 400)
    },
    [styleState, styling, onStyleChange, applyStylingPatch],
  )

  // Fade
  const fadeEnabled = styling.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const fadeOutDuration = styling.fade?.fadeOutDurationSeconds ?? DEFAULT_FADE_OUT_DURATION_SECONDS
  const fadePreRoll = styling.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const fadePostRoll = styling.fade?.postRollSeconds ?? DEFAULT_FADE_POST_ROLL_SECONDS

  // Segment label
  const segmentLabelEnabled = styling.segmentLabel?.enabled ?? DEFAULT_SEGMENT_LABEL_ENABLED
  const segmentLabelFadeIn = styling.segmentLabel?.fadeInDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS
  const segmentLabelFadeOut = styling.segmentLabel?.fadeOutDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS
  const segmentLabelPreRoll = styling.segmentLabel?.preRollSeconds ?? DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS
  const segmentLabelPostRoll = styling.segmentLabel?.postRollSeconds ?? DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS

  // Banner
  const bannerAccent = styling.banner?.accentColor ?? '#3DD73D'
  const bannerText = styling.banner?.textColor ?? '#ffffff'
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
        <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo}>
          <Undo />
        </Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo}>
          <Redo />
        </Button>
      </div>

      {/* SEGMENT TABS */}
      {segmentLabels.length > 0 && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveSegment(null)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              activeSegment === null
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {segmentLabels.map((label) => (
            <button
              key={label}
              onClick={() => setActiveSegment(label)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                activeSegment === label
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* PRESET BUTTONS */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            window.racedash.loadStylePreset().then((preset) => {
              if (!preset) return
              onStyleChange({
                ...styleState,
                overlayType: preset.overlayType as OverlayType,
                styling: preset.styling,
                overlayComponents: preset.overlayComponents ?? styleState.overlayComponents,
              })
            })
          }}
        >
          Load Style Preset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => {
            window.racedash.saveStylePreset({
              name: OVERLAY_NAMES[overlayType],
              overlayType,
              styling,
              overlayComponents: styleState.overlayComponents,
            })
          }}
        >
          Save Style Preset
        </Button>
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

      {/* FADE */}
      <section>
        <SectionLabel>Overlay Fade</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <select
              value={fadeEnabled ? 'on' : 'off'}
              onChange={(e) => handleFadeToggle(e.target.value === 'on')}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          {fadeEnabled && (
            <>
              <Divider />
              <StepperRow label="Pre-roll" value={fadePreRoll} onChange={(v) => handleFadeSliderChange('preRollSeconds', v)} />
              <Divider />
              <StepperRow label="Fade in" value={fadeDuration} min={0.25} onChange={(v) => handleFadeSliderChange('durationSeconds', v)} />
              <Divider />
              <StepperRow label="Fade out" value={fadeOutDuration} min={0.25} onChange={(v) => handleFadeSliderChange('fadeOutDurationSeconds', v)} />
              <Divider />
              <StepperRow label="Post-roll" value={fadePostRoll} onChange={(v) => handleFadeSliderChange('postRollSeconds', v)} />
            </>
          )}
        </div>
      </section>

      {/* SEGMENT LABEL */}
      <section>
        <SectionLabel>Session Label</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Enabled</span>
            <select
              value={segmentLabelEnabled ? 'on' : 'off'}
              onChange={(e) => handleSegmentLabelToggle(e.target.value === 'on')}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          {segmentLabelEnabled && (
            <>
              <Divider />
              <StepperRow label="Pre-roll" value={segmentLabelPreRoll} onChange={(v) => handleSegmentLabelSliderChange('preRollSeconds', v)} />
              <Divider />
              <StepperRow label="Fade in" value={segmentLabelFadeIn} min={0.25} onChange={(v) => handleSegmentLabelSliderChange('fadeInDurationSeconds', v)} />
              <Divider />
              <StepperRow label="Fade out" value={segmentLabelFadeOut} min={0.25} onChange={(v) => handleSegmentLabelSliderChange('fadeOutDurationSeconds', v)} />
              <Divider />
              <StepperRow label="Post-roll" value={segmentLabelPostRoll} onChange={(v) => handleSegmentLabelSliderChange('postRollSeconds', v)} />
            </>
          )}
        </div>
      </section>

      {/* BANNER */}
      {overlayType === 'banner' && (
        <section>
          <SectionLabel>Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <ColourRow
              label="Accent"
              value={bannerAccent}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, accentColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Text"
              value={bannerText}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, textColor: v } })}
            />
            <Divider />
            <MarginEditor
              value={styling.banner?.margin}
              onChange={(margin) => handleColourChange({ banner: { ...styling.banner, margin } })}
            />
            <Divider />
            <ColourRow
              label="Background"
              value={bannerBg}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, bgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Timer text"
              value={bannerTimerText}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerTextColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Timer background"
              value={bannerTimerBg}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, timerBgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Personal best flash"
              value={bannerLapPurple}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorPurple: v } })}
            />
            <Divider />
            <ColourRow
              label="Session best flash"
              value={bannerLapGreen}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorGreen: v } })}
            />
            <Divider />
            <ColourRow
              label="Slower lap flash"
              value={bannerLapRed}
              onChange={(v) => handleColourChange({ banner: { ...styling.banner, lapColorRed: v } })}
            />
          </div>
        </section>
      )}

      {/* GEOMETRIC BANNER */}
      {overlayType === 'geometric-banner' && (
        <section>
          <SectionLabel>Geometric Banner</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <MarginEditor
              value={styling.geometricBanner?.margin}
              onChange={(margin) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, margin } })}
            />
            <Divider />
            <ColourRow
              label="Position counter"
              value={geoBannerPositionCounter}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, positionCounterColor: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Last lap"
              value={geoBannerLastLap}
              onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lastLapColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Lap timer (neutral)"
              value={geoBannerNeutral}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapTimerNeutralColor: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Previous lap"
              value={geoBannerPrevLap}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, previousLapColor: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Lap counter"
              value={geoBannerLapCounter}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapCounterColor: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Timer text"
              value={geoBannerTimerText}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, timerTextColor: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Personal best flash"
              value={geoBannerLapPurple}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorPurple: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Session best flash"
              value={geoBannerLapGreen}
              onChange={(v) =>
                handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorGreen: v } })
              }
            />
            <Divider />
            <ColourRow
              label="Slower lap flash"
              value={geoBannerLapRed}
              onChange={(v) => handleColourChange({ geometricBanner: { ...styling.geometricBanner, lapColorRed: v } })}
            />
          </div>
        </section>
      )}

      {/* ESPORTS */}
      {overlayType === 'esports' && (
        <>
          <section>
            <SectionLabel>Top Bar</SectionLabel>
            <div className="rounded-md border border-border bg-accent px-3">
              <MarginEditor
                value={styling.esports?.margin}
                onChange={(margin) => handleColourChange({ esports: { ...styling.esports, margin } })}
              />
              <Divider />
              <ColourRow
                label="Accent bar start"
                value={esportsAccentBar}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, accentBarColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Accent bar end"
                value={esportsAccentBarEnd}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, accentBarColorEnd: v } })}
              />
              <Divider />
              <ColourRow
                label="Time panels"
                value={esportsTimePanels}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, timePanelsBgColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Current time bar"
                value={esportsCurrentBar}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, currentBarBgColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Label"
                value={esportsLabel}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, labelColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Last lap icon"
                value={esportsLastLapIcon}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, lastLapIconColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Session best icon"
                value={esportsSessionBestIcon}
                onChange={(v) => handleColourChange({ esports: { ...styling.esports, sessionBestIconColor: v } })}
              />
            </div>
          </section>
          <section>
            <SectionLabel>Leaderboard</SectionLabel>
            <div className="rounded-md border border-border bg-accent px-3">
              <ColourRow
                label="Row background"
                value={lbBg}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, bgColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Our row background"
                value={lbOurRowBg}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, ourRowBgColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Driver name"
                value={lbText}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, textColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Position"
                value={lbPositionText}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, positionTextColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Kart number"
                value={lbKartText}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, kartTextColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Lap time"
                value={lbLapTimeText}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, lapTimeTextColor: v } })}
              />
              <Divider />
              <ColourRow
                label="Separator"
                value={lbSeparator}
                onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, separatorColor: v } })}
              />
            </div>
          </section>
        </>
      )}

      {/* MINIMAL */}
      {overlayType === 'minimal' && (
        <section>
          <SectionLabel>Minimal</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <MarginEditor
              value={styling.minimal?.margin}
              onChange={(margin) => handleColourChange({ minimal: { ...styling.minimal, margin } })}
            />
            <Divider />
            <ColourRow
              label="Background"
              value={minimalBg}
              onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, bgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Badge background"
              value={minimalBadgeBg}
              onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, badgeBgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Badge text"
              value={minimalBadgeText}
              onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, badgeTextColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Stat label"
              value={minimalStatLabel}
              onChange={(v) => handleColourChange({ minimal: { ...styling.minimal, statLabelColor: v } })}
            />
          </div>
        </section>
      )}

      {/* MODERN */}
      {overlayType === 'modern' && (
        <section>
          <SectionLabel>Modern</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            <MarginEditor
              value={styling.modern?.margin}
              onChange={(margin) => handleColourChange({ modern: { ...styling.modern, margin } })}
            />
            <Divider />
            <ColourRow
              label="Background"
              value={modernBg}
              onChange={(v) => handleColourChange({ modern: { ...styling.modern, bgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Divider"
              value={modernDivider}
              onChange={(v) => handleColourChange({ modern: { ...styling.modern, dividerColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Stat label"
              value={modernStatLabel}
              onChange={(v) => handleColourChange({ modern: { ...styling.modern, statLabelColor: v } })}
            />
          </div>
        </section>
      )}

      {/* COMPONENTS */}
      <section>
        <SectionLabel>Components</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          {/* Overlay position */}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">Overlay position</span>
            <select
              value={styleState.boxPosition ?? ''}
              onChange={(e) => handlePositionChange('boxPosition', e.target.value)}
              className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Default</option>
              {BOX_POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Divider />

          {/* Leaderboard */}
          <ComponentAccordionItem
            label="Leaderboard"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.leaderboard)}
            onToggle={(v) => handleComponentToggle('leaderboard', v)}
          >
            <ColourRow
              label="Row background"
              value={lbBg}
              onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, bgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Driver row"
              value={lbOurRowBg}
              onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, ourRowBgColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Driver name"
              value={lbText}
              onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, textColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Separator"
              value={lbSeparator}
              onChange={(v) => handleColourChange({ leaderboard: { ...styling.leaderboard, separatorColor: v } })}
            />
          </ComponentAccordionItem>
          <Divider />

          {/* Delta badge */}
          <ComponentAccordionItem
            label="Delta badge"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.deltaBadge)}
            onToggle={(v) => handleComponentToggle('deltaBadge', v)}
          >
            <ColourRow
              label="Faster colour"
              value={styling.deltaBadge?.fasterColor ?? '#00FF87'}
              onChange={(v) => handleColourChange({ deltaBadge: { ...styling.deltaBadge, fasterColor: v } })}
            />
            <Divider />
            <ColourRow
              label="Slower colour"
              value={styling.deltaBadge?.slowerColor ?? '#FF3B30'}
              onChange={(v) => handleColourChange({ deltaBadge: { ...styling.deltaBadge, slowerColor: v } })}
            />
          </ComponentAccordionItem>
          <Divider />

          {/* Position counter */}
          <ComponentAccordionItem
            label="Position counter"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.positionCounter)}
            onToggle={(v) => handleComponentToggle('positionCounter', v)}
          />
          <Divider />

          {/* Lap counter */}
          <ComponentAccordionItem
            label="Lap counter"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.lapCounter)}
            onToggle={(v) => handleComponentToggle('lapCounter', v)}
          />
          <Divider />

          {/* Lap timer */}
          <ComponentAccordionItem
            label="Lap timer"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.lapTimer)}
            onToggle={(v) => handleComponentToggle('lapTimer', v)}
          />
          <Divider />

          {/* Lap list */}
          <ComponentAccordionItem
            label="Lap list"
            enabled={isOverlayComponentEnabled(styleState.overlayComponents?.lapList)}
            onToggle={(v) => handleComponentToggle('lapList', v)}
          />
        </div>
      </section>

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

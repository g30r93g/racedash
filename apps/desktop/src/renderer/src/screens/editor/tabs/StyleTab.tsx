import { ColourRow } from '@/components/style/ColourRow'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { BoxPosition, ComponentToggle, CornerPosition, MarginConfig, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'
import { isOverlayComponentEnabled } from '@racedash/core'
import { ChevronRight, Redo, Undo } from 'lucide-react'
import React, { useCallback, useRef, useState } from 'react'
import { registry, globalComponents } from '@renderer/registry'
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
    <Collapsible open={enabled ? undefined : false}>
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

  // Registry-driven settings
  const entry = registry[overlayType]
  const getStylingSection = (path: string) =>
    (styling as Record<string, Record<string, unknown> | undefined>)[path]
  const getVal = (path: string, key: string, def: string | number): string | number => {
    return (getStylingSection(path)?.[key] as string | number) ?? def
  }
  const isEnabled = (path: string): boolean => {
    const val = getStylingSection(path)?.enabled
    return val !== false && val !== 0
  }
  /** Immediate commit — for steppers, toggles, dropdowns. */
  const setVal = (path: string, key: string, value: string | number | boolean) => {
    const s = getStylingSection(path)
    onStyleChange(applyStylingPatch(styleState, { [path]: { ...s, [key]: value } } as unknown as OverlayStyling))
  }
  /** Debounced commit — for colour pickers (continuous drag). */
  const setColourVal = (path: string, key: string, value: string) => {
    const s = getStylingSection(path)
    handleColourChange({ [path]: { ...s, [key]: value } } as unknown as OverlayStyling)
  }
  // Resolve margin from the first styleSettings path or first component path
  const marginPath = entry?.styleSettings?.[0]?.stylingPath ?? entry?.components?.[0]?.stylingPath ?? ''
  const marginSection = (styling as Record<string, Record<string, unknown> | undefined>)[marginPath]
  const marginValue = marginSection?.margin as MarginConfig | undefined

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

      {/* GLOBAL COMPONENTS (style-agnostic) */}
      {globalComponents.map((comp) => {
        const enabled = comp.toggleable ? isEnabled(comp.stylingPath) : true
        return (
          <section key={comp.key}>
            <SectionLabel>{comp.label}</SectionLabel>
            <div className="rounded-md border border-border bg-accent px-3">
              {comp.toggleable && (
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">Enabled</span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setVal(comp.stylingPath, 'enabled', v)}
                    className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                  />
                </div>
              )}
              {enabled && comp.settings.map((s, si) => (
                <React.Fragment key={s.key}>
                  {(si > 0 || comp.toggleable) && <Separator />}
                  {s.type === 'colour' && (
                    <ColourRow label={s.label} value={String(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setColourVal(comp.stylingPath, s.key, v)} />
                  )}
                  {s.type === 'stepper' && (
                    <StepperRow label={s.label} value={Number(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setVal(comp.stylingPath, s.key, v)} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </section>
        )
      })}

      {/* STYLE SETTINGS + MARGIN (data-driven) */}
      {entry && (
        <section>
          <SectionLabel>{OVERLAY_NAMES[overlayType]}</SectionLabel>
          <div className="rounded-md border border-border bg-accent px-3">
            {entry.styleSettings?.map((s, i) => (
              <React.Fragment key={s.key}>
                {i > 0 && <Separator />}
                {s.type === 'colour' && (
                  <ColourRow label={s.label} value={String(getVal(s.stylingPath, s.key, s.default))} onChange={(v) => setColourVal(s.stylingPath, s.key, v)} />
                )}
                {s.type === 'stepper' && (
                  <StepperRow label={s.label} value={Number(getVal(s.stylingPath, s.key, s.default))} onChange={(v) => setVal(s.stylingPath, s.key, v)} step={1} suffix="px" />
                )}
              </React.Fragment>
            ))}
            {(entry.styleSettings?.length ?? 0) > 0 && <Separator />}
            <MarginEditor
              value={marginValue}
              onChange={(margin) => {
                if (!marginPath) return
                handleColourChange({ [marginPath]: { ...marginSection, margin } } as unknown as OverlayStyling)
              }}
            />
          </div>
        </section>
      )}

      {/* COMPONENTS (data-driven from registry) */}
      {entry?.components && entry.components.length > 0 && (
        <section>
          <SectionLabel>Components</SectionLabel>
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
            {entry.components.map((comp, ci) => (
              <React.Fragment key={comp.key}>
                <Separator />
                {comp.toggleable ? (
                  <ComponentAccordionItem
                    label={comp.label}
                    enabled={isOverlayComponentEnabled(
                      (styleState.overlayComponents as Record<string, unknown> | undefined)?.[comp.key] as ComponentToggle | undefined,
                    )}
                    onToggle={(v) => handleComponentToggle(comp.key as keyof OverlayComponentsConfig, v)}
                  >
                    {comp.settings.map((s, si) => (
                      <React.Fragment key={s.key}>
                        {si > 0 && <Separator />}
                        {s.type === 'colour' && (
                          <ColourRow label={s.label} value={String(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setColourVal(comp.stylingPath, s.key, v)} />
                        )}
                        {s.type === 'dropdown' && s.options && (
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-xs text-muted-foreground">{s.label}</span>
                            <select value={String(getVal(comp.stylingPath, s.key, s.default))} onChange={(e) => setVal(comp.stylingPath, s.key, e.target.value)} className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                              {s.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                        )}
                        {s.type === 'stepper' && (
                          <StepperRow label={s.label} value={Number(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setVal(comp.stylingPath, s.key, v)} step={1} suffix="px" />
                        )}
                      </React.Fragment>
                    ))}
                  </ComponentAccordionItem>
                ) : (
                  <Collapsible>
                    <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-xs font-medium text-foreground [&[data-state=open]>svg]:rotate-90">
                      <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform" />
                      {comp.label}
                    </CollapsibleTrigger>
                    {comp.settings.length > 0 && (
                      <CollapsibleContent>
                        <div className="ml-4 border-l border-border pl-2">
                          {comp.settings.map((s, si) => (
                            <React.Fragment key={s.key}>
                              {si > 0 && <Separator />}
                              {s.type === 'colour' && (
                                <ColourRow label={s.label} value={String(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setColourVal(comp.stylingPath, s.key, v)} />
                              )}
                              {s.type === 'dropdown' && s.options && (
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-xs text-muted-foreground">{s.label}</span>
                                  <select value={String(getVal(comp.stylingPath, s.key, s.default))} onChange={(e) => setVal(comp.stylingPath, s.key, e.target.value)} className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                                    {s.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                  </select>
                                </div>
                              )}
                              {s.type === 'stepper' && (
                                <StepperRow label={s.label} value={Number(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setVal(comp.stylingPath, s.key, v)} step={1} suffix="px" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                )}
              </React.Fragment>
            ))}
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

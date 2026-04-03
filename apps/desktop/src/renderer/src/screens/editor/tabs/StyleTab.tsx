import { SectionLabel } from '@/components/shared/SectionLabel'
import { AddComponentModal } from '@/components/style/AddComponentModal'
import { ColourRow } from '@/components/style/ColourRow'
import { ComponentAccordionItem } from '@/components/style/ComponentAccordionItem'
import { MarginEditor } from '@/components/style/MarginEditor'
import { StepperRow } from '@/components/style/StepperRow'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { BoxPosition, ComponentToggle, CornerPosition, MarginConfig, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'
import { isOverlayComponentEnabled } from '@racedash/core'
import { BOX_POSITION_OPTIONS, globalComponents, registry } from '@renderer/registry'
import { ChevronRight, Plus, Redo, Undo } from 'lucide-react'
import React, { useCallback, useRef, useState } from 'react'
import type { OverlayType } from './OverlayPickerModal'
import { OverlayPickerModal } from './OverlayPickerModal'


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
  const [showAddComponent, setShowAddComponent] = useState(false)
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
  /** Returns true if the styling section exists (component has been added). */
  const isAdded = (path: string): boolean => {
    return getStylingSection(path) !== undefined
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
              name: entry?.name ?? overlayType,
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
            <span className="text-sm text-foreground">{entry?.name ?? overlayType}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowOverlayPicker(true)}>
            Change
          </Button>
        </div>
      </section>

      {/* STYLE SETTINGS + MARGIN (data-driven) */}
      {entry && (
        <section>
          <SectionLabel>{entry?.name ?? overlayType}</SectionLabel>
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
                {s.type === 'group' && s.children && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-xs text-muted-foreground [&[data-state=open]>svg]:rotate-90">
                      <ChevronRight className="h-3 w-3 transition-transform" />
                      {s.label}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 border-l border-border pl-2">
                        {s.children.map((child, ci) => (
                          <React.Fragment key={child.key}>
                            {ci > 0 && <Separator />}
                            {child.type === 'colour' && (
                              <ColourRow label={child.label} value={String(getVal(s.childStylingPath ?? s.stylingPath, child.key, child.default))} onChange={(v) => setColourVal(s.childStylingPath ?? s.stylingPath, child.key, v)} />
                            )}
                            {child.type === 'stepper' && (
                              <StepperRow label={child.label} value={Number(getVal(s.childStylingPath ?? s.stylingPath, child.key, child.default))} onChange={(v) => setVal(s.childStylingPath ?? s.stylingPath, child.key, v)} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </React.Fragment>
            ))}
            <Separator />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Position</span>
              <Select value={styleState.boxPosition ?? ''} onValueChange={(v) => handlePositionChange('boxPosition', v)}>
                <SelectTrigger className="h-6 w-auto gap-1 border-border bg-background px-2 text-xs">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default</SelectItem>
                  {BOX_POSITION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
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

      {/* STYLE COMPONENTS */}
      {(() => {
        const styleComponents = entry?.components ?? []

        const renderSettings = (comp: (typeof styleComponents)[number]) =>
          comp.settings.map((s, si) => (
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
                <StepperRow label={s.label} value={Number(getVal(comp.stylingPath, s.key, s.default))} onChange={(v) => setVal(comp.stylingPath, s.key, v)} />
              )}
            </React.Fragment>
          ))

        return (
          <>
            {/* Style-specific components */}
            {styleComponents.length > 0 && (
              <section>
                <SectionLabel>Style Components</SectionLabel>
                <div className="rounded-md border border-border bg-accent px-3">
                  {styleComponents.map((comp, ci) => {
                    const compEnabled = comp.toggleable
                      ? isOverlayComponentEnabled((styleState.overlayComponents as Record<string, unknown> | undefined)?.[comp.key] as ComponentToggle | undefined)
                      : true
                    return (
                      <React.Fragment key={comp.key}>
                        {ci > 0 && <Separator />}
                        {comp.toggleable ? (
                          <ComponentAccordionItem
                            label={comp.label}
                            enabled={compEnabled}
                            onToggle={(v) => handleComponentToggle(comp.key as keyof OverlayComponentsConfig, v)}
                          >
                            {renderSettings(comp)}
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
                                  {renderSettings(comp)}
                                </div>
                              </CollapsibleContent>
                            )}
                          </Collapsible>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Global components (addable/removable) */}
            {(() => {
              const activeGlobals = globalComponents.filter((g) => isAdded(g.stylingPath))
              const availableGlobals = globalComponents.filter((g) => !isAdded(g.stylingPath))
              return (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <SectionLabel>Components</SectionLabel>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setShowAddComponent(true)}>
                      <Plus />
                      Add
                    </Button>
                  </div>
                  {activeGlobals.length > 0 && (
                    <div className="rounded-md border border-border bg-accent px-3">
                      {activeGlobals.map((comp, ci) => (
                        <React.Fragment key={comp.key}>
                          {ci > 0 && <Separator />}
                          <ComponentAccordionItem
                            label={comp.label}
                            enabled={isEnabled(comp.stylingPath)}
                            onToggle={(v) => setVal(comp.stylingPath, 'enabled', v)}
                            onRemove={() => {
                              const patch = { [comp.stylingPath]: undefined } as unknown as OverlayStyling
                              onStyleChange(applyStylingPatch(styleState, patch))
                            }}
                          >
                            {renderSettings(comp)}
                          </ComponentAccordionItem>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  <AddComponentModal
                    open={showAddComponent}
                    onOpenChange={setShowAddComponent}
                    availableComponents={availableGlobals}
                    onAdd={(comp) => setVal(comp.stylingPath, 'enabled', true)}
                  />
                </section>
              )
            })()}
          </>
        )
      })()}

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

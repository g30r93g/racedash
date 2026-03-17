# Editor Tabs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full right-pane editor tab UI (Timing, Style, Export) and wire up the four remaining IPC handlers (`listDrivers`, `generateTimestamps`, `startRender`, `cancelRender`) so the editor is end-to-end functional.

**Architecture:** The right pane is split into three focused tab components (`TimingTab`, `StyleTab`, `ExportTab`) each receiving the `ProjectData` prop; `EditorTabsPane` owns only the tab shell and the cloud footer stub. IPC handlers in `src/main/ipc.ts` delegate directly to `@racedash/engine` functions and push render-progress events to the renderer window via `webContents.send`.

**Tech Stack:** Electron 33, React 18, shadcn/ui, Tailwind CSS v4, TypeScript, @racedash/engine

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/desktop/src/screens/editor/EditorTabsPane.tsx` | Tab shell (Tabs/TabsList/TabsContent) + disabled cloud footer |
| Create | `apps/desktop/src/screens/editor/tabs/TimingTab.tsx` | Driver picker, segment sub-tabs, lap table, position overrides |
| Create | `apps/desktop/src/screens/editor/tabs/StyleTab.tsx` | Overlay type, accent colour, style-specific colour rows |
| Create | `apps/desktop/src/screens/editor/tabs/OverlayPickerModal.tsx` | Full-screen overlay selection modal with 5 SVG preview cards |
| Create | `apps/desktop/src/screens/editor/tabs/ExportTab.tsx` | Source info, resolution/fps toggles, output path, render button, last-render status |
| Modify | `apps/desktop/src/main/ipc.ts` | Implement `listDrivers`, `generateTimestamps`, `startRender`, `cancelRender` |
| Create | `apps/desktop/src/main/ipc.test.ts` | Unit tests for the four IPC handlers |

---

## Chunk 1: EditorTabsPane Shell + Timing Tab

### Task 1: Create EditorTabsPane with tab shell

**Files:**
- Create: `apps/desktop/src/screens/editor/EditorTabsPane.tsx`

The file `apps/desktop/src/renderer/src/App.tsx` currently holds the right-pane tab shell inline. Sub-plans 1–4 will have extracted an `EditorTabsPane` stub somewhere; if the file does not yet exist, create it. The goal here is the full implementation.

`ProjectData` is defined in the types from prior sub-plans. It has: `name: string`, `projectPath: string`, `videoPaths: string[]`, `segments: Array<{ label?: string }>`, `selectedDriver: string`.

- [ ] **Step 1: Write `EditorTabsPane.tsx`**

```tsx
// apps/desktop/src/screens/editor/EditorTabsPane.tsx
import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { VideoInfo } from '../../../types/ipc'
import { TimingTab } from './tabs/TimingTab'
import { StyleTab } from './tabs/StyleTab'
import { ExportTab } from './tabs/ExportTab'

export interface ProjectData {
  name: string
  projectPath: string
  videoPaths: string[]
  segments: Array<{ label?: string }>
  selectedDriver: string
}

interface EditorTabsPaneProps {
  project: ProjectData
  videoInfo?: VideoInfo
}

export function EditorTabsPane({ project, videoInfo }: EditorTabsPaneProps): React.ReactElement {
  return (
    <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card">
      <Tabs defaultValue="timing" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="h-auto w-full shrink-0 justify-start rounded-none border-b border-border bg-transparent px-0">
          {(['timing', 'style', 'export'] as const).map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="-mb-px rounded-none border-b-2 border-transparent px-5 py-3 capitalize text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="timing" className="mt-0 flex-1 overflow-auto">
          <TimingTab project={project} videoInfo={videoInfo} />
        </TabsContent>

        <TabsContent value="style" className="mt-0 flex-1 overflow-auto">
          <StyleTab />
        </TabsContent>

        <TabsContent value="export" className="mt-0 flex-1 overflow-auto">
          <ExportTab project={project} videoInfo={videoInfo} />
        </TabsContent>
      </Tabs>

      {/* Racedash Cloud footer — deferred; non-interactive placeholder */}
      <div className="flex h-16 shrink-0 items-center justify-between border-t border-border bg-card px-4">
        <span className="text-xs text-muted-foreground">Racedash Cloud</span>
        <button
          disabled
          className="rounded px-3 py-1 text-xs text-muted-foreground opacity-40 cursor-not-allowed"
        >
          Sign in
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles (no test yet — no logic to test in this file)**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0 (or only errors about the not-yet-created tab files — those errors will disappear as subsequent tasks add the files).

---

### Task 2: Create helper types shared across tabs

The lap formatting and segment types are used in both TimingTab and ExportTab. Define them close to where they're used (inline in TimingTab for laps; ExportTab is self-contained).

No separate shared file is needed — the `ipc.ts` types file already exports `TimestampsResult`, `DriversResult`, `VideoInfo`, `RenderStartOpts`, etc. Import from `'../../../types/ipc'` (relative from `tabs/`).

---

### Task 3: Write TimingTab

**Files:**
- Create: `apps/desktop/src/screens/editor/tabs/TimingTab.tsx`

`TimingTab` is a single file. It holds three sections (DRIVER, TIMING DATA, POSITION OVERRIDES) plus the driver picker inline modal. No sub-files — the component is self-contained and the UI elements do not each need their own file.

- [ ] **Step 1: Write `TimingTab.tsx`**

```tsx
// apps/desktop/src/screens/editor/tabs/TimingTab.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { DriversResult, TimestampsResult, VideoInfo } from '../../../../types/ipc'
import type { ProjectData } from '../EditorTabsPane'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatLapTime(ms: number): string {
  // ms is a number in milliseconds (engine returns laps with numeric time)
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function formatPosition(pos: number): string {
  return `P${pos}`
}

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

interface TimingTabProps {
  project: ProjectData
  videoInfo?: VideoInfo
}

interface LapRow {
  lap: number
  timeMs: number
  position: number
}

interface Override {
  id: string
  timecode: string
  position: string
}

export function TimingTab({ project, videoInfo }: TimingTabProps): React.ReactElement {
  // ── Driver ────────────────────────────────────────────────────────────────
  const [selectedDriver, setSelectedDriver] = useState<string>(project.selectedDriver)
  const [showDriverPicker, setShowDriverPicker] = useState(false)
  const [driversResult, setDriversResult] = useState<DriversResult | null>(null)
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState<string | null>(null)

  const openDriverPicker = useCallback(async () => {
    setShowDriverPicker(true)
    setDriversLoading(true)
    setDriversError(null)
    try {
      const result = await window.racedash.listDrivers({ configPath: project.projectPath })
      setDriversResult(result)
    } catch (err) {
      setDriversError(err instanceof Error ? err.message : String(err))
    } finally {
      setDriversLoading(false)
    }
  }, [project.projectPath])

  // ── Timing data ────────────────────────────────────────────────────────────
  const segmentLabels = project.segments.map((s, i) => s.label ?? `Segment ${i + 1}`)
  const [activeSegment, setActiveSegment] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)
  const [timingLoading, setTimingLoading] = useState(false)
  const [timingError, setTimingError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTimingLoading(true)
    setTimingError(null)
    window.racedash
      .generateTimestamps({ configPath: project.projectPath, fps: videoInfo?.fps })
      .then((result) => {
        if (!cancelled) setTimestampsResult(result)
      })
      .catch((err) => {
        if (!cancelled) setTimingError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setTimingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSegment, project.projectPath, videoInfo?.fps])

  // Derive lap rows from the active segment's selectedDriver
  const lapRows = React.useMemo<LapRow[]>(() => {
    if (!timestampsResult) return []
    const seg = timestampsResult.segments[activeSegment]
    if (!seg?.selectedDriver) return []
    const laps = seg.selectedDriver.laps as Array<{ lap: number; timeMs: number; position: number }>
    return laps
  }, [timestampsResult, activeSegment])

  const bestLapTime = lapRows.length > 0 ? Math.min(...lapRows.map((l) => l.timeMs)) : null

  // ── Position overrides ─────────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<Override[]>([])
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [newTimecode, setNewTimecode] = useState('')
  const [newPosition, setNewPosition] = useState('')

  function addOverride() {
    if (!newTimecode.trim() || !newPosition.trim()) return
    setOverrides((prev) => [
      ...prev,
      { id: crypto.randomUUID(), timecode: newTimecode.trim(), position: newPosition.trim() },
    ])
    setNewTimecode('')
    setNewPosition('')
    setShowOverrideForm(false)
  }

  function removeOverride(id: string) {
    setOverrides((prev) => prev.filter((o) => o.id !== id))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4">

      {/* ── DRIVER ─────────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Driver</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <span className="text-sm text-foreground">{selectedDriver}</span>
          <button
            onClick={openDriverPicker}
            className="text-xs text-primary hover:underline"
          >
            Change
          </button>
        </div>
      </section>

      {/* ── DRIVER PICKER MODAL ────────────────────────────────────────────── */}
      {showDriverPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowDriverPicker(false)}
        >
          <div
            className="w-[360px] rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-foreground">Choose Driver</p>
            {driversLoading && (
              <p className="text-xs text-muted-foreground">Loading drivers…</p>
            )}
            {driversError && (
              <p className="text-xs text-destructive">{driversError}</p>
            )}
            {!driversLoading && !driversError && driversResult && (
              <ul className="flex flex-col gap-1">
                {driversResult.segments.flatMap((seg) =>
                  seg.drivers.map((d) => (
                    <li key={`${seg.config.source}-${d.name}`}>
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                        onClick={() => {
                          setSelectedDriver(d.name)
                          setShowDriverPicker(false)
                          // Follow-on: persist driver selection via IPC
                        }}
                      >
                        {d.kart ? `[${d.kart.padStart(3, ' ')}] ${d.name}` : d.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowDriverPicker(false)}
                className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TIMING DATA ────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Timing Data</SectionLabel>
          {/* Edit button — stub, no action yet */}
          <button className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
        </div>

        {/* Segment sub-tabs */}
        {segmentLabels.length > 1 && (
          <div className="mb-3 flex gap-1">
            {segmentLabels.map((label, i) => (
              <button
                key={i}
                onClick={() => setActiveSegment(i)}
                className={[
                  'rounded px-3 py-1 text-xs',
                  activeSegment === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {timingLoading && (
          <p className="text-xs text-muted-foreground">Loading timing data…</p>
        )}
        {timingError && (
          <p className="text-xs text-destructive">{timingError}</p>
        )}
        {!timingLoading && !timingError && lapRows.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1 text-left font-medium text-muted-foreground">LAP</th>
                <th className="py-1 text-left font-medium text-muted-foreground">TIME</th>
                <th className="py-1 text-left font-medium text-muted-foreground">POS</th>
              </tr>
            </thead>
            <tbody>
              {lapRows.map((row) => (
                <tr
                  key={row.lap}
                  className={row.timeMs === bestLapTime ? 'text-foreground' : 'text-muted-foreground'}
                >
                  <td className="py-1">{row.lap}</td>
                  <td className="py-1">{formatLapTime(row.timeMs)}</td>
                  <td className="py-1">{formatPosition(row.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!timingLoading && !timingError && lapRows.length === 0 && !timestampsResult && (
          <p className="text-xs text-muted-foreground">No timing data available.</p>
        )}
      </section>

      {/* ── POSITION OVERRIDES ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Position Overrides</SectionLabel>
          <button
            onClick={() => setShowOverrideForm((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            + Add
          </button>
        </div>

        {showOverrideForm && (
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={newTimecode}
              onChange={(e) => setNewTimecode(e.target.value)}
              placeholder="0:08.200"
              className="w-24 rounded border border-border bg-accent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              placeholder="P3"
              className="w-16 rounded border border-border bg-accent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addOverride}
              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              Add
            </button>
            <button
              onClick={() => setShowOverrideForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {overrides.length === 0 && (
          <p className="text-xs text-muted-foreground">No overrides added.</p>
        )}

        <ul className="flex flex-col gap-1">
          {overrides.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-xs text-foreground">
              {/* clock icon */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0 text-muted-foreground"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="w-20">{o.timecode}</span>
              {/* arrow icon */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0 text-muted-foreground"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
              <span className="w-10 font-medium">{o.position}</span>
              <button
                onClick={() => removeOverride(o.id)}
                className="ml-auto text-muted-foreground hover:text-destructive"
                aria-label="Remove override"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0 (or only errors from not-yet-created StyleTab / ExportTab / OverlayPickerModal).

- [ ] **Step 3: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/screens/editor/EditorTabsPane.tsx \
        apps/desktop/src/screens/editor/tabs/TimingTab.tsx
git commit -m "feat(desktop): add EditorTabsPane shell and TimingTab"
```

---

> Dispatch plan-document-reviewer for Chunk 1 before proceeding.

---

## Chunk 2: Style Tab + Overlay Picker Modal

### Task 4: Write OverlayPickerModal

**Files:**
- Create: `apps/desktop/src/screens/editor/tabs/OverlayPickerModal.tsx`

The modal is its own file because it contains significant SVG preview markup and the overlay card grid. Keeping it separate from `StyleTab` keeps `StyleTab` readable.

- [ ] **Step 1: Write `OverlayPickerModal.tsx`**

```tsx
// apps/desktop/src/screens/editor/tabs/OverlayPickerModal.tsx
import React, { useState } from 'react'

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
        {/* video placeholder lines */}
        <rect x="8" y="8" width="144" height="56" rx="2" fill="#2a2a2a" />
        {/* bottom bar */}
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
        {/* angled bar */}
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
        {/* top bar */}
        <rect x="0" y="0" width="160" height="16" fill="#111" />
        <rect x="6" y="4" width="16" height="8" rx="1" fill="#3b82f6" />
        <rect x="26" y="6" width="40" height="4" rx="1" fill="#555" />
        {/* leaderboard */}
        <rect x="110" y="20" width="44" height="62" rx="2" fill="#111" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="114" y={24 + i * 14} width="36" height="10" rx="1" fill={i === 0 ? '#3b82f6' : '#222'} />
        ))}
        {/* video area */}
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
        {/* corner labels */}
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
        {/* frosted glass card */}
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
  current: OverlayType
  onClose: () => void
  onApply: (overlay: OverlayType) => void
}

export function OverlayPickerModal({
  current,
  onClose,
  onApply,
}: OverlayPickerModalProps): React.ReactElement {
  const [selected, setSelected] = useState<OverlayType>(current)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-[740px] rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-foreground">Choose Overlay Style</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Select how your timing data is displayed on the video
        </p>

        {/* 3-column top row, 2-column bottom row */}
        <div className="mb-3 grid grid-cols-3 gap-3">
          {OVERLAYS.slice(0, 3).map((o) => (
            <OverlayCard
              key={o.id}
              overlay={o}
              isSelected={selected === o.id}
              onSelect={() => setSelected(o.id)}
            />
          ))}
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {OVERLAYS.slice(3).map((o) => (
            <OverlayCard
              key={o.id}
              overlay={o}
              isSelected={selected === o.id}
              onSelect={() => setSelected(o.id)}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(selected)}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Apply Style
          </button>
        </div>
      </div>
    </div>
  )
}

interface OverlayCardProps {
  overlay: (typeof OVERLAYS)[number]
  isSelected: boolean
  onSelect: () => void
}

function OverlayCard({ overlay, isSelected, onSelect }: OverlayCardProps): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className={[
        'relative flex flex-col rounded-lg border-2 bg-accent p-0 text-left overflow-hidden transition-colors',
        isSelected ? 'border-primary' : 'border-transparent hover:border-border',
      ].join(' ')}
    >
      {/* preview area */}
      <div className="h-[90px] w-full overflow-hidden bg-[#111]">
        {overlay.preview}
      </div>
      {/* card footer */}
      <div className="p-2">
        <p className="text-xs font-medium text-foreground">{overlay.name}</p>
        <p className="text-[10px] text-muted-foreground">{overlay.description}</p>
      </div>
      {/* selected checkmark badge */}
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
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0 (or only errors from not-yet-created StyleTab / ExportTab).

---

### Task 5: Write StyleTab

**Files:**
- Create: `apps/desktop/src/screens/editor/tabs/StyleTab.tsx`

- [ ] **Step 1: Write `StyleTab.tsx`**

```tsx
// apps/desktop/src/screens/editor/tabs/StyleTab.tsx
import React, { useRef, useState } from 'react'
import type { OverlayType } from './OverlayPickerModal'
import { OverlayPickerModal } from './OverlayPickerModal'

// ── helpers ──────────────────────────────────────────────────────────────────

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

// ── colour row ─────────────────────────────────────────────────────────────────

interface ColourRowProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  function handleSwatchClick() {
    inputRef.current?.click()
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value
    setDraft(hex)
    onChange(hex)
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  function handleHexBlur() {
    if (!isValidHex(draft)) setDraft(value) // revert on invalid
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {/* hidden native colour picker */}
        <input
          ref={inputRef}
          type="color"
          value={isValidHex(value) ? value : '#000000'}
          onChange={handleNativeChange}
          className="sr-only"
          tabIndex={-1}
        />
        {/* colour swatch */}
        <button
          onClick={handleSwatchClick}
          className="h-5 w-5 rounded border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
          aria-label={`Pick colour for ${label}`}
        />
        {/* hex input */}
        <input
          type="text"
          value={draft}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          maxLength={7}
          className="w-20 rounded border border-border bg-accent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

// ── overlay name map ───────────────────────────────────────────────────────────

const OVERLAY_NAMES: Record<OverlayType, string> = {
  banner: 'Banner',
  'geometric-banner': 'Geometric Banner',
  esports: 'Esports',
  minimal: 'Minimal',
  modern: 'Modern',
}

// ── component ──────────────────────────────────────────────────────────────────

export function StyleTab(): React.ReactElement {
  const [overlayType, setOverlayType] = useState<OverlayType>('banner')
  const [showOverlayPicker, setShowOverlayPicker] = useState(false)

  // Accent colour
  const [accentColour, setAccentColour] = useState('#3b82f6')

  // Banner colours
  const [bannerTimerText, setBannerTimerText] = useState('#ffffff')
  const [bannerTimerBg, setBannerTimerBg] = useState('#111111')
  const [bannerBannerBg, setBannerBannerBg] = useState('#1c1c1c')

  // Esports colours
  const [esportsOurRow, setEsportsOurRow] = useState('#3b82f6')
  const [esportsText, setEsportsText] = useState('#ffffff')

  return (
    <div className="flex flex-col gap-6 p-4">

      {/* ── OVERLAY TYPE ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Overlay Type</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <div className="flex items-center gap-2">
            {/* small coloured bar representing current overlay */}
            <div className="h-4 w-6 rounded-sm bg-primary opacity-80" />
            <span className="text-sm text-foreground">{OVERLAY_NAMES[overlayType]}</span>
          </div>
          <button
            onClick={() => setShowOverlayPicker(true)}
            className="text-xs text-primary hover:underline"
          >
            Change
          </button>
        </div>
      </section>

      {/* ── ACCENT COLOUR ────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Accent Colour</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <ColourRow label="Accent" value={accentColour} onChange={setAccentColour} />
        </div>
      </section>

      {/* ── STYLE-SPECIFIC SECTIONS ──────────────────────────────────────── */}
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

      {/* ── OVERLAY PICKER MODAL ─────────────────────────────────────────── */}
      {showOverlayPicker && (
        <OverlayPickerModal
          current={overlayType}
          onClose={() => setShowOverlayPicker(false)}
          onApply={(overlay) => {
            setOverlayType(overlay)
            setShowOverlayPicker(false)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0 (or only errors from not-yet-created ExportTab).

- [ ] **Step 3: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/screens/editor/tabs/OverlayPickerModal.tsx \
        apps/desktop/src/screens/editor/tabs/StyleTab.tsx
git commit -m "feat(desktop): add StyleTab and OverlayPickerModal"
```

---

> Dispatch plan-document-reviewer for Chunk 2 before proceeding.

---

## Chunk 3: Export Tab + IPC Handlers + Tests

### Task 6: Write ExportTab

**Files:**
- Create: `apps/desktop/src/screens/editor/tabs/ExportTab.tsx`

`ExportTab` manages local state for resolution, frame rate, output path, render mode and render status. It wires up all three render push events in a `useEffect` with cleanup.

- [ ] **Step 1: Write `ExportTab.tsx`**

```tsx
// apps/desktop/src/screens/editor/tabs/ExportTab.tsx
import React, { useEffect, useRef, useState } from 'react'
import path from 'node:path'
import type {
  OutputFrameRate,
  OutputResolution,
  RenderCompleteResult,
  RenderMode,
  VideoInfo,
} from '../../../../types/ipc'
import type { ProjectData } from '../EditorTabsPane'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatFps(fps: number): string {
  return Number.isInteger(fps) ? `${fps} fps` : `${fps.toFixed(2)} fps`
}

function formatResolution(w: number, h: number): string {
  return `${w} × ${h}`
}

function formatTime(date: Date): string {
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return isToday ? `Today, ${timeStr}` : date.toLocaleDateString()
}

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </p>
  )
}

// ── toggle button group ────────────────────────────────────────────────────────

interface ToggleGroupProps<T extends string> {
  options: Array<{ value: T; label: string; disabled?: boolean }>
  value: T
  onChange: (v: T) => void
}

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: ToggleGroupProps<T>): React.ReactElement {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={[
            'rounded px-3 py-1 text-xs transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-muted-foreground hover:text-foreground',
            o.disabled ? 'cursor-not-allowed opacity-40' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── read-only info row ────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}

// ── component ──────────────────────────────────────────────────────────────────

interface ExportTabProps {
  project: ProjectData
  videoInfo?: VideoInfo
}

interface LastRender {
  status: 'completed' | 'error'
  outputPath: string
  timestamp: Date
}

export function ExportTab({ project, videoInfo }: ExportTabProps): React.ReactElement {
  // Output path defaults to same directory as project.json
  const defaultOutputPath = path.join(path.dirname(project.projectPath), 'output.mp4')
  const [outputPath, setOutputPath] = useState(defaultOutputPath)

  const [outputResolution, setOutputResolution] = useState<OutputResolution>('source')
  const [outputFrameRate, setOutputFrameRate] = useState<OutputFrameRate>('source')
  const [renderMode, setRenderMode] = useState<RenderMode>('overlay+footage')

  const [rendering, setRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState('')
  const [renderProgress, setRenderProgress] = useState(0)
  const [lastRender, setLastRender] = useState<LastRender | null>(null)

  // Clean up render event listeners on unmount
  const cleanupRef = useRef<Array<() => void>>([])
  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [])

  async function handleBrowse() {
    const dir = await window.racedash.openDirectory({ title: 'Choose output folder' })
    if (dir) {
      setOutputPath(path.join(dir, 'output.mp4'))
    }
  }

  async function handleRender() {
    setRendering(true)
    setRenderPhase('Starting…')
    setRenderProgress(0)

    // Clean up any previous listeners
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onRenderProgress((event) => {
        setRenderPhase(event.phase)
        setRenderProgress(event.progress)
      }),
    )

    cleanupRef.current.push(
      window.racedash.onRenderComplete((result: RenderCompleteResult) => {
        setRendering(false)
        setLastRender({ status: 'completed', outputPath: result.outputPath, timestamp: new Date() })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )

    cleanupRef.current.push(
      window.racedash.onRenderError((err) => {
        setRendering(false)
        setLastRender({ status: 'error', outputPath: outputPath, timestamp: new Date() })
        console.error('Render error:', err.message)
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )

    try {
      await window.racedash.startRender({
        configPath: project.projectPath,
        videoPaths: project.videoPaths,
        outputPath,
        style: 'banner', // follow-on: derive from StyleTab state (lifted to parent)
        outputResolution,
        outputFrameRate,
        renderMode,
      })
    } catch (err) {
      setRendering(false)
      setLastRender({ status: 'error', outputPath, timestamp: new Date() })
      console.error('startRender threw:', err)
    }
  }

  async function handleCancel() {
    await window.racedash.cancelRender()
  }

  // Resolution options
  const resolutionOptions: Array<{ value: OutputResolution; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '2160p', label: '4K ⚡', disabled: true },
  ]

  // Frame rate options
  const frameRateOptions: Array<{ value: OutputFrameRate; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
    { value: '120', label: '120 fps ⚡', disabled: true },
  ]

  // Render mode options
  const renderModeOptions: Array<{ value: RenderMode; label: string }> = [
    { value: 'overlay+footage', label: 'Overlay + Footage' },
    { value: 'overlay-only', label: 'Overlay Only' },
  ]

  return (
    <div className="flex flex-col gap-6 p-4">

      {/* ── SOURCE VIDEO ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Source Video</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <InfoRow
            label="Resolution"
            value={
              videoInfo
                ? formatResolution(videoInfo.width, videoInfo.height)
                : '—'
            }
          />
          <div className="border-t border-border" />
          <InfoRow
            label="Frame rate"
            value={videoInfo ? formatFps(videoInfo.fps) : '—'}
          />
        </div>
      </section>

      {/* ── OUTPUT RESOLUTION ────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Output Resolution</SectionLabel>
        <ToggleGroup
          options={resolutionOptions}
          value={outputResolution}
          onChange={setOutputResolution}
        />
      </section>

      {/* ── OUTPUT FRAME RATE ────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <ToggleGroup
          options={frameRateOptions}
          value={outputFrameRate}
          onChange={setOutputFrameRate}
        />
      </section>

      {/* ── OUTPUT PATH ──────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Output Path</SectionLabel>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-accent px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleBrowse}
            className="shrink-0 rounded border border-border bg-accent px-3 py-1.5 text-xs text-foreground hover:bg-background"
          >
            Browse
          </button>
        </div>
      </section>

      {/* ── RENDER MODE ──────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Render Mode</SectionLabel>
        <ToggleGroup
          options={renderModeOptions}
          value={renderMode}
          onChange={setRenderMode}
        />
      </section>

      {/* ── RENDER BUTTON ────────────────────────────────────────────────── */}
      <section>
        {!rendering ? (
          <button
            onClick={handleRender}
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {/* render icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Render
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{renderPhase}</span>
              <span>{Math.round(renderProgress * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(renderProgress * 100)}%` }}
              />
            </div>
            <button
              onClick={handleCancel}
              className="w-full rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* ── LAST RENDER ──────────────────────────────────────────────────── */}
      {lastRender && (
        <section>
          <SectionLabel>Last Render</SectionLabel>
          <div className="flex items-center gap-3 rounded-md border border-border bg-accent px-3 py-2">
            <div
              className={[
                'h-2 w-2 shrink-0 rounded-full',
                lastRender.status === 'completed' ? 'bg-green-500' : 'bg-destructive',
              ].join(' ')}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-foreground capitalize">
                {lastRender.status === 'completed' ? 'Completed' : 'Failed'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatTime(lastRender.timestamp)}
              </span>
            </div>
            {lastRender.status === 'completed' && (
              <button
                onClick={() => window.racedash.revealInFinder(lastRender.outputPath)}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                Show in Finder
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/screens/editor/tabs/ExportTab.tsx
git commit -m "feat(desktop): add ExportTab"
```

---

### Task 7: Implement IPC handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`

The four remaining stubs are `listDrivers`, `generateTimestamps`, `startRender`, and `cancelRender`. The engine's `renderSession` is the correct function to call for `startRender` (not a function called `startRender` — there is no such export from the engine). The engine render function takes `RenderOptions`, which includes a `rendererEntry` field pointing to the Remotion renderer entry file. In the desktop app the renderer lives at `apps/renderer/src/index.ts` relative to the monorepo root; use `path.resolve` relative to `__dirname` or provide a config mechanism.

Important: `renderSession` is async and long-running. `ipcMain.handle` must not block the main process beyond the IPC call itself. Render progress is pushed via `webContents.send` using `BrowserWindow.getAllWindows()[0]` (single-window app). Keep a module-level `AbortController`-equivalent — the engine does not expose a cancel token, so implement a flag-based approach: store the in-progress promise and send a cancel signal by rejecting via a stored reference. Since the engine has no built-in cancel API, the `cancelRender` handler should set a `cancelled` flag; the IPC handler checks after the render resolves/rejects and if cancelled, suppresses the complete event.

The `rendererEntry` path for the desktop app: the Remotion renderer is provided by a separate `apps/renderer` package in the monorepo. Look at the CLI for the pattern. The desktop app needs to know the built renderer entry path at run time. For now, accept it as an environment variable `RACEDASH_RENDERER_ENTRY` or derive it from the app's `resourcesPath`. **Document this as a follow-on** in a code comment: "TODO: resolve renderer entry path from app resources or env var; hardcoded path is a placeholder."

- [ ] **Step 1: Check how the CLI resolves rendererEntry to understand the pattern**

Read `/Users/g30r93g/Projects/racedash/.worktrees/desktop-app/apps/cli/src` (or check where `rendererEntry` is assembled in the CLI) to ensure you don't diverge from the established pattern.

Look at this file:

```bash
# In your shell / agentic executor:
ls /Users/g30r93g/Projects/racedash/.worktrees/desktop-app/apps/
```

Then read the CLI render command to find how it resolves `rendererEntry`. Use the same relative path logic for the desktop IPC handler.

- [ ] **Step 2: Write the updated `ipc.ts`**

Replace the entire file contents:

```ts
// apps/desktop/src/main/ipc.ts
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { listDrivers, generateTimestamps, renderSession } from '@racedash/engine'
import type { RenderOptions } from '@racedash/engine'
import type { RenderStartOpts } from '../types/ipc'

// ── Cancel state ─────────────────────────────────────────────────────────────

let renderCancelled = false

// ── Renderer entry resolution ─────────────────────────────────────────────────
// TODO: resolve renderer entry path from app resources in production builds.
// In development, the renderer package is a sibling in the monorepo.
// In production, the pre-built renderer JS should be bundled into app resources.
function resolveRendererEntry(): string {
  if (process.env['RACEDASH_RENDERER_ENTRY']) {
    return process.env['RACEDASH_RENDERER_ENTRY']
  }
  if (app.isPackaged) {
    // Production: expect the renderer entry to be in resources next to the app
    return path.join(process.resourcesPath, 'renderer', 'index.js')
  }
  // Development: resolve relative to the monorepo root
  return path.resolve(__dirname, '../../../../apps/renderer/src/index.ts')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerIpcHandlers(): void {

  // ── System ───────────────────────────────────────────────────────────────

  ipcMain.handle('racedash:checkFfmpeg', async () => {
    // Implemented in a prior sub-plan — stub retained here for completeness
    throw new Error('IPC handler not implemented: checkFfmpeg')
  })

  // ── File dialogs ─────────────────────────────────────────────────────────

  ipcMain.handle('racedash:openFile', async (_event, opts) => {
    const result = await dialog.showOpenDialog({
      title: opts?.title,
      defaultPath: opts?.defaultPath,
      filters: opts?.filters,
      properties: ['openFile'],
    })
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('racedash:openFiles', async (_event, opts) => {
    const result = await dialog.showOpenDialog({
      title: opts?.title,
      defaultPath: opts?.defaultPath,
      filters: opts?.filters,
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled ? undefined : result.filePaths
  })

  ipcMain.handle('racedash:openDirectory', async (_event, opts) => {
    const result = await dialog.showOpenDialog({
      title: opts?.title,
      defaultPath: opts?.defaultPath,
      properties: ['openDirectory'],
    })
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('racedash:revealInFinder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // ── Engine — Timing ───────────────────────────────────────────────────────

  ipcMain.handle('racedash:listDrivers', async (_event, opts: { configPath: string; driverQuery?: string }) => {
    return listDrivers({ configPath: opts.configPath, driverQuery: opts.driverQuery })
  })

  ipcMain.handle('racedash:generateTimestamps', async (_event, opts: { configPath: string; fps?: number }) => {
    return generateTimestamps({ configPath: opts.configPath, fps: opts.fps })
  })

  // ── Engine — Video info ───────────────────────────────────────────────────

  ipcMain.handle('racedash:getVideoInfo', async () => {
    // Implemented in a prior sub-plan — stub retained here for completeness
    throw new Error('IPC handler not implemented: getVideoInfo')
  })

  // ── Engine — Render ───────────────────────────────────────────────────────

  ipcMain.handle('racedash:startRender', async (_event, opts: RenderStartOpts) => {
    renderCancelled = false

    const win = getFocusedWindow()

    // Resolve output dimensions from the resolution preset
    let outputResolution: { width: number; height: number } | undefined
    if (opts.outputResolution === '1080p') outputResolution = { width: 1920, height: 1080 }
    else if (opts.outputResolution === '1440p') outputResolution = { width: 2560, height: 1440 }
    else if (opts.outputResolution === '2160p') outputResolution = { width: 3840, height: 2160 }
    // 'source' → undefined (engine uses source resolution)

    const renderOpts: RenderOptions = {
      configPath: opts.configPath,
      videoPaths: opts.videoPaths,
      outputPath: opts.outputPath,
      rendererEntry: resolveRendererEntry(),
      style: opts.style,
      outputResolution,
      onlyRenderOverlay: opts.renderMode === 'overlay-only',
    }

    try {
      const result = await renderSession(
        renderOpts,
        (progress) => {
          if (renderCancelled) return
          win?.webContents.send('racedash:render-progress', progress)
        },
      )

      if (!renderCancelled) {
        win?.webContents.send('racedash:render-complete', result)
      }
    } catch (err) {
      if (!renderCancelled) {
        win?.webContents.send('racedash:render-error', {
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  })

  ipcMain.handle('racedash:cancelRender', async () => {
    renderCancelled = true
    // The engine has no built-in cancel token; setting the flag suppresses
    // further progress events and the complete/error push to the renderer.
    // Follow-on: thread a real AbortSignal through renderSession when the
    // engine supports it.
  })
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/main/ipc.ts
git commit -m "feat(desktop): implement listDrivers, generateTimestamps, startRender, cancelRender IPC handlers"
```

---

### Task 8: Write IPC unit tests

**Files:**
- Create: `apps/desktop/src/main/ipc.test.ts`

The test file mocks `@racedash/engine` and `electron`. It tests the four new handlers. Tests use Vitest (already in `devDependencies` of `@racedash/desktop`).

Note: because the `registerIpcHandlers` function calls `ipcMain.handle` at module level (when called), we must mock Electron before importing. We capture the handler callbacks by intercepting `ipcMain.handle`.

- [ ] **Step 1: Create a `vitest.config.ts` for the desktop app** (needed because no config file exists yet)

```ts
// apps/desktop/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Write the test file**

```ts
// apps/desktop/src/main/ipc.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ── Mock electron ─────────────────────────────────────────────────────────────

const registeredHandlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      registeredHandlers[channel] = handler
    }),
  },
  app: {
    isPackaged: false,
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => mockBrowserWindow),
    getAllWindows: vi.fn(() => [mockBrowserWindow]),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
}))

const mockWebContents = { send: vi.fn() }
const mockBrowserWindow = { webContents: mockWebContents }

// ── Mock @racedash/engine ─────────────────────────────────────────────────────

const mockListDrivers = vi.fn()
const mockGenerateTimestamps = vi.fn()
const mockRenderSession = vi.fn()

vi.mock('@racedash/engine', () => ({
  listDrivers: mockListDrivers,
  generateTimestamps: mockGenerateTimestamps,
  renderSession: mockRenderSession,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-import to re-register handlers (vi.resetModules ensures a fresh module)
    vi.resetModules()

    // Re-apply mocks after resetModules
    vi.mock('electron', () => ({
      ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
          registeredHandlers[channel] = handler
        }),
      },
      app: { isPackaged: false },
      BrowserWindow: {
        getFocusedWindow: vi.fn(() => mockBrowserWindow),
        getAllWindows: vi.fn(() => [mockBrowserWindow]),
      },
      dialog: { showOpenDialog: vi.fn() },
      shell: { showItemInFolder: vi.fn() },
    }))

    vi.mock('@racedash/engine', () => ({
      listDrivers: mockListDrivers,
      generateTimestamps: mockGenerateTimestamps,
      renderSession: mockRenderSession,
    }))

    const { registerIpcHandlers } = await import('./ipc')
    registerIpcHandlers()
  })

  // ── listDrivers ──────────────────────────────────────────────────────────

  describe('racedash:listDrivers', () => {
    it('calls engine listDrivers with configPath', async () => {
      const fakeResult = { segments: [], driverListsIdentical: true }
      mockListDrivers.mockResolvedValue(fakeResult)

      const handler = registeredHandlers['racedash:listDrivers']
      const result = await handler(null, { configPath: '/path/to/project.json' })

      expect(mockListDrivers).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        driverQuery: undefined,
      })
      expect(result).toBe(fakeResult)
    })

    it('passes driverQuery through to engine', async () => {
      mockListDrivers.mockResolvedValue({ segments: [], driverListsIdentical: true })

      const handler = registeredHandlers['racedash:listDrivers']
      await handler(null, { configPath: '/path/to/project.json', driverQuery: 'Gorzynski' })

      expect(mockListDrivers).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        driverQuery: 'Gorzynski',
      })
    })

    it('propagates engine errors', async () => {
      mockListDrivers.mockRejectedValue(new Error('Network error'))

      const handler = registeredHandlers['racedash:listDrivers']
      await expect(handler(null, { configPath: '/path/to/project.json' })).rejects.toThrow('Network error')
    })
  })

  // ── generateTimestamps ───────────────────────────────────────────────────

  describe('racedash:generateTimestamps', () => {
    it('calls engine generateTimestamps with configPath and fps', async () => {
      const fakeResult = { chapters: '', segments: [], offsets: [] }
      mockGenerateTimestamps.mockResolvedValue(fakeResult)

      const handler = registeredHandlers['racedash:generateTimestamps']
      const result = await handler(null, { configPath: '/path/to/project.json', fps: 59.94 })

      expect(mockGenerateTimestamps).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        fps: 59.94,
      })
      expect(result).toBe(fakeResult)
    })

    it('calls engine generateTimestamps without fps when not provided', async () => {
      mockGenerateTimestamps.mockResolvedValue({ chapters: '', segments: [], offsets: [] })

      const handler = registeredHandlers['racedash:generateTimestamps']
      await handler(null, { configPath: '/path/to/project.json' })

      expect(mockGenerateTimestamps).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        fps: undefined,
      })
    })
  })

  // ── startRender + progress events ────────────────────────────────────────

  describe('racedash:startRender', () => {
    const baseOpts = {
      configPath: '/path/to/project.json',
      videoPaths: ['/video.mp4'],
      outputPath: '/output.mp4',
      style: 'banner',
      outputResolution: 'source' as const,
      outputFrameRate: 'source' as const,
      renderMode: 'overlay+footage' as const,
    }

    it('calls renderSession with the correct options', async () => {
      mockRenderSession.mockImplementation(async (_opts, _onProgress) => ({
        outputPath: '/output.mp4',
        overlayReused: false,
      }))

      const handler = registeredHandlers['racedash:startRender']
      await handler(null, baseOpts)

      expect(mockRenderSession).toHaveBeenCalledTimes(1)
      const [callOpts] = (mockRenderSession as Mock).mock.calls[0]
      expect(callOpts.configPath).toBe('/path/to/project.json')
      expect(callOpts.videoPaths).toEqual(['/video.mp4'])
      expect(callOpts.outputPath).toBe('/output.mp4')
      expect(callOpts.style).toBe('banner')
      expect(callOpts.outputResolution).toBeUndefined() // 'source' maps to undefined
    })

    it('maps 1080p resolution preset to { width: 1920, height: 1080 }', async () => {
      mockRenderSession.mockResolvedValue({ outputPath: '/output.mp4', overlayReused: false })

      const handler = registeredHandlers['racedash:startRender']
      await handler(null, { ...baseOpts, outputResolution: '1080p' as const })

      const [callOpts] = (mockRenderSession as Mock).mock.calls[0]
      expect(callOpts.outputResolution).toEqual({ width: 1920, height: 1080 })
    })

    it('sends render-progress events to renderer window', async () => {
      mockRenderSession.mockImplementation(async (_opts, onProgress) => {
        onProgress({ phase: 'Rendering overlay', progress: 0.5 })
        return { outputPath: '/output.mp4', overlayReused: false }
      })

      const handler = registeredHandlers['racedash:startRender']
      await handler(null, baseOpts)

      expect(mockWebContents.send).toHaveBeenCalledWith('racedash:render-progress', {
        phase: 'Rendering overlay',
        progress: 0.5,
      })
    })

    it('sends render-complete event after successful render', async () => {
      const renderResult = { outputPath: '/output.mp4', overlayReused: false }
      mockRenderSession.mockResolvedValue(renderResult)

      const handler = registeredHandlers['racedash:startRender']
      await handler(null, baseOpts)

      expect(mockWebContents.send).toHaveBeenCalledWith('racedash:render-complete', renderResult)
    })

    it('sends render-error event when renderSession throws', async () => {
      mockRenderSession.mockRejectedValue(new Error('ffmpeg not found'))

      const handler = registeredHandlers['racedash:startRender']
      await handler(null, baseOpts)

      expect(mockWebContents.send).toHaveBeenCalledWith('racedash:render-error', {
        message: 'ffmpeg not found',
      })
    })
  })

  // ── cancelRender ─────────────────────────────────────────────────────────

  describe('racedash:cancelRender', () => {
    it('suppresses render-complete when cancel is called before render finishes', async () => {
      // Simulate render completing after cancel has been set
      mockRenderSession.mockImplementation(async (_opts, _onProgress) => {
        // Cancel is called synchronously before the promise resolves in this test
        return { outputPath: '/output.mp4', overlayReused: false }
      })

      // Call cancelRender to set the flag first
      const cancelHandler = registeredHandlers['racedash:cancelRender']
      await cancelHandler(null)

      const startHandler = registeredHandlers['racedash:startRender']
      await startHandler(null, {
        configPath: '/path/to/project.json',
        videoPaths: ['/video.mp4'],
        outputPath: '/output.mp4',
        style: 'banner',
        outputResolution: 'source' as const,
        outputFrameRate: 'source' as const,
        renderMode: 'overlay+footage' as const,
      })

      // Because renderCancelled was set, render-complete should NOT be sent
      expect(mockWebContents.send).not.toHaveBeenCalledWith(
        'racedash:render-complete',
        expect.anything(),
      )
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail** (no implementation yet from vitest's perspective on a fresh test run)

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test
```

Expected: tests run; the suite for implemented handlers should pass (handlers are already written in Task 7). If any test fails, investigate and fix before proceeding.

- [ ] **Step 4: Confirm all tests pass**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test
```

Expected output contains:
```
Test Files  1 passed (1)
Tests       X passed (X)
```

- [ ] **Step 5: Run final TypeScript check across the whole desktop app**

```bash
pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/vitest.config.ts \
        apps/desktop/src/main/ipc.test.ts
git commit -m "test(desktop): add IPC handler unit tests"
```

---

> Dispatch plan-document-reviewer for Chunk 3 before proceeding.

---

## Follow-ons (not in scope for this plan)

The following items were explicitly deferred and should be tracked as follow-on work:

1. **Persist driver selection** — `TimingTab` updates local state only. An IPC call to write the selected driver back to `project.json` is needed.
2. **Persist position overrides** — overrides are local state only; needs IPC persistence.
3. **Persist style settings** — overlay type and colours are local state only; needs IPC persistence.
4. **Lift overlay type to parent** — `ExportTab.startRender` currently hardcodes `style: 'banner'`; the selected overlay type from `StyleTab` should be lifted to `EditorTabsPane` and passed down.
5. **Renderer entry in production builds** — `resolveRendererEntry()` in `ipc.ts` uses a hardcoded dev path; the production path needs to be wired into the electron-builder config and `app.getPath('resources')`.
6. **Real render cancellation** — `cancelRender` sets a flag but cannot stop an in-progress `renderSession` call mid-flight. When `@racedash/engine` exposes an `AbortSignal` interface, thread it through.
7. **`checkFfmpeg` and `getVideoInfo` stubs** — these were implemented in prior sub-plans but their implementations are stubbed in the revised `ipc.ts` above (marked with comments). Replace the stubs with the actual implementations from the prior sub-plan's `ipc.ts`.

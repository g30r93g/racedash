# Overlay Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Remotion live preview composited over the editor video, make `StyleTab` fully controlled, add undo/redo for style changes, and persist style to `config.json`.

**Architecture:** Style state is lifted to `Editor`, which builds `OverlayProps` from `TimestampsResult` data and passes it to `VideoPane`. `VideoPane` renders a `@remotion/player` `<Player>` absolutely over the `<video>` element inside `VideoPlayer`. IPC is extended to return pre-built `SessionSegment[]` from `generateTimestamps`, and a new `saveStyleToConfig` handler persists overlay type + colours to `config.json`.

**Tech Stack:** Electron 33, React 18, `@remotion/player` v4, `@racedash/core`, `@racedash/engine`, Vitest, TypeScript, electron-vite

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/desktop/package.json` | Add `@remotion/player` + `@racedash/core` deps |
| Modify | `apps/desktop/electron.vite.config.ts` | Add `@renderer` path alias → `apps/renderer/src` |
| Modify | `apps/desktop/src/types/ipc.ts` | Add `sessionSegments` + `startingGridPosition` to `TimestampsResult`; add `saveStyleToConfig` to `RacedashAPI` |
| Modify | `apps/desktop/src/main/ipc.ts` | Extract + export `generateTimestampsHandler`; add `saveStyleToConfigHandler`; register both |
| Create | `apps/desktop/src/main/__tests__/ipc.styleConfig.test.ts` | Unit tests for `saveStyleToConfigHandler` |
| Create | `apps/desktop/src/main/__tests__/ipc.generateTimestamps.test.ts` | Unit tests for `generateTimestampsHandler` (sessionSegments extension) |
| Modify | `apps/desktop/src/preload/index.ts` | Add `saveStyleToConfig` bridge entry |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx` | Remove all local state; accept `styleState` + `onStyleChange` props; debounce colour pickers |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Accept `overlayType` prop; pass to `startRender` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` | Thread `styleState`/`onStyleChange`/`onUndo`/`onRedo` to `StyleTab`; `overlayType` to `ExportTab` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | Hold style history + cursor; build `OverlayProps`; wire undo/redo keys; load/save style |
| Modify | `apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx` | Add `<Player>` as sibling to `<video>` in existing `relative` container |
| Modify | `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx` | Pass `overlayType` + `overlayProps` to `VideoPlayer`; sync Player on rAF + seeks |

---

## Task 1: Add Dependencies and Vite Alias

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/electron.vite.config.ts`

- [ ] **Step 1: Add `@remotion/player` and `@racedash/core` to desktop `package.json`**

In `apps/desktop/package.json`, add to `"dependencies"`:
```json
"@racedash/core": "workspace:*",
"@remotion/player": "^4.0.0"
```

- [ ] **Step 2: Install**

```bash
cd /path/to/worktree && pnpm install
```

Expected: packages resolve without errors. `@remotion/player` pulls from the local pnpm store (already cached at v4.0.434).

- [ ] **Step 3: Add `@renderer` path alias to the renderer Vite config**

In `apps/desktop/electron.vite.config.ts`, update the `renderer.resolve.alias` block:

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@renderer': resolve(__dirname, '../renderer/src'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
```

Note: `__dirname` here is `apps/desktop`. `../renderer/src` resolves to `apps/renderer/src`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: no errors (no code yet imports these — just confirming config change is valid).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/electron.vite.config.ts pnpm-lock.yaml
git commit -m "chore(desktop): add @remotion/player + @racedash/core deps and @renderer alias"
```

---

## Task 2: Update IPC Types

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`

- [ ] **Step 1: Add `@racedash/core` imports and extend `TimestampsResult`**

At the top of `apps/desktop/src/types/ipc.ts`, add:
```ts
import type { SessionSegment, OverlayStyling } from '@racedash/core'
```

Extend `TimestampsResult` with two new fields:
```ts
export interface TimestampsResult {
  chapters: string
  segments: Array<{
    config: { source: string; mode: string; label?: string }
    selectedDriver?: TimestampsResultDriver
    drivers: TimestampsResultDriver[]
    capabilities: Record<string, boolean>
    replayData?: TimestampsResultReplayEntry[][]
  }>
  offsets: number[]
  sessionSegments: SessionSegment[]          // pre-built by main process
  startingGridPosition?: number              // grid position for race-start display
}
```

- [ ] **Step 2: Add `saveStyleToConfig` to `RacedashAPI`**

Inside the `RacedashAPI` interface, add after `updateProjectConfigOverrides`:
```ts
saveStyleToConfig(configPath: string, overlayType: string, styling: OverlayStyling): Promise<void>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: no errors (the new fields will cause type errors in renderer code once you try to use them — those are fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/types/ipc.ts
git commit -m "feat(desktop): extend TimestampsResult with sessionSegments + saveStyleToConfig type"
```

---

## Task 3: `saveStyleToConfig` IPC Handler

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/__tests__/ipc.styleConfig.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/src/main/__tests__/ipc.styleConfig.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))
vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(), listDrivers: vi.fn(), generateTimestamps: vi.fn(),
  renderSession: vi.fn(), parseFpsValue: vi.fn(), buildRaceLapSnapshots: vi.fn(),
  buildSessionSegments: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(), execFileSync: vi.fn(),
}))

import { saveStyleToConfigHandler } from '../ipc'

describe('saveStyleToConfigHandler', () => {
  it('writes overlayType and styling, preserving existing fields', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ segments: [{ source: 'manual' }], driver: 'GG' }))

    saveStyleToConfigHandler(configPath, 'esports', { accentColor: '#ff0000' })

    const result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayType).toBe('esports')
    expect(result.styling).toEqual({ accentColor: '#ff0000' })
    expect(result.segments).toEqual([{ source: 'manual' }])
    expect(result.driver).toBe('GG')
  })

  it('overwrites existing overlayType and styling', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ overlayType: 'banner', styling: { accentColor: '#000' } }))

    saveStyleToConfigHandler(configPath, 'modern', { accentColor: '#fff' })

    const result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayType).toBe('modern')
    expect(result.styling).toEqual({ accentColor: '#fff' })
  })

  it('writes valid JSON (pretty-printed with 2-space indent)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ segments: [] }))

    saveStyleToConfigHandler(configPath, 'banner', {})

    const raw = readFileSync(configPath, 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(raw).toContain('\n') // pretty-printed
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose 2>&1 | grep -E "FAIL|saveStyleToConfig"
```

Expected: `FAIL` — `saveStyleToConfigHandler` is not exported yet.

- [ ] **Step 3: Implement `saveStyleToConfigHandler` in `ipc.ts`**

Add the import at the top of `apps/desktop/src/main/ipc.ts`:
```ts
import type { OverlayStyling } from '@racedash/core'
```

Add the exported implementation function (after `updateProjectConfigOverridesHandler`):
```ts
export function saveStyleToConfigHandler(
  configPath: string,
  overlayType: string,
  styling: OverlayStyling,
): void {
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('saveStyleToConfig: configPath must be a non-empty string')
  }
  const raw = fs.readFileSync(configPath, 'utf-8') as string
  const config = JSON.parse(raw) as Record<string, unknown>
  config.overlayType = overlayType
  config.styling = styling
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
```

Register it inside `registerIpcHandlers()`:
```ts
ipcMain.handle(
  'racedash:saveStyleToConfig',
  (_event, configPath: string, overlayType: string, styling: OverlayStyling) =>
    saveStyleToConfigHandler(configPath, overlayType, styling),
)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|saveStyleToConfig"
```

Expected: all 3 `saveStyleToConfigHandler` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.styleConfig.test.ts
git commit -m "feat(desktop): add saveStyleToConfig IPC handler"
```

---

## Task 4: Extend `generateTimestamps` Handler

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/__tests__/ipc.generateTimestamps.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/desktop/src/main/__tests__/ipc.generateTimestamps.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(), listDrivers: vi.fn(), generateTimestamps: vi.fn(),
  renderSession: vi.fn(), parseFpsValue: vi.fn(), buildRaceLapSnapshots: vi.fn(),
  buildSessionSegments: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(), execFileSync: vi.fn(),
}))

import * as engine from '@racedash/engine'
import { generateTimestampsHandler } from '../ipc'

describe('generateTimestampsHandler', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('merges sessionSegments and startingGridPosition from buildSessionSegments', async () => {
    const fakeSegments = [{ mode: 'race' }] as unknown as ReturnType<typeof engine.buildSessionSegments>['segments']
    vi.mocked(engine.generateTimestamps).mockResolvedValue({
      chapters: '',
      segments: [],
      offsets: [0, 30],
    } as unknown as Awaited<ReturnType<typeof engine.generateTimestamps>>)
    vi.mocked(engine.buildSessionSegments).mockReturnValue({
      segments: fakeSegments,
      startingGridPosition: 4,
    } as unknown as ReturnType<typeof engine.buildSessionSegments>)

    const result = await generateTimestampsHandler({ configPath: '/fake/config.json' })

    expect(engine.buildSessionSegments).toHaveBeenCalledWith([], [0, 30])
    expect(result.sessionSegments).toBe(fakeSegments)
    expect(result.startingGridPosition).toBe(4)
    expect(result.chapters).toBe('')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose 2>&1 | grep -E "FAIL|generateTimestampsHandler"
```

Expected: `FAIL` — `generateTimestampsHandler` is not exported yet.

- [ ] **Step 3: Extract + extend the handler in `ipc.ts`**

Add `buildSessionSegments` to the existing engine import in `ipc.ts`:
```ts
import { joinVideos, listDrivers, generateTimestamps, renderSession, parseFpsValue, buildRaceLapSnapshots, buildSessionSegments } from '@racedash/engine'
```

Add the exported handler function (near the other exported impl functions):
```ts
import type { SessionSegment } from '@racedash/core'

// Local type for the extended handler return — avoids `as never` and keeps TS honest
type GenerateTimestampsHandlerResult = Awaited<ReturnType<typeof generateTimestamps>> & {
  sessionSegments: SessionSegment[]
  startingGridPosition?: number
}

export async function generateTimestampsHandler(
  opts: { configPath: string; fps?: number },
): Promise<GenerateTimestampsHandlerResult> {
  const result = await generateTimestamps(opts)
  const { segments: sessionSegments, startingGridPosition } = buildSessionSegments(
    result.segments,
    result.offsets,
  )
  return { ...result, sessionSegments, startingGridPosition }
}
```

Replace the inline handler registration in `registerIpcHandlers()`:
```ts
// Replace this:
ipcMain.handle('racedash:generateTimestamps', (_event, opts: { configPath: string; fps?: number }) =>
  generateTimestamps(opts)
)
// With this:
ipcMain.handle('racedash:generateTimestamps', (_event, opts: { configPath: string; fps?: number }) =>
  generateTimestampsHandler(opts)
)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|generateTimestampsHandler"
```

Expected: the new test passes; all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.generateTimestamps.test.ts
git commit -m "feat(desktop): extend generateTimestamps IPC to return sessionSegments + startingGridPosition"
```

---

## Task 5: Wire Preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add `saveStyleToConfig` to the preload bridge**

In `apps/desktop/src/preload/index.ts`, add the `OverlayStyling` import at the top:
```ts
import type { OverlayStyling } from '@racedash/core'
```

Add the new entry to the `api` object (after `updateProjectConfigOverrides`):
```ts
saveStyleToConfig: (configPath: string, overlayType: string, styling: OverlayStyling) =>
  ipcRenderer.invoke('racedash:saveStyleToConfig', configPath, overlayType, styling),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): wire saveStyleToConfig through preload bridge"
```

---

## Task 6: Make `StyleTab` Fully Controlled

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx`

`StyleTab` currently has 7 local state variables. This task removes all of them and replaces with props.

- [ ] **Step 1: Define the `StyleTabProps` interface and rewrite the component**

Replace `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx` entirely:

```tsx
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
  // This means the live preview lags ~400ms at the end of a drag, which is acceptable
  // and matches the spec's intent of preventing dozens of history entries per drag.
  //
  // Uses a latestRef to avoid stale-closure issues — the timeout always reads the
  // most recent styleState/patch even if props updated while the timer was pending.
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
      {/* UNDO / REDO — canUndo/canRedo come from parent history cursor */}
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
```

> **Debounce note:** `handleColourChange` only fires `onStyleChange` once per drag via debounce — NOT on every drag tick. The live preview will update when the debounce settles (~400ms after the user stops dragging). Discrete controls like the overlay type picker call `onStyleChange` directly (no debounce needed since there's one event per click).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: type errors in `EditorTabsPane.tsx` (it passes no props to `StyleTab`) — those are resolved in Task 8. Errors here are expected.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx
git commit -m "feat(desktop): make StyleTab fully controlled with onStyleChange + undo/redo props"
```

---

## Task 7: Wire `ExportTab`

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`

- [ ] **Step 1: Add `overlayType` prop and pass to `startRender`**

Add `OverlayType` import and `overlayType` to the props interface in `ExportTab.tsx`:

```tsx
import type { OverlayType } from './OverlayPickerModal'

interface ExportTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
  onRenderingChange?: (rendering: boolean) => void
  overlayType: OverlayType
}
```

In `handleRender`, replace the hardcoded `style: 'banner'` with:
```ts
await window.racedash.startRender({
  configPath: project.configPath,
  videoPaths: project.videoPaths,
  outputPath,
  style: overlayType,   // was: 'banner' — TODO resolved
  outputResolution,
  outputFrameRate,
  renderMode,
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: type error in `EditorTabsPane.tsx` (doesn't pass `overlayType` to `ExportTab`) — resolved in Task 8.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx
git commit -m "feat(desktop): wire overlayType from StyleTab state into startRender"
```

---

## Task 8: Lift Style State to `Editor` with Undo/Redo

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx`

- [ ] **Step 1: Update `EditorTabsPane` to thread style props**

Add `StyleState` import and add style props to `EditorTabsPaneProps` in `EditorTabsPane.tsx`:

```tsx
import type { StyleState } from './tabs/StyleTab'

interface EditorTabsPaneProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
  currentTime?: number
  playing?: boolean
  onSave?: () => void
  overrides: Override[]
  onOverridesChange: (overrides: Override[]) => void
  styleState: StyleState
  onStyleChange: (next: StyleState) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

Pass the style props through to `StyleTab` and `ExportTab`:
```tsx
<TabsContent value="style" className="mt-0 flex-1 overflow-auto">
  <StyleTab
    styleState={styleState}
    onStyleChange={onStyleChange}
    onUndo={onUndo}
    onRedo={onRedo}
    canUndo={canUndo}
    canRedo={canRedo}
  />
</TabsContent>
<TabsContent value="export" className="mt-0 flex-1 overflow-auto">
  <ExportTab project={project} videoInfo={videoInfo} onRenderingChange={setRendering} overlayType={styleState.overlayType} />
</TabsContent>
```

- [ ] **Step 2: Add style state + history to `Editor.tsx`**

Add these imports at the top of `Editor.tsx`:
```tsx
import type { StyleState } from './tabs/StyleTab'
import type { OverlayProps } from '@racedash/core'
```

Define the reducer **outside** the `Editor` component (module-level, before the component function):

```tsx
// ── Style history reducer ────────────────────────────────────────────────────

interface StyleHistoryState {
  history: StyleState[]
  cursor: number
}

type StyleHistoryAction =
  | { type: 'change'; next: StyleState }
  | { type: 'init'; initial: StyleState }
  | { type: 'undo' }
  | { type: 'redo' }

function styleHistoryReducer(state: StyleHistoryState, action: StyleHistoryAction): StyleHistoryState {
  switch (action.type) {
    case 'init':
      return { history: [action.initial], cursor: 0 }
    case 'change': {
      const base = state.history.slice(0, state.cursor + 1)
      const newHistory = [...base, action.next].slice(-50)
      return { history: newHistory, cursor: Math.min(state.cursor + 1, 49) }
    }
    case 'undo':
      return { ...state, cursor: Math.max(state.cursor - 1, 0) }
    case 'redo':
      return { ...state, cursor: Math.min(state.cursor + 1, state.history.length - 1) }
  }
}

const DEFAULT_STYLE_STATE: StyleState = { overlayType: 'banner', styling: {} }
```

Inside the `Editor` component, replace the previous `useState` style history with `useReducer`:

```tsx
// ── Style state + undo/redo history ─────────────────────────────────────────
const [styleHistoryState, dispatchStyle] = useReducer(styleHistoryReducer, {
  history: [DEFAULT_STYLE_STATE],
  cursor: 0,
})
const styleState = styleHistoryState.history[styleHistoryState.cursor]
const canUndo = styleHistoryState.cursor > 0
const canRedo = styleHistoryState.cursor < styleHistoryState.history.length - 1

// Load initial style from config.json on mount
useEffect(() => {
  window.racedash.readProjectConfig(project.configPath).then((config) => {
    const overlayType = (config.overlayType as StyleState['overlayType']) ?? 'banner'
    const styling = (config.styling as StyleState['styling']) ?? {}
    dispatchStyle({ type: 'init', initial: { overlayType, styling } })
  }).catch(() => { /* no style saved yet — defaults are fine */ })
}, [project.configPath])

const handleStyleChange = useCallback((next: StyleState) => {
  dispatchStyle({ type: 'change', next })
  // Persist to config.json (fire-and-forget)
  window.racedash.saveStyleToConfig(project.configPath, next.overlayType, next.styling)
    .catch((err: unknown) => { console.warn('[Editor] saveStyleToConfig failed:', err) })
}, [project.configPath])

const handleUndo = useCallback(() => { dispatchStyle({ type: 'undo' }) }, [])
const handleRedo = useCallback(() => { dispatchStyle({ type: 'redo' }) }, [])

// Keyboard undo/redo
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
    if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); handleRedo() }
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}, [handleUndo, handleRedo])
```

- [ ] **Step 3: Build `OverlayProps` from `timestampsResult` in `Editor.tsx`**

Add a field for `sessionSegments` + `startingGridPosition` derived from `timestampsResult`:

```tsx
// After the existing timestampsResult state:
const overlayProps = useMemo<OverlayProps | undefined>(() => {
  if (!timestampsResult || !videoInfo) return undefined
  return {
    segments: timestampsResult.sessionSegments,
    startingGridPosition: timestampsResult.startingGridPosition,
    fps: videoInfo.fps,
    durationInFrames: Math.ceil(videoInfo.durationSeconds * videoInfo.fps),
    videoWidth: videoInfo.width,
    videoHeight: videoInfo.height,
    styling: styleState.styling,
  }
}, [timestampsResult, videoInfo, styleState.styling])
```

- [ ] **Step 4: Pass overlayProps + styleState down in the `Editor` JSX**

In the `Editor` return, pass new props to both `VideoPane` and `EditorTabsPane`:

```tsx
<VideoPane
  ref={videoPaneRef}
  videoPath={project.videoPaths[0]}
  fps={videoInfo?.fps}
  onTimeUpdate={handleTimeUpdate}
  onPlayingChange={setPlaying}
  overlayType={styleState.overlayType}
  overlayProps={overlayProps}
/>
```

```tsx
<EditorTabsPane
  project={project}
  videoInfo={videoInfo}
  currentTime={currentTime}
  playing={playing}
  onSave={handleSave}
  overrides={overrides}
  onOverridesChange={setOverrides}
  styleState={styleState}
  onStyleChange={handleStyleChange}
  onUndo={handleUndo}
  onRedo={handleRedo}
  canUndo={canUndo}
  canRedo={canRedo}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: errors only in `VideoPane.tsx` (unknown props) — resolved in Task 9.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/Editor.tsx apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx
git commit -m "feat(desktop): lift style state to Editor with undo/redo history and config persistence"
```

---

## Task 9: Add Remotion `<Player>` to VideoPlayer

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx`

- [ ] **Step 1: Verify `registry` shape before wiring**

Open `apps/renderer/src/registry.ts`. You should see something like:
```ts
export const registry: Record<OverlayType, {
  component: React.ComponentType<OverlayProps>
  width: number
  height: number
  // possibly: overlayX, overlayY, scaleWithVideo
}>
```

The access patterns used below are:
- `registry[overlayType].component` — the React component to render
- `registry[overlayType].width` — the composition width (NOT `videoWidth` — overlays like `banner` are 1920×500, not 1920×1080)
- `registry[overlayType].height` — the composition height

Confirm these keys exist. If the field names differ, update the `<Player>` props accordingly.

- [ ] **Step 2: Extend `VideoPlayer` to accept and render the overlay**

`VideoPlayer` is currently a `React.forwardRef<HTMLVideoElement, VideoPlayerProps>`. It **must stay that way** — `VideoPane` passes `ref={videoRef}` to `VideoPlayer` and uses that ref to seek/play the video. The `playerRef` for Remotion is added as a **separate explicit prop**, not via forwardRef.

Add imports and extend the props interface in `VideoPlayer.tsx`:

```tsx
import { Player, type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'
import { registry } from '@renderer/registry'

interface VideoPlayerProps {
  videoPath?: string
  muted?: boolean
  onLoadedMetadata?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  overlayType?: OverlayType                          // NEW
  overlayProps?: OverlayProps                        // NEW
  playerRef?: React.RefObject<PlayerRef | null>      // NEW — separate from video forwardRef
}
```

The component signature stays `React.forwardRef<HTMLVideoElement, VideoPlayerProps>`. Only the JSX inside the existing `relative` container changes — add `<Player>` as a sibling after the `<video>` element:

```tsx
// VideoPlayer.tsx — only showing the return JSX; keep forwardRef wrapper unchanged
<div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
  {videoPath ? (
    <video
      ref={ref}   {/* forwarded ref — VideoPane holds this as videoRef */}
      src={`media://${videoPath}`}
      className="h-full w-full object-contain"
      muted={muted}
      preload="metadata"
      onLoadedMetadata={(e) => onLoadedMetadata?.((e.target as HTMLVideoElement).duration)}
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
    />
  ) : (
    <div className="flex flex-col items-center gap-3">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <polygon points="14,10 38,24 14,38" fill="#3a3a3a" />
      </svg>
      <span className="text-xs tracking-widest text-muted-foreground">NO VIDEO LOADED</span>
    </div>
  )}
  {overlayProps && overlayType && registry[overlayType] && (
    <Player
      ref={playerRef ?? undefined}
      component={registry[overlayType].component}
      compositionWidth={registry[overlayType].width}    // overlay's own width (e.g. 1920 for banner)
      compositionHeight={registry[overlayType].height}  // overlay's own height (e.g. 500 for banner)
      durationInFrames={overlayProps.durationInFrames}
      fps={overlayProps.fps}
      inputProps={overlayProps as Record<string, unknown>}
      className="absolute inset-0 pointer-events-none"
      style={{ background: 'transparent' }}
      renderLoading={() => null}
    />
  )}
</div>
```

- [ ] **Step 2b: Check `remotion` transitive resolution**

`apps/renderer` style components import from `remotion` (e.g. `AbsoluteFill`, `useCurrentFrame`). When the desktop Vite config bundles them via `@renderer`, `remotion` must resolve. Run:

```bash
cd apps/desktop && pnpm exec vite build --mode development 2>&1 | grep -i "remotion\|unresolved"
```

If you see an unresolved `remotion` error, add it explicitly:
```json
// apps/desktop/package.json — add to "dependencies":
"remotion": "^4.0.0"
```
Then run `pnpm install` again. If no error, skip this sub-step.

- [ ] **Step 3: Extend `VideoPane` to hold a `PlayerRef` and sync frames**

Add props and `playerRef` to `VideoPane.tsx` (`Player` is NOT imported here — it lives in `VideoPlayer`):

```tsx
import { type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'

interface VideoPaneProps {
  videoPath?: string
  fps?: number
  onTimeUpdate?: (currentTime: number) => void
  onPlayingChange?: (playing: boolean) => void
  overlayType?: OverlayType
  overlayProps?: OverlayProps
}
```

Add a `playerRef` inside `VideoPane` and hook it to the rAF loop and seek handler:

```tsx
const playerRef = useRef<PlayerRef | null>(null)

// In the rAF tick (inside the existing playing useEffect):
const tick = () => {
  const t = videoRef.current?.currentTime ?? 0
  setCurrentTime(t)
  onTimeUpdate?.(t)
  // Sync Remotion Player frame
  const fps = overlayProps?.fps
  if (fps != null) {
    playerRef.current?.seekTo(Math.round(t * fps))
  }
  rafId = requestAnimationFrame(tick)
}

// In handleSeek:
const handleSeek = useCallback((time: number) => {
  if (videoRef.current) videoRef.current.currentTime = time
  setCurrentTime(time)
  onTimeUpdate?.(time)
  // Sync Player on explicit seek
  const fps = overlayProps?.fps
  if (fps != null) {
    playerRef.current?.seekTo(Math.round(time * fps))
  }
}, [onTimeUpdate, overlayProps?.fps])
```

Pass `playerRef`, `overlayType`, and `overlayProps` to `VideoPlayer`:

```tsx
<VideoPlayer
  ref={videoRef}
  videoPath={videoPath}
  muted={muted}
  onLoadedMetadata={setDuration}
  onPlay={() => { setPlaying(true); onPlayingChange?.(true) }}
  onPause={() => { setPlaying(false); onPlayingChange?.(false) }}
  onEnded={() => { setPlaying(false); onPlayingChange?.(false) }}
  overlayType={overlayType}
  overlayProps={overlayProps}
  playerRef={playerRef}
/>
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: **no errors**.

- [ ] **Step 5: Run all tests**

```bash
cd apps/desktop && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Run the app and verify live preview**

```bash
cd apps/desktop && pnpm dev
```

Open a project with timing data. Switch to the Style tab — the overlay should be visible on the video. Change the accent colour — the overlay should update in real time. Press `Cmd+Z` to undo. Switch overlay types — the preview updates. Click Render — the correct overlay type is used.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx
git commit -m "feat(desktop): add Remotion live preview overlay composited over video in editor"
```

---

## Final Verification

- [ ] **Run full test suite from monorepo root**

```bash
pnpm test
```

Expected: all packages pass.

- [ ] **Check TypeScript across desktop app**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: no errors.

# Overlay Rendering — Live Preview + StyleTab Wiring

**Date:** 2026-03-17
**Branch:** desktop-app worktree
**Status:** Approved

---

## Overview

This spec covers two tightly coupled workstreams:

1. **Remotion live preview** — a `@remotion/player` instance composited on top of the HTML5 `<video>` element in the editor, showing the timing overlay in real time as the video plays.
2. **StyleTab wiring** — lifting `StyleTab`'s isolated local state to `Editor`, connecting it to the live preview and to `ExportTab`'s render call, persisting it to `config.json`, and adding undo/redo.

---

## 1. Architecture

### State flow

```
config.json
    ↕ read on open, debounced write on change
Editor.tsx  ← holds styleState + styleHistory
    ├─ VideoPane.tsx       ← <video> + <Player> composited
    ├─ EditorTabsPane.tsx
    │    ├─ StyleTab.tsx   ← controlled: props in, callbacks out
    │    └─ ExportTab.tsx  ← reads overlayType from styleState
    └─ timestampsResult (existing) + sessionSegments + startingGridPosition (new fields)
```

### Data flow for live preview

1. `Editor` calls `generateTimestamps` (existing IPC) → response now includes `sessionSegments: SessionSegment[]` and `startingGridPosition: number | undefined`
2. `Editor` builds `OverlayProps` by combining `sessionSegments`, `startingGridPosition`, `videoInfo.fps`, `Math.ceil(videoInfo.durationSeconds * videoInfo.fps)` as `durationInFrames`, `videoInfo.width` / `videoInfo.height`, and `styleState.styling`
3. `VideoPane` receives `overlayType` + `overlayProps`, renders `<Player>` as an overlay synced with the video
4. Player frame is kept in sync via the existing rAF `currentTime` loop

---

## 2. Style state + undo/redo

### Shape (lives in `Editor`)

```ts
interface StyleState {
  overlayType: OverlayType      // imported from OverlayPickerModal (desktop-only type, stays there)
  styling: OverlayStyling       // from @racedash/core
}
```

`OverlayType = 'banner' | 'geometric-banner' | 'esports' | 'minimal' | 'modern'` is currently defined and exported from `OverlayPickerModal.tsx`. It remains there — it is a UI presentation concern tied to the desktop app, not a `@racedash/core` type. `Editor`, `StyleTab`, `VideoPane`, and `EditorTabsPane` import it from `OverlayPickerModal`.

`OverlayStyling` is already in `@racedash/core` and covers the accent colour plus all per-overlay colour bags (`BannerStyling`, `EsportsStyling`, etc.).

`StyleTab` becomes fully controlled. All of its current local state (`overlayType`, `accentColour`, `bannerTimerText`, etc.) is replaced by a single controlled `styleState: StyleState` prop plus an `onStyleChange: (next: StyleState) => void` callback. `StyleTab` emits a complete new `StyleState` on every change.

### Initial load

On editor mount, `readProjectConfig` (already called for position overrides) also extracts `overlayType` and `styling`. Absent fields default to `overlayType: 'banner'` and `styling: {}` — each Remotion component already defines its own colour defaults.

### Undo/redo

`Editor` holds:

```ts
const [history, setHistory] = useState<StyleState[]>([initialStyleState])
const [cursor, setCursor] = useState(0)
// styleState === history[cursor] at all times
```

`history[cursor]` is always the current style state — there is no separate `styleState` variable; the editor derives it as `history[cursor]`.

**New change (onStyleChange):**
```ts
const newHistory = [...history.slice(0, cursor + 1), next]
setHistory(newHistory.slice(-50))       // cap at 50
setCursor(Math.min(cursor + 1, 49))     // adjust if cap truncated leading entries
```

**Undo:** if `cursor > 0`, `setCursor(cursor - 1)`

**Redo:** if `cursor < history.length - 1`, `setCursor(cursor + 1)`

This ensures `history[cursor + 1]` always exists for redo until a new change truncates the future.

- Colour picker drags are debounced ~400ms inside `StyleTab` before calling `onStyleChange` — prevents one drag producing dozens of history entries. The debounce lives in `StyleTab` since it knows which controls need it (colour pickers, not discrete selectors like overlay type)
- Undo/redo keyboard shortcuts: `Cmd+Z` / `Ctrl+Z` for undo, `Cmd+Shift+Z` / `Ctrl+Shift+Z` for redo, wired via a `keydown` listener on `document` in `Editor`, cleaned up on unmount
- Style undo/redo is **fully independent** from position override history. Both stacks coexist and do not interact.

### Persistence

Each committed style change (i.e. each `onStyleChange` call) triggers `saveStyleToConfig`. This is **fire-and-forget** — errors are logged to console only, matching the existing pattern of `updateProjectConfigOverrides`. No unsaved-changes indicator is shown.

`renderSession` in the engine already reads `styling` from `config.json` via `loadTimingConfig`. The engine does not read `overlayType` from config — it receives `style` via `RenderStartOpts`. So `saveStyleToConfig` writes both fields, but only `styling` is consumed by the engine; `overlayType` is read back by the desktop on next open.

---

## 3. IPC changes

### `generateTimestamps` return type

```ts
// apps/desktop/src/types/ipc.ts — add imports:
import type { SessionSegment } from '@racedash/core'

interface TimestampsResult {
  chapters: string
  segments: Array<{ ... }>                    // unchanged
  offsets: number[]                           // unchanged
  sessionSegments: SessionSegment[]           // NEW
  startingGridPosition?: number               // NEW — from buildSessionSegments
}
```

The main-process handler wraps the existing `generateTimestamps` engine call and then calls `buildSessionSegments`. **`buildSessionSegments` is not currently imported** in `ipc.ts` — it must be added to the import from `@racedash/engine`:

```ts
// apps/desktop/src/main/ipc.ts — update existing import:
import { joinVideos, listDrivers, generateTimestamps, renderSession, parseFpsValue, buildRaceLapSnapshots, buildSessionSegments } from '@racedash/engine'
```

The handler becomes:

```ts
ipcMain.handle('racedash:generateTimestamps', async (_event, opts) => {
  const result = await generateTimestamps(opts)
  const { segments: sessionSegments, startingGridPosition } = buildSessionSegments(result.segments, result.offsets)
  return { ...result, sessionSegments, startingGridPosition }
})
```

Note: `generateTimestamps` in `operations.ts` does not return `sessionSegments` from its own return type. The IPC handler builds them as a second step, keeping the engine-level type stable.

### `saveStyleToConfig` — new IPC handler

```ts
// apps/desktop/src/main/ipc.ts — add import:
import type { OverlayStyling } from '@racedash/core'

export function saveStyleToConfigHandler(
  configPath: string,
  overlayType: string,
  styling: OverlayStyling,
): void {
  const raw = fs.readFileSync(configPath, 'utf-8')
  const config = JSON.parse(raw) as Record<string, unknown>
  config.overlayType = overlayType
  config.styling = styling
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

// Registered as:
ipcMain.handle('racedash:saveStyleToConfig',
  (_event, configPath: string, overlayType: string, styling: OverlayStyling) =>
    saveStyleToConfigHandler(configPath, overlayType, styling)
)
```

Added to `RacedashAPI` in `apps/desktop/src/types/ipc.ts`:
```ts
// add import:
import type { OverlayStyling } from '@racedash/core'

// add to RacedashAPI:
saveStyleToConfig(configPath: string, overlayType: string, styling: OverlayStyling): Promise<void>
```

Added to preload in `apps/desktop/src/preload/index.ts`:
```ts
saveStyleToConfig: (configPath: string, overlayType: string, styling: OverlayStyling) =>
  ipcRenderer.invoke('racedash:saveStyleToConfig', configPath, overlayType, styling),
```

### `RenderStartOpts`

No schema change. `ExportTab` receives `overlayType: OverlayType` as a prop and passes it as `style` to `startRender`, resolving the existing `// TODO: derive from StyleTab` comment.

---

## 4. VideoPane + Remotion Player

### Layout

`VideoPlayer` renders the video in a `relative` container (`div.relative.flex.flex-1`) with the `<video>` using `object-contain`. The `<Player>` must match this exactly — it sits as a sibling to `<video>` within that same `relative` container, using `absolute inset-0` with `compositionWidth={videoInfo.width}` and `compositionHeight={videoInfo.height}`. Remotion Player scales its composition to fit its container while preserving aspect ratio (equivalent to `object-contain`), so both the video and the overlay maintain the same scaling and alignment automatically.

```tsx
// Inside VideoPlayer (or in VideoPane wrapping it):
<div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
  <video className="h-full w-full object-contain" ... />
  {overlayProps && (
    <Player
      ref={playerRef}
      component={registry[overlayType].component}
      compositionWidth={overlayProps.videoWidth ?? 1920}
      compositionHeight={overlayProps.videoHeight ?? 1080}
      durationInFrames={overlayProps.durationInFrames}
      fps={overlayProps.fps}
      inputProps={overlayProps}
      className="absolute inset-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  )}
</div>
```

`pointer-events-none` on the Player ensures it does not intercept mouse events for playback controls.

### Overlay component sourcing

`apps/renderer` is not a library package. The desktop renderer imports overlay components and `registry` directly from `apps/renderer/src` via a **Vite path alias**. Add to `apps/desktop/vite.renderer.config.ts` (or equivalent renderer Vite config):

```ts
resolve: {
  alias: {
    '@renderer': path.resolve(__dirname, '../../renderer/src'),
  },
}
```

Then in `VideoPane.tsx`:
```ts
import { registry } from '@renderer/registry'
```

A direct relative path from `VideoPane.tsx` to `apps/renderer/src` would require 8 levels of `../` and is fragile — the path alias is required.

### Player sync

`@remotion/player` v4 `PlayerRef` exposes **`seekTo(frame: number)`** (not `seekToFrame`). The correct call is:

```ts
playerRef.current?.seekTo(Math.round(currentTime * fps))
```

This is called:
- On each rAF tick while playing, driven by the existing `onTimeUpdate` callback path in `VideoPane`
- On explicit seeks (`handleSeek` in `VideoPane`)

`fps` comes from `videoInfo.fps` passed as a prop — if `overlayProps` is undefined (video not yet loaded), the Player is not rendered, so no null-check on `fps` is needed.

### `VideoPaneProps` additions

```ts
interface VideoPaneProps {
  // existing: videoPath, fps, onTimeUpdate, onPlayingChange
  overlayType?: OverlayType
  overlayProps?: OverlayProps   // absent while timestamps are loading — Player not rendered
}
```

When `overlayProps` is undefined, the `<Player>` is simply not rendered. No skeleton or loading indicator is added — the video plays normally in the meantime.

### New dependency

`apps/desktop/package.json` gains:
- `"@remotion/player": "^4.0.0"` — already in pnpm store at v4.0.434 with React 18 variant
- `"@racedash/core": "workspace:*"` — currently missing from desktop dependencies; required for `SessionSegment`, `OverlayStyling`, `OverlayProps` imports in both main process and renderer

---

## 5. File changes summary

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `apps/desktop/src/main/ipc.ts` | Add `buildSessionSegments` to engine import; extend `generateTimestamps` handler to return `sessionSegments` + `startingGridPosition`; add `saveStyleToConfigHandler` + registration; add `OverlayStyling` import from `@racedash/core` |
| Modify | `apps/desktop/src/types/ipc.ts` | Add `SessionSegment` + `OverlayStyling` imports from `@racedash/core`; add `sessionSegments` + `startingGridPosition` to `TimestampsResult`; add `saveStyleToConfig` to `RacedashAPI` |
| Modify | `apps/desktop/src/preload/index.ts` | Add `saveStyleToConfig` entry calling `racedash:saveStyleToConfig` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | Hold `history` array + `cursor` for style undo/redo; build `OverlayProps`; pass `styleState`/`onStyleChange`/`onUndo`/`onRedo` down; wire `keydown` undo/redo; load style from `readProjectConfig`; save via `saveStyleToConfig` |
| Modify | `apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx` | Render `<Player>` as sibling to `<video>` inside existing `relative` container |
| Modify | `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx` | Add `overlayType` + `overlayProps` props; pass through to `VideoPlayer`; call `playerRef.seekTo` on rAF ticks and seeks |
| Modify | `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` | Thread `styleState` + `onStyleChange` + `onUndo` + `onRedo` through to `StyleTab`; pass `overlayType` to `ExportTab` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx` | Remove all local state; accept `styleState` + `onStyleChange` props; debounce colour picker calls ~400ms before emitting |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Accept `overlayType: OverlayType` prop; pass to `startRender` as `style` |
| Modify | `apps/desktop/package.json` | Add `@remotion/player` + `@racedash/core` dependencies |
| Modify | `apps/desktop/vite.renderer.config.ts` (or equivalent) | Add `@renderer` path alias pointing to `apps/renderer/src` |

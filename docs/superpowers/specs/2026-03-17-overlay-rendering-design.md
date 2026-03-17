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
    └─ timestampsResult (existing) + sessionSegments (new field)
```

### Data flow for live preview

1. `Editor` calls `generateTimestamps` (existing IPC) → response now includes `sessionSegments: SessionSegment[]`
2. `Editor` wraps `sessionSegments` + `fps` + `durationInFrames` + `styling` into an `OverlayProps` object
3. `VideoPane` receives `overlayType` + `overlayProps`, renders `<Player>` absolutely over `<video>`
4. Player frame is kept in sync with video via the existing rAF `currentTime` loop

---

## 2. Style state + undo/redo

### Shape (lives in `Editor`)

```ts
interface StyleState {
  overlayType: OverlayType      // 'banner' | 'geometric-banner' | 'esports' | 'minimal' | 'modern'
  styling: OverlayStyling       // from @racedash/core — accent + per-overlay colour bags
}
```

### Initial load

On editor mount, `readProjectConfig` (already called for position overrides) also extracts `overlayType` and `styling`. Absent fields default to `overlayType: 'banner'` and `styling: {}` — each Remotion component already defines its own colour defaults.

### Undo/redo

- History is a `StyleState[]` array capped at 50 entries with an integer cursor
- Every committed `onStyleChange`: truncate forward history, push current state, advance cursor
- Colour picker drags are debounced ~400ms before pushing to history — prevents one drag producing dozens of entries
- `Cmd+Z` / `Cmd+Shift+Z` (and `Ctrl` equivalents) wired via a `keydown` listener in `Editor`
- Scoped to style only — does not interact with position override history

### Persistence

Each committed style change (post-debounce) calls `saveStyleToConfig(configPath, overlayType, styling)` IPC. This patches the two fields into `config.json` without touching `segments` or `driver`. Since `renderSession` already reads `styling` from `config.json` via `loadTimingConfig`, the full render pipeline picks up changes automatically with no further wiring.

---

## 3. IPC changes

### `generateTimestamps` return type

```ts
// ipc.ts (renderer-side type)
interface TimestampsResult {
  chapters: string
  segments: Array<{ ... }>        // unchanged
  offsets: number[]               // unchanged
  sessionSegments: SessionSegment[]  // NEW
}
```

`SessionSegment` is from `@racedash/core` (a pure type package). In the main-process handler, `buildSessionSegments(resolvedSegments, snappedOffsets)` is called — the same call already inside `renderSession` — and the result is included in the response. No new IPC channel, no extra round-trip.

### `saveStyleToConfig` — new IPC handler

```ts
saveStyleToConfig(
  configPath: string,
  overlayType: string,
  styling: OverlayStyling,
): Promise<void>
```

Reads `config.json`, patches `overlayType` and `styling`, writes back. Follows the same pattern as `updateProjectConfigOverrides`.

### `RenderStartOpts`

`ExportTab` passes `styleState.overlayType` as `style`, resolving the existing `// TODO: derive from StyleTab` comment. No schema change needed — the field already exists.

---

## 4. VideoPane + Remotion Player

### Layout

The video area becomes a `relative` container. `<Player>` is `absolute inset-0` on top of `<video>`, both filling the same space. Player background is fully transparent — only overlay graphics are visible.

### Overlay component sourcing

`apps/renderer` is not a library package. The desktop renderer imports overlay components and `registry` directly from `apps/renderer/src` via relative imports or a path alias. Both `apps/desktop/src/renderer` and `apps/renderer/src` are browser-compiled code, so no Node.js boundary is crossed.

### Player sync

`@remotion/player` exposes a `ref` with `.seekTo(frame: number)`. The existing rAF loop in `VideoPane` already fires at ~60fps during playback. On each tick, `VideoPane` calls:

```ts
playerRef.current?.seekTo(Math.round(currentTime * fps))
```

On explicit seeks (timeline scrub, playback controls), the same call fires immediately. This keeps the overlay frame exactly in sync with the video without any additional event wiring.

### `VideoPaneProps` additions

```ts
interface VideoPaneProps {
  // existing: videoPath, fps, onTimeUpdate, onPlayingChange
  overlayType?: OverlayType
  overlayProps?: OverlayProps   // absent while timestamps are loading — Player simply not rendered
}
```

No skeleton/loading state needed: the video plays normally while overlay props are absent.

### New dependency

`apps/desktop/package.json` gains `@remotion/player` (already in the pnpm store at v4.0.434 with the React 18 variant matching the desktop app).

---

## 5. File changes summary

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `apps/desktop/src/main/ipc.ts` | `generateTimestamps` handler returns `sessionSegments`; add `saveStyleToConfig` handler |
| Modify | `apps/desktop/src/types/ipc.ts` | Add `sessionSegments` to `TimestampsResult`; add `saveStyleToConfig` to `RacedashAPI` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | Hold `styleState` + history; build `OverlayProps`; pass down; wire undo/redo keys; load/save style |
| Modify | `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx` | Add `<Player>` composited over `<video>`; sync via rAF |
| Modify | `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` | Pass `styleState` + `onStyleChange` + `onUndo` + `onRedo` to `StyleTab` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx` | Become fully controlled (no local state); emit `onStyleChange` |
| Modify | `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Accept `overlayType` prop; pass to `startRender` |
| Modify | `apps/desktop/package.json` | Add `@remotion/player` dependency |

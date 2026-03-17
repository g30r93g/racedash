# Multi-Segment Session Support Design

**Date:** 2026-03-10
**Status:** Approved

---

## Overview

Support rendering a single video that contains multiple session segments (e.g. practice then qualifying, or a full race day). Each segment has its own Alpha Timing URL, offset, and session mode. The overlay switches behaviour at segment boundaries, shows an idle/END state between segments, and displays a configurable label around each segment's start.

---

## Data Model (`@racedash/core`)

### Removed from `OverlayProps`

- `mode: SessionMode`
- `session: SessionData`
- `sessionAllLaps: Lap[][]`

### New type: `SessionSegment`

```ts
export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]   // drivers' laps for this segment only (for position/best comparisons)
  label?: string            // e.g. "Qualifying Start"; shown around segment offset
}
```

### Updated `OverlayProps`

```ts
export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number   // race segment only (first race segment found)
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  labelWindowSeconds?: number     // seconds before/after offset to show label; default 5
}
```

### Constraints

- `segments` must be ordered by offset (ascending).
- Session best and position ranking are **segment-isolated**: each segment's `sessionAllLaps` contains only that segment's data.

---

## Renderer Logic

### Segment resolution per frame

Given `currentTime`:

1. **Active segment**: the last segment whose `session.timestamps[0].ytSeconds ≤ currentTime`. Before the first segment starts, the first segment is used (overlay stays hidden until its offset).
2. **Idle/END state**: when `currentTime` is past a segment's last lap end but before the next segment starts, render the active segment's overlay in END state.
3. **Label window**:
   - `labelStart = max(segment.offset - labelWindowSeconds, prevSegment?.lastLapEnd ?? 0)`
   - `labelEnd   = segment.offset + labelWindowSeconds`
   - When `currentTime ∈ [labelStart, labelEnd]`, show `segment.label` overlaid on the END/idle state.
   - Applies to the **first** segment too (label shown around video start if configured).
   - If sessions are back-to-back (no gap), the label is only shown **after** the new segment's offset (clamp ensures no overlap with the prior session's active laps).

### New shared hook: `useActiveSegment`

**File:** `apps/renderer/src/useActiveSegment.ts`

```ts
function useActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds: number,
): {
  segment: SessionSegment
  isEnd: boolean
  label: string | null
}
```

- `segment`: the resolved active segment (its `session`, `mode`, `sessionAllLaps` are passed to child components)
- `isEnd`: true when `currentTime` is past this segment's last lap end
- `label`: non-null string when within the label window of the **next** segment (or first segment)

### Overlay style integration

Each top-level overlay component (`Banner`, `Esports`, `Minimal`, `Modern`) calls `useActiveSegment` once and passes the resolved `segment` fields down to its children — identical to the current prop shape. No child component changes required.

The `label` string, when non-null, is rendered as an overlay on top of whatever state the component already shows.

---

## CLI

### `render` command signature

```
racedash render --config <path> --video <path> --driver <name> [options]
```

**Required flags:**
- `--config <path>`: path to JSON config file
- `--video <path>`: source video file
- `--driver <name>`: partial, case-insensitive driver name match (error if unmatched or ambiguous; no interactive fallback)

**Inline single-segment shorthand** (no config file):
```
racedash render --mode <mode> --url <url> --offset <time> --video <path> --driver <name> [options]
```
Internally builds a one-item `segments` array — same code path.

**Override flags** (apply on top of config file values):
- `--style`, `--fps`, `--overlay-x`, `--overlay-y`, `--box-position`
- `--accent-color`, `--text-color`, `--timer-text-color`, `--timer-bg-color`
- `--label-window <seconds>` (default: 5)

### Config file schema

```json
{
  "segments": [
    {
      "mode": "practice",
      "url": "https://results.alphatiming.co.uk/...",
      "offset": "0:02:15.500",
      "label": "Practice Start"
    },
    {
      "mode": "qualifying",
      "url": "https://results.alphatiming.co.uk/...",
      "offset": "1:15:30.123",
      "label": "Qualifying Start"
    }
  ],
  "driver": "Surrey C",
  "accentColor": "#3DD73D"
}
```

Config file keys (`driver`, `accentColor`, etc.) are overridden by CLI flags when both are present.

### Offset parsing

Each per-segment offset supports millisecond precision (`M:SS.mmm` / `H:MM:SS.mmm`) and is snapped to the nearest frame at the given fps. Snapping is reported in the render summary stats per segment.

### Fetching

All segment URLs are fetched in parallel (`Promise.all`). Race segments additionally fetch the grid (`/grid` tab) in the same batch.

---

## Success Criteria

- [ ] `@racedash/core` `OverlayProps` updated; `mode`/`session`/`sessionAllLaps` removed
- [ ] `SessionSegment` type exported from `@racedash/core`
- [ ] `useActiveSegment` hook resolves correct segment, END state, and label for any `currentTime`
- [ ] All overlay styles (`Banner`, `Esports`, `Minimal`, `Modern`) use `useActiveSegment`
- [ ] Label is shown ±5s around segment offset, clamped to not overlap prior session's active laps
- [ ] CLI `render` accepts `--config` (multi-segment) and inline flags (single-segment)
- [ ] `--driver` is a required flag; errors cleanly on no match or ambiguous match
- [ ] Per-segment offsets support millisecond precision and snap to nearest frame
- [ ] Session best and position ranking are segment-isolated
- [ ] All existing tests pass; new tests cover `useActiveSegment` boundary cases

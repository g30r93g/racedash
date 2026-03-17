# Position Overrides Design

**Date:** 2026-03-13
**Status:** Approved

## Overview

Allow users to manually specify position counter values at given video timestamps within a race segment's config. When overrides are present, computed Alpha Timing positions are used up until the first override, then the manual step-function takes over for the remainder of the segment.

## Config Format

`positionOverrides` is an optional field on a segment config entry. It is only valid for segments with `mode: "race"`.

```json
{
  "segments": [
    {
      "mode": "race",
      "url": "https://...",
      "offset": "5:00",
      "positionOverrides": [
        { "timestamp": "6:02.345", "position": 6 },
        { "timestamp": "8:15.000", "position": 5 },
        { "timestamp": "12:30.500", "position": 4 }
      ]
    }
  ]
}
```

- `timestamp` — absolute video time in `M:SS.mmm` or `H:MM:SS.mmm` format (same reference as `offset`). Must be greater than or equal to the segment's `offset`.
- `position` — 1-based race position to display; must be an integer >= 1
- Array must be sorted ascending by timestamp (validation error if not)
- An empty array `[]` is a no-op: computed positions are used for the entire segment

## Type Changes

### `SegmentConfig` (CLI-side, `apps/cli/src/index.ts`)

```ts
interface SegmentConfig {
  mode: string
  url: string
  offset: string
  label?: string
  positionOverrides?: Array<{ timestamp: string; position: number }>
}
```

### `SessionSegment` (`packages/core/src/index.ts`)

```ts
export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]
  leaderboardDrivers?: LeaderboardDriver[]
  raceLapSnapshots?: RaceLapSnapshot[]
  label?: string
  positionOverrides?: Array<{ ytSeconds: number; position: number }>
}
```

## CLI Validation & Parsing (`apps/cli/src/index.ts` — `loadRenderConfig`)

For each segment with a non-empty `positionOverrides`:

1. Error if `mode !== 'race'`
2. Parse each `timestamp` via `parseOffset()` → `ytSeconds`
3. Error if any entry's `ytSeconds` < the segment's own offset in seconds
4. Error if entries are not sorted strictly ascending by `ytSeconds`
5. Error if any `position` value is not an integer >= 1
6. Attach resolved array to the `SessionSegment`

An empty `positionOverrides: []` passes validation silently and is stored as-is.

## Renderer Logic

### `PositionCounter` (`apps/renderer/src/styles/banner/PositionCounter.tsx`)

New prop: `positionOverrides?: Array<{ ytSeconds: number; position: number }>`

**Position resolution priority (highest to lowest):**

```
const firstOverrideTime = positionOverrides?.[0]?.ytSeconds ?? Infinity

if (positionOverrides && positionOverrides.length > 0 && currentTime >= firstOverrideTime):
  // Step-function lookup: find latest entry where ytSeconds <= currentTime.
  // If currentTime is past all entries, the last entry's position is held.
  position = last entry where entry.ytSeconds <= currentTime
else:
  // Pre-override window: existing computed/live logic unchanged.
  // Priority: livePosition > computedPosition
  position = livePosition ?? computedPosition
```

When overrides are active (`currentTime >= firstOverrideTime`), `livePosition` is bypassed entirely. The last override entry is held indefinitely until the segment ends.

### Intermediate banner components

Both banner components must thread `positionOverrides` from the segment through to `PositionCounter`. The prop is only meaningful in race mode (where `PositionCounter` is rendered), but can be passed unconditionally for simplicity:

- `apps/renderer/src/styles/banner/index.tsx` — passes `livePosition` today; add `positionOverrides={segment.positionOverrides}`
- `apps/renderer/src/styles/geometric-banner/index.tsx` — does not pass `livePosition`; add `positionOverrides={segment.positionOverrides}`

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Add `positionOverrides` to `SessionSegment` |
| `apps/cli/src/index.ts` | Add `positionOverrides` to `SegmentConfig`; add validation + parsing in `loadRenderConfig` |
| `apps/renderer/src/styles/banner/PositionCounter.tsx` | Add prop + override resolution logic |
| `apps/renderer/src/styles/banner/index.tsx` | Thread `positionOverrides` prop to `PositionCounter` |
| `apps/renderer/src/styles/geometric-banner/index.tsx` | Thread `positionOverrides` prop to `PositionCounter` |

## Data Flow

```
JSON config
  positionOverrides: [{ timestamp: "6:02.345", position: 6 }, ...]
        ↓
CLI loadRenderConfig()
  • validate: mode must be "race"
  • validate: each timestamp >= segment offset
  • validate: sorted ascending by timestamp
  • validate: each position is integer >= 1
  • parse each timestamp via parseOffset() → ytSeconds
        ↓
SessionSegment.positionOverrides: [{ ytSeconds: 362.345, position: 6 }, ...]
        ↓
banner/index.tsx or geometric-banner/index.tsx
  → passes positionOverrides={segment.positionOverrides} to PositionCounter
        ↓
PositionCounter
  • currentTime < first override → livePosition ?? computedPosition (unchanged)
  • currentTime >= first override → step-function lookup (last entry held at segment end)
```

## Constraints

- Only valid in `race` mode segments
- Config validation errors at CLI load time (not at render time)
- No interpolation — strictly a step function
- `startingGridPosition` and pre-race display window are unaffected
- No changes to leaderboard, lap timing, or other overlay components

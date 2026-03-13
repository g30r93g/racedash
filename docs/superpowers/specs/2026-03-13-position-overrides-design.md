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

- `timestamp` — absolute video time in `M:SS.mmm` or `H:MM:SS.mmm` format (same as `offset`)
- `position` — 1-based race position to display
- Array must be sorted ascending by timestamp (validation error if not)

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

For each segment with `positionOverrides`:

1. Error if `mode !== 'race'`
2. Parse each `timestamp` via `parseOffset()` → `ytSeconds`
3. Error if entries are not sorted ascending by `ytSeconds`
4. Attach resolved array to the `SessionSegment`

## Renderer Logic (`apps/renderer/src/styles/banner/PositionCounter.tsx`)

`PositionCounter` receives `positionOverrides?: Array<{ ytSeconds: number; position: number }>` as a new prop.

**Position resolution at render time:**

```
const firstOverrideTime = positionOverrides?.[0]?.ytSeconds ?? Infinity

if (currentTime >= firstOverrideTime):
  // find latest override where ytSeconds <= currentTime (linear scan — array is small)
  position = last entry where entry.ytSeconds <= currentTime
else:
  // existing computed/live logic unchanged
  position = livePosition ?? computedPosition
```

The `livePosition` prop path is unaffected — when `positionOverrides` is present and active (currentTime >= firstOverrideTime), the override takes precedence.

## Data Flow

```
JSON config
  positionOverrides: [{ timestamp: "6:02.345", position: 6 }, ...]
        ↓
CLI loadRenderConfig()
  • validate: mode must be "race"
  • validate: sorted ascending by timestamp
  • parse each timestamp via parseOffset() → ytSeconds
        ↓
SessionSegment.positionOverrides: [{ ytSeconds: 362.345, position: 6 }, ...]
        ↓
PositionCounter (via OverlayProps → segments[n] → positionOverrides)
  • currentTime < first override → computed position (Alpha Timing, unchanged)
  • currentTime >= first override → step-function lookup
```

## Constraints

- Only valid in `race` mode segments
- Config validation errors at CLI load time (not at render time)
- No interpolation — strictly a step function
- `startingGridPosition` and pre-race display window are unaffected
- No changes to leaderboard, lap timing, or other overlay components

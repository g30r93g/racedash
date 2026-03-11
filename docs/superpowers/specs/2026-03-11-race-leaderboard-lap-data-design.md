# Race Leaderboard: Lap Data Pivot

**Date:** 2026-03-11
**Status:** Approved

## Problem

The current race leaderboard derives positions from cumulative lap times scraped from the `/laptimes` page. This breaks when drivers receive spin penalties (+1L, +2L): a penalised driver runs for the full race duration but completes fewer, longer laps. Cumulative time comparisons produce incorrect orderings in these cases.

## Solution

Use the authoritative per-lap position snapshots from the Alpha Timing replay route (`/replay`), which contains a `<script type="application/json" id="lapData">` tag with one snapshot per leader lap. Each snapshot has positions, laps completed, gap to leader, and interval to car ahead pre-computed by the timing system.

## Data Source

**URL:** `<session-url>/replay`
**Tag:** `<script type="application/json" id="lapData">`
**Wire shape:** `{ laps: SnapshotEntry[][] }` — 20 arrays for a 20-lap race.

Each `SnapshotEntry` has the shape `{ C: number, D: [string, string][] }`:
- `C` — numeric platform driver ID
- `D` is an array of `[value, cssClass]` tuples. Access the value with `D[n][0]`, e.g.:
  - `D[1][0]` — current position (string integer, e.g. `"1"`)
  - `D[2][0]` — kart number (string, e.g. `"71"`)
  - `D[3][0]` — driver/team name
  - `D[4][0]` — laps completed (string integer, e.g. `"10"`)
  - `D[5][0]` — **session-elapsed** cumulative time in `"M:SS.sss"` format (e.g. `"1:09.707"`). For P1 this equals the elapsed race time at the snapshot; adding it to `offsetSeconds` (the absolute video start of the session) gives the video timestamp of the snapshot. Any value that `parseLapTimeStr` returns `null` for (empty string, no colon, non-numeric) is treated as malformed → `totalSeconds: null`.
  - `D[8][0]` — gap to leader, mapped verbatim: `"0.000"` for P1, `"1 L"`, `"6 L"` for lapped cars.
  - `D[9][0]` — interval to car directly ahead — unsigned decimal string e.g. `"0.333"`, or `""` for P1. Never prefixed with `+` or `-`.

Index 0 = pre-race state (all `lapsCompleted=0`). Index N (N ≥ 1) = after leader's Nth lap.

Entries within each snapshot are already ordered by position ascending (P1 first) by the timing system. `parseReplayLapData` preserves this order without sorting.

## Architecture

### 1. New Types — `packages/core/src/index.ts`

```ts
export interface RaceLapEntry {
  kart: string
  name: string
  position: number
  lapsCompleted: number
  gapToLeader: string      // verbatim from wire; reserved for future display use
  intervalToAhead: string  // "" for P1, otherwise unsigned decimal e.g. "0.333"
}

export interface RaceLapSnapshot {
  leaderLap: number        // 1-based (1 = after leader's first lap)
  videoTimestamp: number   // absolute seconds into video when this snapshot activates
  entries: RaceLapEntry[]  // ordered P1 → last place
}
```

`SessionSegment` gains one new optional field:
```ts
raceLapSnapshots?: RaceLapSnapshot[]
```

The `leaderboardDrivers` comment must be updated from:
```ts
leaderboardDrivers?: LeaderboardDriver[]  // drives QualifyingTable; populated for qualifying + practice
```
to:
```ts
leaderboardDrivers?: LeaderboardDriver[]  // populated for all modes; used by PositionCounter (all modes) and LeaderboardTable (qualifying + practice only)
```

`OverlayProps` does not need to change — `raceLapSnapshots` flows automatically via `segments: SessionSegment[]`.

### 2. Scraper — `packages/scraper/src/index.ts`

Both new functions are added directly to `packages/scraper/src/index.ts` (the same file as the private `fetchTab` and `parseLapTimeStr`). Both are direct named exports from that file. No existing exports change.

**`fetchReplayHtml(url: string): Promise<string>`** — exported.
Calls the private `fetchTab(url, '/replay')`.

**`parseReplayLapData(html: string): ReplayLapData`** — exported.
Extracts and parses the `lapData` JSON. Throws a descriptive error (same pattern as `parseDrivers`) if:
- the `lapData` script tag is absent, or
- the parsed JSON does not have a `laps` property that is an array.

Returns `[]` without throwing if `laps` is present but empty (`{ laps: [] }`).

Unwraps the `laps` array and returns `ReplayLapData` directly — one inner array per snapshot, preserving index 0 (pre-race) verbatim. Index-skipping is the CLI's responsibility.

Time parsing for `D[5][0]` uses the private `parseLapTimeStr` (same file) directly — no separate colon-check is needed; the existing `isNaN` guard in `parseLapTimeStr` already returns `null` for empty strings and values without a colon.

```ts
export interface ReplayLapEntry {
  driverId: number
  position: number
  kart: string
  name: string
  lapsCompleted: number
  totalSeconds: number | null  // null if parseLapTimeStr returns null for D[5][0]
  gapToLeader: string          // verbatim from D[8][0]
  intervalToAhead: string      // unsigned decimal or "" for P1; from D[9][0]
}

// Index 0 = pre-race; index N (N ≥ 1) = after leader's Nth lap
export type ReplayLapData = ReplayLapEntry[][]
```

Both `ReplayLapEntry` and `ReplayLapData` are exported as direct named exports from `packages/scraper/src/index.ts`.

### 3. CLI — `apps/cli/src/index.ts`

For race segments, the replay fetch is added to the existing parallel `Promise.all` block alongside the laptimes and grid fetches. If `fetchReplayHtml` or `parseReplayLapData` throws, it rejects the whole `Promise.all` and the CLI exits with an error.

Import `RaceLapEntry` and `RaceLapSnapshot` from `@racedash/core` (consistent with how `LeaderboardDriver`, `SessionSegment`, etc. are already imported).

**New `buildRaceLapSnapshots(replayData: ReplayLapData, offsetSeconds: number): RaceLapSnapshot[]`**

`offsetSeconds` is `snappedOffsets[i]` for the segment being processed.

Steps:
1. Iterate snapshots starting from index 1 (skip index 0)
2. For each snapshot, find the P1 entry (`entry.position === 1`)
3. If P1's `totalSeconds` is `null`: skip this snapshot entirely
4. `videoTimestamp = offsetSeconds + totalSeconds`
5. Map each `ReplayLapEntry` → `RaceLapEntry` (direct field mapping; omit `totalSeconds` and `driverId`)
6. Return the collected `RaceLapSnapshot[]`

If the returned array is empty, the CLI emits a warning to stderr but does not exit — `raceLapSnapshots: []` is attached and the table renders nothing until data is available.

```ts
segments.push({
  mode,
  session,
  sessionAllLaps: ...,
  leaderboardDrivers: buildRaceDrivers(...),  // always populated for race; used by PositionCounter
  raceLapSnapshots: buildRaceLapSnapshots(replayData, snappedOffsets[i]),
  label: sc.label,
})
```

### 4. Renderer — `leaderboard.ts`

**`buildLeaderboard()` signature:**
```ts
export function buildLeaderboard(
  drivers: LeaderboardDriver[],
  currentTime: number,
  mode: LeaderboardMode,
  ourKart?: string,
  raceLapSnapshots?: RaceLapSnapshot[],
): RankedDriver[]
```

This is a backwards-compatible change (optional 5th parameter). The two existing call sites are:
- `LeaderboardTable.tsx` line 35 — updated in Section 5 to pass `raceLapSnapshots`
- `banner/index.tsx` line 37 — must **not** receive `raceLapSnapshots`; see Section 6

**Race mode branching:**
- `raceLapSnapshots` is `undefined` → fall back to `buildRaceLeaderboard()`.
- `raceLapSnapshots` is present (including `[]`) → snapshot path only; no fallback.

**Snapshot path:**

`ourKart` is not used for ordering — order is taken verbatim from the timing system. `ourKart` is still needed downstream by `selectWindow()`.

Find the last snapshot where `videoTimestamp <= currentTime`. If none found, return `[]`.

Iterate entries by index `i` (0-based). The car directly ahead is `entries[i-1]` (array predecessor = position predecessor since order is preserved P1-first).

Construct each `RankedDriver` as an exhaustive object literal (not a spread):
```ts
{
  kart: entry.kart,
  name: entry.name,
  timestamps: [],        // intentionally empty; no code path reads timestamps from RankedDriver in race mode
  position: entry.position,
  best: Infinity,
  lapsCompleted: entry.lapsCompleted,
  cumulativeTime: 0,
  interval: /* see below */,
}
```

`interval` derivation:
- `entry.position === 1` → `null`
- `entry.lapsCompleted < entries[i-1].lapsCompleted` → `"+${lapDiff}L"`
- `entry.lapsCompleted === entries[i-1].lapsCompleted`:
  - `entry.intervalToAhead` non-empty → `"+" + entry.intervalToAhead`
  - `entry.intervalToAhead === ""` (malformed non-P1 data) → `"+0.000"` as a safe fallback
- `entry.lapsCompleted > entries[i-1].lapsCompleted` → impossible in well-formed data; `"+0.000"` defensively

Output format matches `formatInterval()` exactly. Implemented inline. Any future changes to interval format conventions must be applied to both places.

### 5. Renderer — `LeaderboardTable.tsx`

New optional prop:
```ts
raceLapSnapshots?: RaceLapSnapshot[]
```

Updated `useMemo`:
```ts
const leaderboard = useMemo(
  () => buildLeaderboard(leaderboardDrivers, currentTime, mode, ourKart, raceLapSnapshots),
  [leaderboardDrivers, currentTime, mode, ourKart, raceLapSnapshots],
)
```

Pass `segment.raceLapSnapshots` directly from call sites — do not wrap in a `useMemo` wrapper. The segment props object is stable across Remotion frames.

### 6. Style Components — banner, esports, minimal, modern

**`banner/index.tsx` requires two changes:**

**Change 1 — `livePosition` memo guard (required to avoid a performance regression):**

Previously `leaderboardDrivers` was `null` for race segments, so `showTable` was `false` and `livePosition` returned `null` without computing. After this change, `leaderboardDrivers` is always populated for race, so `showTable` becomes `true` for race — and the existing `livePosition` memo would call `buildRaceLeaderboard()` on every frame for no purpose (the result is never displayed in race mode since `showTimePanels` is `false`).

Fix: add a mode guard to the `livePosition` memo:
```ts
// Live position from the qualifying table leaderboard (qualifying/practice only).
const livePosition = useMemo<number | null>(() => {
  if (!showTable || mode === 'race') return null   // ← add "|| mode === 'race'"
  const leaderboard = buildLeaderboard(segment.leaderboardDrivers!, currentTime, mode)
  return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
}, [showTable, mode, segment.leaderboardDrivers, currentTime, session.driver.kart])
```

**Change 2 — pass `raceLapSnapshots` to both `LeaderboardTable` call sites:**

`banner/index.tsx` contains two separate `LeaderboardTable` renders — one inside the `showTimePanels` branch (qualifying/practice layout) and one in the race layout. Both must receive `raceLapSnapshots`:
```tsx
<LeaderboardTable
  leaderboardDrivers={segment.leaderboardDrivers!}
  ourKart={ourKart}
  mode={segment.mode}
  fps={fps}
  raceLapSnapshots={segment.raceLapSnapshots}
  {/* ...other existing props */}
/>
```

**esports, minimal, modern** — each needs only the `raceLapSnapshots` prop added to their `LeaderboardTable` call. No `livePosition` equivalent exists in those components.

The existing `showTable = segment.leaderboardDrivers != null` guard is unchanged; it continues to work because `leaderboardDrivers` is always populated for race segments.

## What Does Not Change

- `PositionCounter` — continues using timing-based `leaderboardDrivers`
- `selectWindow()` — unchanged; still consumes `RankedDriver[]`
- `formatDelta()`, `formatInterval()` — unchanged
- Qualifying/practice leaderboard logic — entirely untouched
- Config file format — `raceLapSnapshots` is built at render time; no new config fields required

## Testing

**`parseReplayLapData`** — unit tests with a fixture HTML file containing a minimal `lapData` JSON:
- `D[n][0]` tuple indexing used correctly
- `totalSeconds` parsed from `"1:09.707"` → `69.707`
- `totalSeconds` is `null` for empty string; `null` for string without colon (via `parseLapTimeStr`'s `isNaN` guard)
- Index 0 preserved verbatim in output
- `{ laps: [] }` → returns `[]` without throwing
- Throws descriptive error when `lapData` script tag is absent
- Throws descriptive error when JSON lacks a `laps` array

**`buildRaceLapSnapshots`** — unit tests covering:
- `videoTimestamp = offsetSeconds + totalSeconds`
- Snapshot with P1 `totalSeconds: null` is skipped
- Index 0 not emitted
- All snapshots having `null` P1 `totalSeconds` → returns `[]`

**`buildLeaderboard` (race + snapshots)** — unit tests covering:
- Snapshot selected at exact `videoTimestamp === currentTime` (inclusive boundary)
- `currentTime` before first snapshot → returns `[]`
- Interval: same lap → `"+0.333"`
- Interval: lapped by 1 → `"+1L"`
- Interval: lapped by multiple → `"+NL"`
- Interval: `intervalToAhead === ""` for non-P1 → `"+0.000"`
- P1 check uses `entry.position === 1`, not `i === 0`
- `raceLapSnapshots: undefined` → falls back to timing path
- `raceLapSnapshots: []` → returns `[]`, does not fall back
- `ourKart` has no effect on ordering in snapshot path

**Existing tests** — all pass without modification.

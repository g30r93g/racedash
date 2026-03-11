# Race Leaderboard Table — Design Spec

**Date:** 2026-03-11

## Overview

Extend the existing qualifying/practice standings table to support race sessions. A unified `LeaderboardTable` component replaces `QualifyingTable`, driven by a shared `buildLeaderboard` function that branches on session mode. The race table appears after our driver completes their first lap and shows live race positions derived from laptimes data.

---

## 1. Data Layer (CLI)

`buildQualifyingDrivers` in `apps/cli/src/index.ts` is called for **all three modes** (`qualifying`, `practice`, `race`). The alignment logic (relative to session end) is identical and produces valid `QualifyingDriver[]` for race. The `qualifyingDrivers` field on `SessionSegment` is therefore always populated.

No changes to `@racedash/core` types are required.

---

## 2. Leaderboard Module (`leaderboard.ts`)

`qualifying.ts` is renamed to `leaderboard.ts`. `QualifyingTable.tsx` is renamed to `LeaderboardTable.tsx`.

### `RankedDriver`

```ts
export interface RankedDriver extends QualifyingDriver {
  position: number
  best: number          // best completed lap time in seconds (qualifying/practice)
  lapsCompleted: number // number of completed laps (race; also populated for qual/practice)
  cumulativeTime: number // sum of completed lap times (race; also populated for qual/practice)
}
```

### `buildLeaderboard(drivers, currentTime, mode)`

- **qualifying / practice**: rank by `best` ascending. Exclude drivers with 0 completed laps.
- **race**: rank by `lapsCompleted` descending, then `cumulativeTime` ascending. Exclude drivers with 0 completed laps.

All fields (`best`, `lapsCompleted`, `cumulativeTime`) are computed for all modes.

### `selectWindow(leaderboard, ourKart, mode)`

Mode param added; behaviour diverges:

| Mode | Our driver in top 10 | Our driver P11+ |
|---|---|---|
| qualifying / practice | top 4 (existing logic unchanged) | existing: P1 + window of 3 |
| race | positions 1–10 | P1 + 5 directly above + our driver + 3 directly below = 10 rows |

A **visual separator** is inserted between P1 and the window block when P1 is non-adjacent (i.e. there is a gap in positions between P1 and the top of the window).

---

## 3. Time Column Display

| Context | Time column |
|---|---|
| Qualifying / practice P1 | Best lap time e.g. `0:45.123` |
| Qualifying / practice others | Gap to P1 e.g. `+0.456` |
| Race P1 | Literal text `Interval` |
| Race others — same lap count as leader | Interval to car directly ahead e.g. `+4.123` |
| Race others — laps behind leader | `+1L`, `+2L` etc. |

"Interval" means the gap to the car directly ahead in the actual race standings (not the visible window).

---

## 4. `LeaderboardTable` Component

Props:

```ts
interface LeaderboardTableProps {
  qualifyingDrivers: QualifyingDriver[]
  ourKart: string
  mode: SessionMode          // 'qualifying' | 'practice' | 'race'
  fps: number
  accentColor?: string
  position?: BoxPosition
  anchorTop?: number
}
```

**Appearance gate for race:** the table renders only once our driver's kart appears in the leaderboard (i.e. has ≥1 completed lap). If our kart is absent from the leaderboard and mode is `race`, return `null` rather than the fallback top-N rows.

---

## 5. Overlay Styles

All four styles (`banner`, `esports`, `minimal`, `modern`) pass `segment.mode` to `LeaderboardTable`. The `showQualTable` guard in each style expands from `qualifying | practice` to include `race`.

---

## 6. Tests

- `leaderboard.test.ts` (renamed from `qualifying.test.ts`): existing tests updated for new function signatures; new tests for:
  - `buildLeaderboard` race mode (laps-completed ranking, tiebreak by cumulative time)
  - `selectWindow` race mode (top-10, P11+ window, separator logic)
  - Interval gap calculation (same laps, laps behind)

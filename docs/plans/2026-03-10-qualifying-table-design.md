# Live Qualifying Table Design

**Date:** 2026-03-10
**Status:** Approved

---

## Overview

A new `QualifyingTable` component that replays the qualifying/practice leaderboard as it would have appeared on the pit wall during the session. The table updates only when a driver completes a lap and new information is available — no live countdown. Applies to `mode === 'qualifying'` and `mode === 'practice'`.

---

## Data Model (`@racedash/core`)

### New type: `QualifyingDriver`

```ts
export interface QualifyingDriver {
  kart: string
  name: string
  timestamps: LapTimestamp[]   // absolute ytSeconds for each lap start
}
```

### Updated `OverlayProps`

```ts
qualifyingDrivers?: QualifyingDriver[]   // all drivers; populated for qualifying + practice
```

No other type changes. Existing `sessionAllLaps` is unchanged.

---

## Timing Derivation (CLI layer)

The `/result` tab is not needed. `sum(driver.laps)` from `/laptimes` equals the "Time" column, so the existing `parseDrivers` scrape is sufficient.

Computed in `apps/cli` after scraping, before passing to the compositor:

```ts
const ourTotalTime = session.laps.reduce((s, l) => s + l.lapTime, 0)
const sessionEnd = offsetSeconds + ourTotalTime

const qualifyingDrivers: QualifyingDriver[] = allDrivers.map(driver => {
  const driverStart = sessionEnd - driver.laps.reduce((s, l) => s + l.lapTime, 0)
  let ytSeconds = driverStart
  const timestamps = driver.laps.map(lap => {
    const ts = { lap, ytSeconds }
    ytSeconds += lap.lapTime
    return ts
  })
  return { kart: driver.kart, name: driver.name, timestamps }
})
```

Only computed when `mode === 'qualifying' || mode === 'practice'`.

**Known limitation:** if a driver's `sum(laps)` diverges from their true session time (e.g. partial/invalid laps), their absolute start offset will drift. Acceptable for now.

---

## `QualifyingTable` Component

**File:** `apps/renderer/src/components/shared/QualifyingTable.tsx`

### Per-frame leaderboard computation

A driver appears in the leaderboard only once they have at least one completed lap at `currentTime`. Best lap = minimum `lapTime` from all laps where `ts.ytSeconds + ts.lap.lapTime <= currentTime`.

```ts
function buildLeaderboard(drivers: QualifyingDriver[], currentTime: number): RankedDriver[] {
  return drivers
    .map(d => {
      const best = Math.min(...d.timestamps
        .filter(ts => ts.ytSeconds + ts.lap.lapTime <= currentTime)
        .map(ts => ts.lap.lapTime))
      return best === Infinity ? null : { ...d, best }
    })
    .filter(Boolean)
    .sort((a, b) => a.best - b.best)
    .map((d, i) => ({ ...d, position: i + 1 }))
}
```

Wrapped in `useMemo` keyed to `currentTime`. Stable across most frames since the leaderboard only changes at lap-completion boundaries.

### 4-row window selection

P1 is always pinned at row 1. The remaining 3 rows are a window around `--driver`:

| Our driver position | Rows shown |
|---|---|
| P1 | [P1=our driver, P2, P3, P4] |
| P2 | [P1, P2=our driver, P3, P4] |
| P3..P(n-1) | [P1, P(n-1), Pn=our driver, P(n+1)] — visual separator between P1 and window |
| Last | [P1, P(n-2), P(n-1), Pn=our driver] |

A visual separator is shown between P1 and the window rows when P1 is not adjacent to our driver (i.e. our driver is P3 or lower).

### Table columns

```
| position | kart | driver name | lap time |
```

- **P1 row:** lap time shows absolute best (e.g. `1:44.123`)
- **All other rows:** lap time shows delta to P1 (e.g. `+0.456`)
- **Our driver's row:** highlighted with accent colour

---

## Integration

Each overlay style (`esports`, `minimal`, `modern`, `banner`) renders `<QualifyingTable>` alongside existing panels when `mode === 'qualifying' || mode === 'practice'` and `qualifyingDrivers` is present.

The component is self-contained — styles pass `qualifyingDrivers`, `ourDriverKart`, and styling props (accent colour, scale factor). No changes to child components of each style are required beyond adding the `<QualifyingTable>` call.

---

## Success Criteria

- [ ] `QualifyingDriver` type exported from `@racedash/core`
- [ ] `OverlayProps.qualifyingDrivers` optional field added
- [ ] CLI computes `qualifyingDrivers` for qualifying and practice modes
- [ ] `buildLeaderboard` correctly returns only drivers with at least one completed lap at `currentTime`
- [ ] 4-row window correctly handles P1, P2, middle, and last-place edge cases
- [ ] Visual separator shown between P1 and window when not adjacent
- [ ] Our driver's row highlighted with accent colour
- [ ] P1 shows absolute time; all other rows show `+delta`
- [ ] Component integrated into all four overlay styles
- [ ] Existing tests pass; new tests cover `buildLeaderboard` and window selection edge cases

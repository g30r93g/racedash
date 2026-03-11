# Race Leaderboard Table Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live race standings table (up to 10 rows) after the first completed lap, built on a unified leaderboard abstraction shared with qualifying/practice.

**Architecture:** Rename `qualifying.ts` → `leaderboard.ts` and extend it to handle race mode (rank by laps-completed desc, cumulative-time asc). Add an `interval` field to `RankedDriver` for the time column. Rename `QualifyingTable` → `LeaderboardTable` with a `mode` prop that switches display. Populate `qualifyingDrivers` for race in the CLI.

**Tech Stack:** TypeScript, React, Remotion, Vitest

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Rename + modify | `apps/renderer/src/leaderboard.ts` (was `qualifying.ts`) | All leaderboard logic for qualifying, practice, race |
| Rename + modify | `apps/renderer/src/leaderboard.test.ts` (was `qualifying.test.ts`) | Tests for all leaderboard functions |
| Rename + modify | `apps/renderer/src/components/shared/LeaderboardTable.tsx` (was `QualifyingTable.tsx`) | Unified table component with mode-aware time column |
| Modify | `apps/cli/src/index.ts` | Populate `qualifyingDrivers` for race segments |
| Modify | `apps/renderer/src/styles/banner/index.tsx` | Use `LeaderboardTable`, expand `showTable` guard to race |
| Modify | `apps/renderer/src/styles/esports/index.tsx` | Same |
| Modify | `apps/renderer/src/styles/minimal/index.tsx` | Same |
| Modify | `apps/renderer/src/styles/modern/index.tsx` | Same |
| Modify | `apps/renderer/src/registry.ts` | Increase canvas heights for 10-row table |

---

## Chunk 1: Leaderboard Module

### Task 1: Rename qualifying files and extend `RankedDriver`

**Files:**
- Rename: `apps/renderer/src/qualifying.ts` → `apps/renderer/src/leaderboard.ts`
- Rename: `apps/renderer/src/qualifying.test.ts` → `apps/renderer/src/leaderboard.test.ts`

- [ ] **Step 1: Git-rename both files**

```bash
git mv apps/renderer/src/qualifying.ts apps/renderer/src/leaderboard.ts
git mv apps/renderer/src/qualifying.test.ts apps/renderer/src/leaderboard.test.ts
```

- [ ] **Step 2: Update the import in `leaderboard.test.ts`**

In `leaderboard.test.ts`, change:
```ts
import { buildLeaderboard, selectWindow, formatDelta } from './qualifying'
```
to:
```ts
import { buildLeaderboard, selectWindow, formatDelta } from './leaderboard'
```

- [ ] **Step 3: Run existing tests to confirm they still pass after the rename**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```
Expected: all existing tests pass.

- [ ] **Step 4: Extend `RankedDriver` in `leaderboard.ts`**

Replace the current `RankedDriver` interface with:

```ts
export type LeaderboardMode = 'qualifying' | 'practice' | 'race'

export interface RankedDriver extends QualifyingDriver {
  position: number
  best: number           // best completed lap time (qualifying/practice); Infinity if none
  lapsCompleted: number  // total completed laps at currentTime
  cumulativeTime: number // sum of completed lap times
  interval: string | null // pre-computed time column string; null for P1
}
```

- [ ] **Step 5: Update `buildLeaderboard` signature (qualifying/practice path)**

Add `mode: LeaderboardMode` parameter. For qualifying/practice the logic is the same as before, but also compute `lapsCompleted`, `cumulativeTime`, and `interval` on each entry.

Replace `buildLeaderboard` in `leaderboard.ts` with:

```ts
export function buildLeaderboard(
  drivers: QualifyingDriver[],
  currentTime: number,
  mode: LeaderboardMode,
): RankedDriver[] {
  if (mode === 'race') return buildRaceLeaderboard(drivers, currentTime)

  // qualifying / practice: rank by best lap time
  const ranked: RankedDriver[] = []
  for (const d of drivers) {
    let best = Infinity
    let lapsCompleted = 0
    let cumulativeTime = 0
    for (const ts of d.timestamps) {
      if (ts.ytSeconds + ts.lap.lapTime <= currentTime) {
        lapsCompleted++
        cumulativeTime += ts.lap.lapTime
        if (ts.lap.lapTime < best) best = ts.lap.lapTime
      }
    }
    if (best !== Infinity) {
      ranked.push({ ...d, best, lapsCompleted, cumulativeTime, position: 0, interval: null })
    }
  }
  ranked.sort((a, b) => a.best - b.best)
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].position = i + 1
    ranked[i].interval = i === 0 ? null : formatDelta(ranked[i].best, ranked[0].best)
  }
  return ranked
}
```

- [ ] **Step 6: Run tests — expect them to still pass**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```

- [ ] **Step 7: Commit the rename + RankedDriver extension**

```bash
git add apps/renderer/src/leaderboard.ts apps/renderer/src/leaderboard.test.ts
git commit -m "refactor(renderer): rename qualifying → leaderboard, extend RankedDriver"
```

---

### Task 2: Implement race leaderboard + `formatInterval`

**Files:**
- Modify: `apps/renderer/src/leaderboard.ts`
- Modify: `apps/renderer/src/leaderboard.test.ts`

- [ ] **Step 1: Write failing tests for `buildLeaderboard` race mode**

Add to `leaderboard.test.ts`:

```ts
// --- Race leaderboard tests ---
// Same drivers, but now treated as a race.
// A starts at t=0, B at t=5, C at t=10 (same timestamps as above).
// In a race: rank by laps completed desc, then cumulative time asc.

describe('buildLeaderboard (race mode)', () => {
  it('returns empty array before any driver completes a lap', () => {
    expect(buildLeaderboard(DRIVERS, 60.0, 'race')).toEqual([])
  })

  it('includes only drivers with at least one completed lap', () => {
    // At t=65, only A has completed lap 1 (ends at 62.0)
    const lb = buildLeaderboard(DRIVERS, 65.0, 'race')
    expect(lb).toHaveLength(1)
    expect(lb[0].kart).toBe('1')
    expect(lb[0].lapsCompleted).toBe(1)
    expect(lb[0].cumulativeTime).toBeCloseTo(62.0)
  })

  it('ranks by laps completed descending', () => {
    // At t=100: A has 1 lap (ends 62.0), B has 1 lap (ends 66.5)
    // A has lower cumulative, so A leads
    const lb = buildLeaderboard(DRIVERS, 100.0, 'race')
    expect(lb[0].kart).toBe('1') // A: 1 lap, 62.0s
    expect(lb[1].kart).toBe('2') // B: 1 lap, 66.5s
  })

  it('tiebreaks equal lap counts by cumulative time ascending', () => {
    // At t=130: A laps 1+2 (ends 62+61=123.0), B laps 1+2 (ends 66.5+59.5=126.0), C lap 1 (ends 73.0)
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    expect(lb[0].kart).toBe('1') // A: 2 laps, 123.0s cumulative
    expect(lb[1].kart).toBe('2') // B: 2 laps, 126.0s cumulative
    expect(lb[2].kart).toBe('3') // C: 1 lap, 63.0s cumulative (lapped)
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'race')
    expect(lb.map(d => d.position)).toEqual([1, 2, 3])
  })

  it('P1 interval is null', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'race')
    expect(lb[0].interval).toBeNull()
  })

  it('P2 interval shows gap to P1 in seconds when same laps', () => {
    // At t=130: A 2 laps 123.0s, B 2 laps 126.0s
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    // B interval = B cumulative - A cumulative = 126.0 - 123.0 = 3.0
    expect(lb[1].interval).toBe('+3.000')
  })

  it('shows "+NL" when a driver is laps behind the car ahead', () => {
    // At t=130: C has 1 lap, B has 2 laps → C is 1 lap behind B
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    expect(lb[2].interval).toBe('+1L')
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```
Expected: the new `buildLeaderboard (race mode)` tests fail.

- [ ] **Step 3: Add dedicated `formatInterval` unit tests to `leaderboard.test.ts`**

Add before the `buildLeaderboard (race mode)` describe block:

```ts
describe('formatInterval', () => {
  function makeEntry(lapsCompleted: number, cumulativeTime: number): RankedDriver {
    return { kart: 'X', name: 'X', timestamps: [], best: Infinity, lapsCompleted, cumulativeTime, position: 0, interval: null }
  }

  it('same lap count: returns time gap with + prefix and 3 decimals', () => {
    const current = makeEntry(5, 126.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+3.000')
  })

  it('one lap behind: returns "+1L"', () => {
    const current = makeEntry(4, 200.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+1L')
  })

  it('two laps behind: returns "+2L"', () => {
    const current = makeEntry(3, 180.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+2L')
  })

  it('clamps to +0.000 if current cumulative is somehow less than ahead (defensive)', () => {
    const current = makeEntry(5, 120.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+0.000')
  })
})
```

- [ ] **Step 4: Implement `buildRaceLeaderboard` and `formatInterval` in `leaderboard.ts`**

Add after the existing `formatDelta` function:

```ts
/** Format interval to car directly ahead. Same laps → "+X.XXX". Laps behind → "+NL". */
export function formatInterval(current: RankedDriver, ahead: RankedDriver): string {
  const lapDiff = ahead.lapsCompleted - current.lapsCompleted
  if (lapDiff > 0) return `+${lapDiff}L`
  const timeDiff = Math.max(0, current.cumulativeTime - ahead.cumulativeTime)
  return `+${timeDiff.toFixed(3)}`
}

function buildRaceLeaderboard(drivers: QualifyingDriver[], currentTime: number): RankedDriver[] {
  const ranked: RankedDriver[] = []

  for (const d of drivers) {
    let lapsCompleted = 0
    let cumulativeTime = 0
    for (const ts of d.timestamps) {
      if (ts.ytSeconds + ts.lap.lapTime <= currentTime) {
        lapsCompleted++
        cumulativeTime = Math.round((cumulativeTime + ts.lap.lapTime) * 1000) / 1000
      }
    }
    if (lapsCompleted > 0) {
      ranked.push({ ...d, best: Infinity, lapsCompleted, cumulativeTime, position: 0, interval: null })
    }
  }

  ranked.sort((a, b) =>
    b.lapsCompleted !== a.lapsCompleted
      ? b.lapsCompleted - a.lapsCompleted
      : a.cumulativeTime - b.cumulativeTime,
  )

  for (let i = 0; i < ranked.length; i++) {
    ranked[i].position = i + 1
    ranked[i].interval = i === 0 ? null : formatInterval(ranked[i], ranked[i - 1])
  }

  return ranked
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/leaderboard.ts apps/renderer/src/leaderboard.test.ts
git commit -m "feat(renderer): add race leaderboard logic and formatInterval"
```

---

### Task 3: Update `selectWindow` for race mode

**Files:**
- Modify: `apps/renderer/src/leaderboard.ts`
- Modify: `apps/renderer/src/leaderboard.test.ts`

- [ ] **Step 1: Write failing tests for `selectWindow` race mode**

Add to `leaderboard.test.ts`:

```ts
// Build a 15-driver leaderboard for window tests (race mode)
function makeRaceLb(count: number): RankedDriver[] {
  return Array.from({ length: count }, (_, i) => ({
    kart: String(i + 1),
    name: `Driver ${i + 1}`,
    timestamps: [],
    best: Infinity,
    lapsCompleted: 10 - Math.floor(i / 5), // rough lap buckets
    cumulativeTime: 100 + i * 3,
    position: i + 1,
    interval: i === 0 ? null : `+${(i * 3).toFixed(3)}`,
  }))
}

describe('selectWindow (race mode)', () => {
  const lb15 = makeRaceLb(15)

  it('driver in top 10: returns positions 1-10', () => {
    const rows = selectWindow(lb15, '5', 'race')
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('driver at P10: still returns top 10', () => {
    const rows = selectWindow(lb15, '10', 'race')
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('driver at P11: P1 + P6..P10 + P11 + P12..P14 = 10 rows', () => {
    const rows = selectWindow(lb15, '11', 'race')
    expect(rows.map(d => d.position)).toEqual([1, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it('driver at P15 (last): P1 + P10..P14 + P15 + [] = 7 rows (fewer than 3 below)', () => {
    const rows = selectWindow(lb15, '15', 'race')
    expect(rows.map(d => d.position)).toEqual([1, 10, 11, 12, 13, 14, 15])
  })

  it('returns empty when our kart not in leaderboard (race gate)', () => {
    const rows = selectWindow(lb15, 'UNKNOWN', 'race')
    expect(rows).toEqual([])
  })

  it('leaderboard of exactly 10: returns all', () => {
    const lb10 = makeRaceLb(10)
    const rows = selectWindow(lb10, '10', 'race')
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```

- [ ] **Step 3: Update `selectWindow` in `leaderboard.ts` to accept mode**

```ts
export function selectWindow(
  leaderboard: RankedDriver[],
  ourKart: string,
  mode: LeaderboardMode = 'qualifying',
): RankedDriver[] {
  if (leaderboard.length === 0) return []

  if (mode === 'race') {
    const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)
    if (ourIdx === -1) return []
    // Within top 10: show 1-10
    if (ourIdx < 10) return leaderboard.slice(0, Math.min(10, leaderboard.length))
    // P11+: P1 + 5 above + our driver + 3 below
    const above = leaderboard.slice(Math.max(1, ourIdx - 5), ourIdx)
    const below = leaderboard.slice(ourIdx + 1, ourIdx + 4)
    return [leaderboard[0], ...above, leaderboard[ourIdx], ...below]
  }

  // qualifying / practice: existing 4-row logic
  const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)
  if (ourIdx <= 0) return leaderboard.slice(0, Math.min(4, leaderboard.length))

  const last = leaderboard.length - 1
  let windowStart = Math.max(1, ourIdx - 1)
  let windowEnd = Math.min(last, ourIdx + 1)
  while (windowEnd - windowStart < 2) {
    if (windowStart > 1) windowStart--
    else if (windowEnd < last) windowEnd++
    else break
  }
  return [leaderboard[0], ...leaderboard.slice(windowStart, windowEnd + 1)]
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd apps/renderer && npx vitest run leaderboard.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/leaderboard.ts apps/renderer/src/leaderboard.test.ts
git commit -m "feat(renderer): add race-mode selectWindow (10-row, P11+ window)"
```

---

## Chunk 2: LeaderboardTable Component

### Task 4: Rename QualifyingTable → LeaderboardTable with mode-aware time column

**Files:**
- Rename: `apps/renderer/src/components/shared/QualifyingTable.tsx` → `LeaderboardTable.tsx`

- [ ] **Step 1: Git-rename the file**

```bash
git mv apps/renderer/src/components/shared/QualifyingTable.tsx \
       apps/renderer/src/components/shared/LeaderboardTable.tsx
```

- [ ] **Step 2: Replace the file contents**

The new `LeaderboardTable.tsx` differs from `QualifyingTable.tsx` in:
1. Imports `buildLeaderboard`, `selectWindow`, `LeaderboardMode` from `../../leaderboard` (not `../../qualifying`)
2. Props gain `mode: LeaderboardMode`
3. Time column display branches on `mode`
4. Race P1 shows literal `"Interval"` text
5. Race non-P1 shows `row.interval` (pre-computed gap string from the leaderboard)
6. The separator check `rows[1].position > 2` works unchanged for both modes

Full file:

```tsx
import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { BoxPosition, QualifyingDriver } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { buildLeaderboard, selectWindow, LeaderboardMode } from '../../leaderboard'
import { fontFamily } from '../../Root'

interface LeaderboardTableProps {
  qualifyingDrivers: QualifyingDriver[]
  ourKart: string
  mode: LeaderboardMode
  fps: number
  accentColor?: string
  position?: BoxPosition
  /** Anchor top in 1920-reference pixels; overrides vertical position from `position` */
  anchorTop?: number
}

export const LeaderboardTable = React.memo(function LeaderboardTable({
  qualifyingDrivers,
  ourKart,
  mode,
  fps,
  accentColor = '#3DD73D',
  position = 'bottom-right',
  anchorTop,
}: LeaderboardTableProps) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920

  const currentTime = frame / fps

  const leaderboard = useMemo(
    () => buildLeaderboard(qualifyingDrivers, currentTime, mode),
    [qualifyingDrivers, currentTime, mode],
  )

  const rows = useMemo(
    () => selectWindow(leaderboard, ourKart, mode),
    [leaderboard, ourKart, mode],
  )

  if (rows.length === 0) return null

  const p1Time = rows[0].best
  const hasSeparator = rows.length > 1 && rows[1].position > 2

  const vPos = anchorTop !== undefined
    ? { top: anchorTop * sc }
    : position.startsWith('top') ? { top: 20 * sc } : { bottom: 20 * sc }
  const hPos = position.endsWith('left') ? { left: 20 * sc } : { right: 20 * sc }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    ...vPos,
    ...hPos,
    width: 360 * sc,
    fontFamily,
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <div style={containerStyle}>
      {rows.map((row, i) => {
        const isOurs = row.kart === ourKart
        const isP1 = row.position === 1
        const showSeparator = hasSeparator && i === 1

        let lapDisplay: string
        if (mode === 'race') {
          lapDisplay = isP1 ? 'Interval' : (row.interval ?? '')
        } else {
          lapDisplay = isP1 ? formatLapTime(p1Time) : (row.interval ?? '')
        }

        return (
          <React.Fragment key={row.kart}>
            {showSeparator && (
              <div style={{ height: 1 * sc, background: 'rgba(255,255,255,0.15)', margin: `${3 * sc}px 0` }} />
            )}
            <TableRow
              position={row.position}
              kart={row.kart}
              name={row.name}
              lapDisplay={lapDisplay}
              isOurs={isOurs}
              isP1={isP1}
              accentColor={accentColor}
              sc={sc}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
})

interface TableRowProps {
  position: number
  kart: string
  name: string
  lapDisplay: string
  isOurs: boolean
  isP1: boolean
  accentColor: string
  sc: number
}

const TableRow = React.memo(function TableRow({
  position, kart, name, lapDisplay, isOurs, isP1, accentColor, sc,
}: TableRowProps) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8 * sc,
    padding: `${6 * sc}px ${10 * sc}px`,
    background: isOurs
      ? `linear-gradient(${accentColor}30, ${accentColor}30), rgba(0,0,0,0.82)`
      : 'rgba(0,0,0,0.65)',
    borderLeft: isOurs ? `3px solid ${accentColor}` : '3px solid transparent',
    backdropFilter: 'blur(8px)',
    marginBottom: 2 * sc,
  }

  return (
    <div style={rowStyle}>
      <span style={{ width: 22 * sc, fontSize: 11 * sc, fontWeight: 700, color: isP1 ? accentColor : 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
        P{position}
      </span>
      <span style={{ width: 28 * sc, fontSize: 11 * sc, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        {kart}
      </span>
      <span style={{ flex: 1, fontSize: 12 * sc, fontWeight: isOurs ? 700 : 400, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ fontSize: 13 * sc, fontWeight: 600, color: isP1 ? accentColor : 'rgba(255,255,255,0.8)', letterSpacing: 0.5 * sc, flexShrink: 0 }}>
        {lapDisplay}
      </span>
    </div>
  )
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/shared/LeaderboardTable.tsx
git commit -m "feat(renderer): rename QualifyingTable → LeaderboardTable, add race mode display"
```

---

## Chunk 3: CLI, Styles, and Registry

### Task 5: Populate `qualifyingDrivers` for race in CLI

**Files:**
- Modify: `apps/cli/src/index.ts`

One line change at line ~279. Replace:

```ts
qualifyingDrivers: (mode === 'qualifying' || mode === 'practice')
  ? buildQualifyingDrivers(allDrivers, driver.kart, offsetSeconds)
  : undefined,
```

with:

```ts
qualifyingDrivers: buildQualifyingDrivers(allDrivers, driver.kart, offsetSeconds),
```

The `buildQualifyingDrivers` function aligns all drivers relative to the session end — the same logic works for race.

- [ ] **Step 1: Apply the change**

In `apps/cli/src/index.ts`, make the replacement above.

- [ ] **Step 2: Build to check no TypeScript errors**

```bash
cd apps/cli && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): populate qualifyingDrivers for race segments"
```

---

### Task 6: Update overlay styles to use `LeaderboardTable`

All four styles need identical changes:
1. Replace `import { QualifyingTable } from '../../components/shared/QualifyingTable'` with `import { LeaderboardTable } from '../../components/shared/LeaderboardTable'`
2. Expand `showQualTable` guard to include `race`
3. Add `mode={mode}` prop to the component usage
4. Rename `showQualTable` → `showTable` for clarity

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`
- Modify: `apps/renderer/src/styles/esports/index.tsx`
- Modify: `apps/renderer/src/styles/minimal/index.tsx`
- Modify: `apps/renderer/src/styles/modern/index.tsx`

Apply to each file:

**Import swap:**
```ts
// Remove:
import { QualifyingTable } from '../../components/shared/QualifyingTable'
// Add:
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
```

**Guard update (all four files):**
```ts
// Remove:
const showQualTable = (mode === 'qualifying' || mode === 'practice') && segment.qualifyingDrivers != null
// Add:
const showTable = segment.qualifyingDrivers != null
```

**Component usage (all four files):**
```tsx
// Remove:
{showQualTable && (
  <QualifyingTable
    qualifyingDrivers={segment.qualifyingDrivers!}
    ourKart={session.driver.kart}
    fps={fps}
    accentColor={...}
    position={...}
    // (anchorTop if present in banner)
  />
)}
// Add:
{showTable && (
  <LeaderboardTable
    qualifyingDrivers={segment.qualifyingDrivers!}
    ourKart={session.driver.kart}
    mode={mode}
    fps={fps}
    accentColor={...}
    position={...}
    // (anchorTop if present in banner)
  />
)}
```

> **Note for banner:** `banner/index.tsx` has two render paths (qualifying/practice and race layouts). Both have their own `{showQualTable && <QualifyingTable ...>}` block. Update both. The `showTimePanels` path uses `anchorTop={140}` — keep that. The race layout path has no `anchorTop` — keep that too.

> **Note for banner only:** `banner/index.tsx` also imports `buildLeaderboard` from `../../qualifying` (used for `livePosition`). Update that import to `../../leaderboard` **and** update the call at the `livePosition` useMemo from `buildLeaderboard(segment.qualifyingDrivers!, currentTime)` to `buildLeaderboard(segment.qualifyingDrivers!, currentTime, mode)`.

> **Note for esports/minimal/modern:** These files do NOT import `buildLeaderboard` — only the `QualifyingTable` import and `showQualTable` guard need changing.

- [ ] **Step 1: Update `banner/index.tsx`**

Three changes:
1. Change `import { QualifyingTable } from '../../components/shared/QualifyingTable'` → `import { LeaderboardTable } from '../../components/shared/LeaderboardTable'`
2. Change `import { buildLeaderboard } from '../../qualifying'` → `import { buildLeaderboard } from '../../leaderboard'`
3. Update the `livePosition` useMemo call: `buildLeaderboard(segment.qualifyingDrivers!, currentTime)` → `buildLeaderboard(segment.qualifyingDrivers!, currentTime, mode)`
4. Replace `showQualTable` guard → `showTable` (both uses)
5. Update both `<QualifyingTable ...>` usages → `<LeaderboardTable mode={mode} ...>`

- [ ] **Step 2: Update `esports/index.tsx`**

Two changes:
1. Change `QualifyingTable` import → `LeaderboardTable` import
2. Replace `showQualTable` guard → `showTable`, update `<QualifyingTable ...>` → `<LeaderboardTable mode={mode} ...>`

- [ ] **Step 3: Update `minimal/index.tsx`**

Same two changes as `esports`.

- [ ] **Step 4: Update `modern/index.tsx`**

Same two changes as `esports`.

- [ ] **Step 5: Build renderer to check TypeScript**

```bash
cd apps/renderer && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/styles/banner/index.tsx \
        apps/renderer/src/styles/esports/index.tsx \
        apps/renderer/src/styles/minimal/index.tsx \
        apps/renderer/src/styles/modern/index.tsx
git commit -m "feat(renderer): use LeaderboardTable in all styles, enable race mode"
```

---

### Task 7: Update registry canvas heights

**Files:**
- Modify: `apps/renderer/src/registry.ts`

A 10-row race table needs ~350px of vertical space (10 rows × 34px + separator). Canvas heights must accommodate this.

- `banner`: table is at `anchorTop={140}`. Total: 140 + 350 = 490 → set height to **500**
- `esports`: table is at `bottom: 20`. Total: 350 + 20 = 370 → set height to **400**
- `minimal`: same layout as esports → set height to **400**
- `modern`: the existing canvas is 520×96 placed at `overlayY: 984` (bottom of a 1080p video). Keeping this fixed-position canvas means any table at `bottom: 20` would need 350+20=370px of height — far exceeding 96px. **Solution:** switch `modern` to a full-video `scaleWithVideo` canvas and reposition the existing timing bar to `bottom: 0` within it. The bar currently uses `position: absolute, top: 0, left: 0, width: '100%', height: '100%'` — change to `position: absolute, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 520 * scale, height: 96 * scale`. The `LeaderboardTable` at `bottom-right` will sit correctly in the full-video canvas.

```ts
export const registry: Record<string, RegistryEntry> = {
  banner: {
    component: Banner,
    width: 1920,
    height: 500,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  esports: {
    component: Esports,
    width: 1920,
    height: 400,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  minimal: {
    component: Minimal,
    width: 1920,
    height: 400,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
  modern: {
    component: Modern,
    width: 1920,
    height: 1080,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
}
```

> **Note:** `esports` and `minimal` use `overlayY` computed at runtime based on `boxPosition` (see `BOX_STRIP_HEIGHTS` in CLI). Update `BOX_STRIP_HEIGHTS` in `apps/cli/src/index.ts` to match the new heights: `{ esports: 400, minimal: 400 }`.

> **Note:** `modern` must also have its inner container repositioned (Step 2 below).

- [ ] **Step 1: Update `registry.ts` with new heights**

- [ ] **Step 2: Update `modern/index.tsx` container style**

`modern/index.tsx` currently positions its bar container as `position: absolute, top: 0, left: 0, width: '100%', height: '100%'`. With the canvas now full-video-size this would stretch the bar across the whole video. Change the container style to pin it at the video bottom:

```ts
container: {
  position: 'absolute' as const,
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 520 * scale,
  height: 96 * scale,
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'center',
  fontFamily,
  userSelect: 'none' as const,
  paddingLeft: padX,
  paddingRight: padX,
  boxSizing: 'border-box' as const,
  background: [
    'repeating-linear-gradient(-55deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 2px, transparent 2px, transparent 18px)',
    'rgba(13, 15, 20, 0.88)',
  ].join(', '),
},
```

- [ ] **Step 3: Update `BOX_STRIP_HEIGHTS` in `apps/cli/src/index.ts`**

```ts
const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 400, minimal: 400 }
```

- [ ] **Step 4: Build both packages to check for errors**

```bash
cd apps/renderer && npx tsc --noEmit && cd ../cli && npx tsc --noEmit
```

- [ ] **Step 5: Run all tests**

```bash
cd apps/renderer && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/registry.ts apps/renderer/src/styles/modern/index.tsx apps/cli/src/index.ts
git commit -m "feat(renderer): increase canvas heights to accommodate 10-row leaderboard"
```

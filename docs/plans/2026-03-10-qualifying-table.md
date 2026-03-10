# Live Qualifying Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `QualifyingTable` component that replays the qualifying/practice leaderboard frame-by-frame, showing P1 pinned + a 3-row window around `--driver`.

**Architecture:** `QualifyingDriver[]` (name, kart, absolute lap timestamps) lives on `SessionSegment`. The CLI derives each driver's video-start time from the session-end anchor (`offsetSeconds + ourTotalTime`). Pure functions `buildLeaderboard` / `selectWindow` compute the 4-row table state per frame; the component wraps them in `useMemo`. Integrated into all four styles as a conditional overlay when `mode === 'qualifying' || mode === 'practice'` and `qualifyingDrivers` is present.

**Prerequisite:** The multi-segment CLI work (`apps/cli/src/index.ts` building `segments: SessionSegment[]`) must be complete before Task 5.

**Tech Stack:** TypeScript, Remotion (React), Vitest

---

### Task 1: Add `QualifyingDriver` type and update `SessionSegment`

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add the new type and field**

In `packages/core/src/index.ts`, add `QualifyingDriver` and extend `SessionSegment`:

```ts
export interface QualifyingDriver {
  kart: string
  name: string
  timestamps: LapTimestamp[]   // absolute ytSeconds for each lap start
}
```

Add to `SessionSegment` (after `sessionAllLaps`):
```ts
  qualifyingDrivers?: QualifyingDriver[]  // all drivers; populated for qualifying + practice
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @racedash/core build
```
Expected: no errors.

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add QualifyingDriver type and qualifyingDrivers to SessionSegment"
```

---

### Task 2: Pure timing functions with tests (TDD)

**Files:**
- Create: `apps/renderer/src/qualifying.ts`
- Create: `apps/renderer/src/qualifying.test.ts`

**Step 1: Write the failing tests**

Create `apps/renderer/src/qualifying.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { QualifyingDriver } from '@racedash/core'
import { buildLeaderboard, selectWindow, formatDelta } from './qualifying'

// Helper: driver with laps starting at videoStart
function driver(kart: string, videoStart: number, lapTimes: number[]): QualifyingDriver {
  let ytSeconds = videoStart
  const timestamps = lapTimes.map((lapTime, i) => {
    const ts = { lap: { number: i + 1, lapTime, cumulative: lapTime }, ytSeconds }
    ytSeconds += lapTime
    return ts
  })
  return { kart, name: `Driver ${kart}`, timestamps }
}

// Three drivers: A starts at t=0, B at t=5, C at t=10
// All do laps of ~60s each
const A = driver('1', 0, [62.0, 61.0, 60.0])   // best: 60.0
const B = driver('2', 5, [61.5, 59.5, 61.0])   // best: 59.5 (fastest)
const C = driver('3', 10, [63.0, 60.5, 61.5])  // best: 60.5

// Lap completion times (ytSeconds + lapTime):
// A lap1 ends: 62.0, lap2: 123.0, lap3: 183.0
// B lap1 ends: 66.5, lap2: 126.5 (best 59.5), lap3: 187.5
// C lap1 ends: 73.0, lap2: 133.5 (best 60.5), lap3: 195.0

const DRIVERS = [A, B, C]

describe('buildLeaderboard', () => {
  it('returns empty array before any driver completes a lap', () => {
    expect(buildLeaderboard(DRIVERS, 60.0)).toEqual([])
  })

  it('includes only drivers with at least one completed lap', () => {
    // At t=65, only A has completed lap 1 (ends at 62.0)
    const lb = buildLeaderboard(DRIVERS, 65.0)
    expect(lb).toHaveLength(1)
    expect(lb[0].kart).toBe('1')
    expect(lb[0].position).toBe(1)
    expect(lb[0].best).toBeCloseTo(62.0)
  })

  it('sorts by best lap time ascending', () => {
    // At t=200, all 3 have completed all laps
    const lb = buildLeaderboard(DRIVERS, 200.0)
    expect(lb).toHaveLength(3)
    expect(lb[0].kart).toBe('2')  // B: best 59.5
    expect(lb[1].kart).toBe('1')  // A: best 60.0
    expect(lb[2].kart).toBe('3')  // C: best 60.5
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0)
    expect(lb.map(d => d.position)).toEqual([1, 2, 3])
  })

  it('does not count a lap as complete until ytSeconds + lapTime <= currentTime', () => {
    // B lap2 ends at 5+61.5+59.5=126.0; at t=125.9 it is not yet complete
    const lb = buildLeaderboard(DRIVERS, 125.9)
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(61.5)  // only lap1 (61.5) is complete, not lap2 (59.5)
  })

  it('updates best when a faster lap completes', () => {
    // B lap2 ends at 126.0 exactly
    const lb = buildLeaderboard(DRIVERS, 126.0)
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(59.5)
  })
})

describe('selectWindow', () => {
  // Build a 6-driver leaderboard
  const lb = Array.from({ length: 6 }, (_, i) => ({
    kart: String(i + 1),
    name: `Driver ${i + 1}`,
    timestamps: [],
    best: 60 + i,
    position: i + 1,
  }))

  it('P1: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '1')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P2: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '2')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P3: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '3')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P4 (middle): shows [P1, P3, P4, P5]', () => {
    const rows = selectWindow(lb, '4')
    expect(rows.map(d => d.position)).toEqual([1, 3, 4, 5])
  })

  it('last (P6): shows [P1, P4, P5, P6]', () => {
    const rows = selectWindow(lb, '6')
    expect(rows.map(d => d.position)).toEqual([1, 4, 5, 6])
  })

  it('returns all rows when leaderboard has fewer than 4', () => {
    const small = lb.slice(0, 2)
    const rows = selectWindow(small, '2')
    expect(rows.map(d => d.position)).toEqual([1, 2])
  })

  it('returns top 4 as fallback if our kart is not in leaderboard', () => {
    const rows = selectWindow(lb, 'UNKNOWN')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })
})

describe('formatDelta', () => {
  it('formats positive delta with + prefix and 3 decimals', () => {
    expect(formatDelta(60.456, 60.0)).toBe('+0.456')
  })

  it('returns absolute time string for P1 (delta === 0)', () => {
    // P1 is formatted separately in the component; formatDelta only called for non-P1
    expect(formatDelta(59.5, 59.5)).toBe('+0.000')
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
pnpm test 2>&1 | grep -E "FAIL|qualifying"
```
Expected: FAIL — `qualifying` module not found.

**Step 3: Implement `qualifying.ts`**

Create `apps/renderer/src/qualifying.ts`:

```ts
import type { QualifyingDriver, LapTimestamp } from '@racedash/core'

export interface RankedDriver extends QualifyingDriver {
  best: number     // best completed lap time in seconds
  position: number // 1-indexed
}

/**
 * Build the leaderboard at `currentTime`.
 * Only drivers with at least one completed lap are included.
 * A lap is complete when ts.ytSeconds + ts.lap.lapTime <= currentTime.
 */
export function buildLeaderboard(drivers: QualifyingDriver[], currentTime: number): RankedDriver[] {
  const ranked: RankedDriver[] = []

  for (const d of drivers) {
    let best = Infinity
    for (const ts of d.timestamps) {
      if (ts.ytSeconds + ts.lap.lapTime <= currentTime) {
        if (ts.lap.lapTime < best) best = ts.lap.lapTime
      }
    }
    if (best !== Infinity) {
      ranked.push({ ...d, best, position: 0 })
    }
  }

  ranked.sort((a, b) => a.best - b.best)
  for (let i = 0; i < ranked.length; i++) ranked[i].position = i + 1
  return ranked
}

/**
 * Select the 4-row display window:
 * - Row 1: always P1
 * - Rows 2-4: 3-row window around ourKart (clamped to leaderboard bounds, no P1 duplication)
 * - If our driver IS P1: [P1, P2, P3, P4]
 * - Falls back to top-4 if ourKart not found
 */
export function selectWindow(leaderboard: RankedDriver[], ourKart: string): RankedDriver[] {
  if (leaderboard.length === 0) return []

  const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)

  // Fallback or P1
  if (ourIdx <= 0) return leaderboard.slice(0, Math.min(4, leaderboard.length))

  const last = leaderboard.length - 1
  // Window start: one above our driver, but never overlap P1 (index 0)
  let windowStart = Math.max(1, ourIdx - 1)
  let windowEnd = Math.min(last, ourIdx + 1)

  // Expand window to fill 3 slots, clamped to [1..last]
  while (windowEnd - windowStart < 2) {
    if (windowStart > 1) windowStart--
    else if (windowEnd < last) windowEnd++
    else break
  }

  return [leaderboard[0], ...leaderboard.slice(windowStart, windowEnd + 1)]
}

/** Format a delta to P1 as "+0.456". */
export function formatDelta(lapTime: number, p1Time: number): string {
  const delta = lapTime - p1Time
  return `+${delta.toFixed(3)}`
}
```

**Step 4: Run tests to confirm they pass**

```bash
pnpm test 2>&1 | grep -E "PASS|FAIL|qualifying"
```
Expected: all qualifying tests PASS.

**Step 5: Commit**

```bash
git add apps/renderer/src/qualifying.ts apps/renderer/src/qualifying.test.ts
git commit -m "feat(renderer): add qualifying leaderboard logic with tests"
```

---

### Task 3: `QualifyingTable` component

**Files:**
- Create: `apps/renderer/src/components/shared/QualifyingTable.tsx`

**Step 1: Implement the component**

```tsx
import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { QualifyingDriver } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { buildLeaderboard, selectWindow, formatDelta, RankedDriver } from '../../qualifying'
import { fontFamily } from '../../Root'

interface QualifyingTableProps {
  qualifyingDrivers: QualifyingDriver[]
  ourKart: string
  fps: number
  accentColor?: string
}

export const QualifyingTable = React.memo(function QualifyingTable({
  qualifyingDrivers,
  ourKart,
  fps,
  accentColor = '#3DD73D',
}: QualifyingTableProps) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920

  const currentTime = frame / fps

  const leaderboard = useMemo(
    () => buildLeaderboard(qualifyingDrivers, currentTime),
    [qualifyingDrivers, currentTime],
  )

  const rows = useMemo(
    () => selectWindow(leaderboard, ourKart),
    [leaderboard, ourKart],
  )

  if (rows.length === 0) return null

  const p1Time = rows[0].best
  const hasSeparator = rows.length > 1 && rows[1].position > 2

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 20 * sc,
    right: 20 * sc,
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
        const lapDisplay = isP1
          ? formatLapTime(row.best)
          : formatDelta(row.best, p1Time)

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
      ? `${accentColor}33`
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

**Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @racedash/renderer build 2>&1 | grep -E "error|Error"
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/renderer/src/components/shared/QualifyingTable.tsx
git commit -m "feat(renderer): add QualifyingTable component"
```

---

### Task 4: Integrate into overlay styles

For each of the four styles, add `<QualifyingTable>` when `segment.qualifyingDrivers` is present and `segment.mode` is `qualifying` or `practice`.

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`
- Modify: `apps/renderer/src/styles/esports/index.tsx`
- Modify: `apps/renderer/src/styles/minimal/index.tsx`
- Modify: `apps/renderer/src/styles/modern/index.tsx`

**Pattern for all styles** — add these two things:

1. Import at the top:
```tsx
import { QualifyingTable } from '../../components/shared/QualifyingTable'
```

2. Before the `return` (after `useActiveSegment` resolves `segment`), derive:
```tsx
const showQualTable = (segment.mode === 'qualifying' || segment.mode === 'practice')
  && segment.qualifyingDrivers != null
```

3. In each JSX return, add inside `<AbsoluteFill>` (or the outermost div):
```tsx
{showQualTable && (
  <QualifyingTable
    qualifyingDrivers={segment.qualifyingDrivers!}
    ourKart={segment.session.driver.kart}
    fps={fps}
    accentColor={accentColor}
  />
)}
```

**Note for `esports` and `modern`:** these styles don't receive `accentColor` as a prop today. Pass `undefined` (the component defaults to `#3DD73D`), or thread the prop through from `OverlayProps` if desired — that's a separate concern. For now pass `undefined`.

**Step 1: Update all four styles with the pattern above**

Do each file, then run:

```bash
pnpm --filter @racedash/renderer build 2>&1 | grep -E "error|Error"
```
Expected: no errors.

**Step 2: Run all tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add apps/renderer/src/styles/banner/index.tsx \
        apps/renderer/src/styles/esports/index.tsx \
        apps/renderer/src/styles/minimal/index.tsx \
        apps/renderer/src/styles/modern/index.tsx
git commit -m "feat(renderer): integrate QualifyingTable into all overlay styles"
```

---

### Task 5: CLI — compute `qualifyingDrivers` per segment

**Prerequisite:** `apps/cli/src/index.ts` must already build `segments: SessionSegment[]` (multi-segment work complete).

**Files:**
- Modify: `apps/cli/src/index.ts`

**Step 1: Add the helper function**

After the imports in `apps/cli/src/index.ts`, add:

```ts
import type { QualifyingDriver, LapTimestamp, SessionSegment } from '@racedash/core'
import type { DriverRow } from '@racedash/scraper'

function buildQualifyingDrivers(
  allDrivers: DriverRow[],
  ourDriverKart: string,
  offsetSeconds: number,
): QualifyingDriver[] {
  // Find our driver's total session time to anchor session end
  const ourDriver = allDrivers.find(d => d.kart === ourDriverKart)
  if (!ourDriver) return []

  const ourTotal = ourDriver.laps.reduce((s, l) => s + l.lapTime, 0)
  const sessionEnd = offsetSeconds + ourTotal

  return allDrivers.map(d => {
    const driverTotal = d.laps.reduce((s, l) => s + l.lapTime, 0)
    const driverStart = sessionEnd - driverTotal

    let ytSeconds = driverStart
    const timestamps: LapTimestamp[] = d.laps.map(lap => {
      const ts = { lap, ytSeconds }
      ytSeconds += lap.lapTime
      return ts
    })

    return { kart: d.kart, name: d.name, timestamps }
  })
}
```

**Step 2: Call it when building each qualifying/practice segment**

In the segment-building logic (where `mode === 'qualifying' || mode === 'practice'`), attach:

```ts
const qualifyingDrivers = (mode === 'qualifying' || mode === 'practice')
  ? buildQualifyingDrivers(drivers, driver.kart, offsetSeconds)
  : undefined

// Add to the segment object:
const segment: SessionSegment = {
  mode,
  session,
  sessionAllLaps: drivers.map(d => d.laps),
  qualifyingDrivers,
}
```

**Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @racedash/cli build 2>&1 | grep -E "error|Error"
```
Expected: no errors.

**Step 4: Run all tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): compute qualifyingDrivers for qualifying and practice segments"
```

---

## Done

The qualifying table is now live. To verify visually, render a qualifying session with `--mode qualifying` and observe the table appearing in the bottom-right corner once drivers begin completing laps.

Positioning, font sizes, and visual tweaks to `QualifyingTable.tsx` can be iterated without touching any other files.

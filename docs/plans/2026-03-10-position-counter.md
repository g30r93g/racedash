# Position Counter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `--mode practice|qualifying|race` CLI flag and a `PositionCounter` component at top-left of the geometric overlay that shows race position (P1, P2…) using per-lap-capped comparison.

**Architecture:** `mode` is added to `OverlayProps` and flows CLI → renderer props → `PositionCounter`. Position computation lives in a new `position.ts` utility (alongside `timing.ts`) and is independently tested. The component mirrors `LapCounter`'s trapezoid visual but on the left.

**Tech Stack:** TypeScript, React, Remotion, Vitest, Commander.js

---

### Task 1: Add `mode` to `OverlayProps` in core

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add the field**

In `packages/core/src/index.ts`, add `mode` to `OverlayProps`:

```ts
export type SessionMode = 'practice' | 'qualifying' | 'race'

export interface OverlayProps {
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver, used for session-best comparison
  mode: SessionMode
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
}
```

Place the `SessionMode` type export directly above `OverlayProps`.

**Step 2: Verify TypeScript**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay
pnpm --filter @racedash/core build
```

Expected: no errors. (Core has no tests — type-check is the build.)

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add mode field to OverlayProps"
```

---

### Task 2: Write and test position calculation utility

**Files:**
- Create: `apps/renderer/src/position.ts`
- Create: `apps/renderer/src/position.test.ts`

**Step 1: Write the failing test**

Create `apps/renderer/src/position.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Lap } from '@racedash/core'
import { getPosition } from './position'

// Lap data helpers
const lap = (number: number, lapTime: number, cumulative: number): Lap => ({
  number, lapTime, cumulative,
})

// Current driver: laps 1-3 with cumulative times
const currentLaps: Lap[] = [
  lap(1, 68.0, 68.0),
  lap(2, 65.0, 133.0),
  lap(3, 63.0, 196.0),
]

// Faster driver (P1): consistently quicker
const fasterDriver: Lap[] = [
  lap(1, 65.0, 65.0),
  lap(2, 64.0, 129.0),
  lap(3, 63.0, 192.0),
]

// Slower driver (P3): consistently slower
const slowerDriver: Lap[] = [
  lap(1, 70.0, 70.0),
  lap(2, 68.0, 138.0),
  lap(3, 67.0, 205.0),
]

// Driver with only 2 laps (no lap 3 yet)
const shortDriver: Lap[] = [
  lap(1, 66.0, 66.0),
  lap(2, 64.5, 130.5),
]

describe('getPosition — race mode', () => {
  const allLaps = [currentLaps, fasterDriver, slowerDriver]

  it('P2 at lap 1 (faster driver completed lap 1)', () => {
    expect(getPosition('race', 1, currentLaps, allLaps)).toBe(2)
  })

  it('P2 at lap 3 (faster driver is always ahead)', () => {
    expect(getPosition('race', 3, currentLaps, allLaps)).toBe(2)
  })

  it('P1 when current driver is fastest', () => {
    const allWithSlower = [currentLaps, slowerDriver]
    expect(getPosition('race', 1, currentLaps, allWithSlower)).toBe(1)
  })

  it('drivers without enough laps rank behind current driver', () => {
    const allWithShort = [currentLaps, fasterDriver, slowerDriver, shortDriver]
    // shortDriver has no lap 3, so excluded from lap-3 comparison
    expect(getPosition('race', 3, currentLaps, allWithShort)).toBe(2)
  })
})

describe('getPosition — qualifying/practice mode', () => {
  it('P2 when another driver has faster best through lap 2', () => {
    // current best through lap 2: min(68, 65) = 65
    // fasterDriver best through lap 2: min(65, 64) = 64
    // slowerDriver best through lap 2: min(70, 68) = 68
    const allLaps = [currentLaps, fasterDriver, slowerDriver]
    expect(getPosition('qualifying', 2, currentLaps, allLaps)).toBe(2)
  })

  it('P1 when current driver has overall fastest best at lap 1', () => {
    // current lap 1 = 68, slowerDriver lap 1 = 70
    const allLaps = [currentLaps, slowerDriver]
    expect(getPosition('practice', 1, currentLaps, allLaps)).toBe(1)
  })

  it('drivers with no laps through N are excluded', () => {
    // shortDriver has no lap 3
    const allLaps = [currentLaps, fasterDriver, slowerDriver, shortDriver]
    // shortDriver is excluded; fasterDriver still beats current
    expect(getPosition('qualifying', 3, currentLaps, allLaps)).toBe(2)
  })
})
```

**Step 2: Run to confirm failure**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay/apps/renderer
pnpm test
```

Expected: FAIL — `getPosition` not found.

**Step 3: Implement `position.ts`**

Create `apps/renderer/src/position.ts`:

```ts
import type { Lap, SessionMode } from '@racedash/core'

/**
 * Compute race position at the end of `lapNumber`.
 *
 * Race: rank by cumulative time at lap N (lower = better).
 * Practice/Qualifying: rank by best lap time through lap N (lower = better).
 *
 * Drivers without N laps completed are excluded from comparison and
 * rank behind the current driver.
 */
export function getPosition(
  mode: SessionMode,
  lapNumber: number,
  currentLaps: Lap[],
  sessionAllLaps: Lap[][],
): number {
  const score = computeScore(mode, lapNumber, currentLaps)
  if (score === null) return 1

  let position = 1
  for (const driverLaps of sessionAllLaps) {
    if (driverLaps === currentLaps) continue
    const driverScore = computeScore(mode, lapNumber, driverLaps)
    if (driverScore !== null && driverScore < score) position++
  }
  return position
}

function computeScore(mode: SessionMode, lapNumber: number, laps: Lap[]): number | null {
  const slice = laps.slice(0, lapNumber)
  if (slice.length < lapNumber) return null  // driver hasn't completed this many laps

  if (mode === 'race') {
    return slice[slice.length - 1].cumulative
  } else {
    return Math.min(...slice.map(l => l.lapTime))
  }
}
```

**Step 4: Run tests to confirm pass**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay/apps/renderer
pnpm test
```

Expected: all `getPosition` tests PASS.

**Step 5: Commit**

```bash
git add apps/renderer/src/position.ts apps/renderer/src/position.test.ts
git commit -m "feat(renderer): add getPosition utility for race/qualifying/practice modes"
```

---

### Task 3: Create `PositionCounter` component

**Files:**
- Create: `apps/renderer/src/styles/geometric/PositionCounter.tsx`

**Step 1: Create the component**

The `LapCounter` (top-right) uses `clipPath: 'polygon(0 0, 100% 0, 100% 100%, 17% 100%)'` — right edge vertical, left edge angled. The `PositionCounter` (top-left) mirrors this: left edge vertical, right edge angled inward.

Create `apps/renderer/src/styles/geometric/PositionCounter.tsx`:

```tsx
import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { getPosition } from '../../position'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  fps: number
  mode: SessionMode
}

export const PositionCounter: React.FC<Props> = ({
  timestamps,
  currentLaps,
  sessionAllLaps,
  fps,
  mode,
}) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds

  // Hidden before race starts
  if (currentTime < raceStart) return null

  const currentLap = getLapAtTime(timestamps, currentTime)
  const position = getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)

  return (
    <div
      style={{
        width: 180,
        height: 80,
        // Mirror of LapCounter: left edge vertical, right edge angled inward at bottom
        clipPath: 'polygon(0 0, 100% 0, 83% 100%, 0 100%)',
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 16,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 400,
          color: 'white',
          letterSpacing: 1,
          userSelect: 'none',
        }}
      >
        P{position}
      </span>
    </div>
  )
}
```

**Step 2: Type-check**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay/apps/renderer
pnpm build
```

Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add apps/renderer/src/styles/geometric/PositionCounter.tsx
git commit -m "feat(renderer): add PositionCounter component for top-left geometric overlay"
```

---

### Task 4: Wire `PositionCounter` into `Geometric` and update `Root.tsx`

**Files:**
- Modify: `apps/renderer/src/styles/geometric/index.tsx`
- Modify: `apps/renderer/src/Root.tsx`

**Step 1: Update `Geometric` component**

Open `apps/renderer/src/styles/geometric/index.tsx`. The current content is:

```tsx
import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)

  return (
    <AbsoluteFill>
      {/* Lap timer: centered at top */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
      </div>
      {/* Lap counter: right-angle trapezium flush to top-right */}
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
```

Replace with:

```tsx
import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps, mode }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)

  return (
    <AbsoluteFill>
      {/* Position counter: left-angle trapezium flush to top-left */}
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <PositionCounter
          timestamps={session.timestamps}
          currentLaps={session.laps}
          sessionAllLaps={sessionAllLaps}
          fps={fps}
          mode={mode}
        />
      </div>
      {/* Lap timer: centered at top */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
      </div>
      {/* Lap counter: right-angle trapezium flush to top-right */}
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
```

**Step 2: Update `Root.tsx` default props**

Open `apps/renderer/src/Root.tsx`. Find `defaultProps` and add `mode: 'race'`:

```ts
const defaultProps: OverlayProps = {
  session: defaultSession,
  sessionAllLaps: [defaultSession.laps],
  mode: 'race',
  fps: 60,
  durationInFrames: 300,
}
```

**Step 3: Type-check**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay/apps/renderer
pnpm build
```

Expected: no errors.

**Step 4: Run all renderer tests**

```bash
pnpm test
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add apps/renderer/src/styles/geometric/index.tsx apps/renderer/src/Root.tsx
git commit -m "feat(renderer): wire PositionCounter into Geometric overlay layout"
```

---

### Task 5: Add `--mode` flag to CLI

**Files:**
- Modify: `apps/cli/src/index.ts`

**Step 1: Update `RenderOpts` interface**

Find the `RenderOpts` interface (around line 67) and add `mode`:

```ts
interface RenderOpts {
  offset: string
  video: string
  output: string
  fps: string
  style: string
  overlayX: string
  overlayY: string
  mode: string
}
```

**Step 2: Add the option to the `render` command**

After `.option('--overlay-y <n>', 'Overlay Y position in pixels', '0')`, add:

```ts
.requiredOption('--mode <mode>', 'Session mode: practice, qualifying, or race')
```

**Step 3: Add validation and pass `mode` to `overlayProps`**

In the `render` action body, after the `fps` validation block, add mode validation:

```ts
const validModes = ['practice', 'qualifying', 'race'] as const
type ValidMode = typeof validModes[number]
if (!validModes.includes(opts.mode as ValidMode)) {
  console.error(`Error: --mode must be one of: ${validModes.join(', ')}`)
  process.exit(1)
}
const mode = opts.mode as ValidMode
```

Then update `overlayProps` to include `mode`:

```ts
const overlayProps: OverlayProps = {
  session,
  sessionAllLaps: drivers.map(d => d.laps),
  mode,
  fps,
  durationInFrames,
}
```

**Step 4: Type-check CLI**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay/apps/cli
pnpm build
```

Expected: no errors.

**Step 5: Smoke test help output**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay
pnpm racedash render --help
```

Expected: `--mode <mode>` appears in the options list with description `Session mode: practice, qualifying, or race`.

**Step 6: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): add --mode flag for practice|qualifying|race session type"
```

---

### Task 6: Run full test suite

**Step 1: Run all tests from monorepo root**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feature/geometric-overlay
pnpm test
```

Expected: all tests across all packages PASS.

**Step 2: If any failures**, read the error output carefully and fix before continuing.

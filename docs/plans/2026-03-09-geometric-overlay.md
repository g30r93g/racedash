# Geometric Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `gt7` Remotion style with a new `geometric` style — a top-centered trapezium lap timer that flashes purple/green/red on lap completion based on personal-best and session-best comparison.

**Architecture:** A pure `computeLapColors` function pre-computes a color per lap using all drivers' lap data, then `LapTimerTrap` reads the current frame to decide whether to show a counting-up timer (neutral) or a 2-second frozen flash of the completed lap time (colored). All drivers' laps are threaded from the CLI through `OverlayProps.sessionAllLaps` into the renderer.

**Tech Stack:** Remotion 4 (React, headless Chrome), Vitest, TypeScript strict, CSS `clip-path` for trapezium shape, Atkinson Hyperlegible Mono font (already loaded in `Root.tsx`).

---

### Task 1: Add `sessionAllLaps` to `OverlayProps`

**Files:**
- Modify: `packages/core/src/index.ts`

**Step 1: Add the field**

```ts
export interface OverlayProps {
  session: SessionData
  sessionAllLaps: Lap[][]   // ← add this: one Lap[] per driver, used for session-best comparison
  fps: number
  durationInFrames: number
}
```

**Step 2: Build to surface type errors**

```bash
cd /path/to/racedash && pnpm build
```

Expected: TypeScript errors in `apps/cli/src/index.ts` and `apps/renderer/src/Root.tsx` (missing `sessionAllLaps`). These will be fixed in later tasks.

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add sessionAllLaps to OverlayProps for session-best comparison"
```

---

### Task 2: Write and test `computeLapColors`

**Files:**
- Create: `apps/renderer/src/styles/geometric/lapColor.ts`
- Create: `apps/renderer/src/styles/geometric/lapColor.test.ts`

**Step 1: Write the failing tests first**

Create `apps/renderer/src/styles/geometric/lapColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLapColors } from './lapColor'
import type { Lap } from '@racedash/core'

const lap = (number: number, lapTime: number, cumulative: number): Lap =>
  ({ number, lapTime, cumulative })

describe('computeLapColors', () => {
  it('returns red when lap is slower than personal best', () => {
    const target = [lap(1, 60, 60), lap(2, 65, 125)]
    expect(computeLapColors(target, [target])).toEqual(['purple', 'red'])
  })

  it('returns purple when lap is a new PB and the session best', () => {
    const target = [lap(1, 60, 60), lap(2, 55, 115)]
    expect(computeLapColors(target, [target])).toEqual(['purple', 'purple'])
  })

  it('returns green when lap is a new PB but not the session best', () => {
    const target = [lap(1, 60, 60), lap(2, 55, 115)]
    const other = [lap(1, 50, 50)]  // other driver already did 50s before cumulative 115
    expect(computeLapColors(target, [target, other])).toEqual(['purple', 'green'])
  })

  it('first lap is always a PB — purple if session best, green otherwise', () => {
    const target = [lap(1, 70, 70)]
    const other = [lap(1, 65, 65)]  // other driver faster at cumulative 65 < 70
    expect(computeLapColors(target, [target, other])).toEqual(['green'])
  })

  it('handles single driver, single lap', () => {
    const target = [lap(1, 60, 60)]
    expect(computeLapColors(target, [target])).toEqual(['purple'])
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/renderer && pnpm test
```

Expected: FAIL — `lapColor` module not found.

**Step 3: Implement `computeLapColors`**

Create `apps/renderer/src/styles/geometric/lapColor.ts`:

```ts
import type { Lap } from '@racedash/core'

export type LapColor = 'purple' | 'green' | 'red'

/**
 * For each of the target driver's laps, determines the display color on completion:
 *   purple — new personal best AND the fastest lap in the session at that point
 *   green  — new personal best but another driver has gone faster
 *   red    — not a new personal best
 *
 * "Session best at lap N" = minimum lapTime among all laps (any driver) whose
 * cumulative time is <= the target lap's cumulative time. This assumes all drivers
 * start at the same time, which holds for karting group sessions.
 */
export function computeLapColors(targetLaps: Lap[], sessionAllLaps: Lap[][]): LapColor[] {
  const allLaps = sessionAllLaps.flat()
  let personalBest = Infinity

  return targetLaps.map(lap => {
    const sessionBest = allLaps
      .filter(l => l.cumulative <= lap.cumulative)
      .reduce((min, l) => Math.min(min, l.lapTime), Infinity)

    const isPersonalBest = lap.lapTime < personalBest
    personalBest = Math.min(personalBest, lap.lapTime)

    if (!isPersonalBest) return 'red'
    return lap.lapTime <= sessionBest ? 'purple' : 'green'
  })
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/renderer && pnpm test
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add apps/renderer/src/styles/geometric/lapColor.ts apps/renderer/src/styles/geometric/lapColor.test.ts
git commit -m "feat(renderer): add computeLapColors for session-best lap color logic"
```

---

### Task 3: Build `LapTimerTrap` component

**Files:**
- Create: `apps/renderer/src/styles/geometric/LapTimerTrap.tsx`

The component handles the state machine: counting-up timer (neutral) vs 2-second frozen flash (colored).

**Step 1: Create the component**

```tsx
import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import type { LapColor } from './lapColor'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const FLASH_DURATION_SECONDS = 2

const BACKGROUND: Record<'neutral' | LapColor, string> = {
  neutral: 'rgba(0,0,0,0.65)',
  purple:  'rgba(107,33,168,0.85)',
  green:   'rgba(21,128,61,0.85)',
  red:     'rgba(185,28,28,0.85)',
}

interface Props {
  timestamps: LapTimestamp[]
  lapColors: LapColor[]
  fps: number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export const LapTimerTrap: React.FC<Props> = ({ timestamps, lapColors, fps }) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps
  const currentLap = getLapAtTime(timestamps, currentTime)
  const lapElapsed = getLapElapsed(currentLap, currentTime)

  const lapIndex = currentLap.lap.number - 1  // 0-indexed
  const isFlashing = lapElapsed < FLASH_DURATION_SECONDS && lapIndex > 0

  let displayTime: string
  let bgKey: 'neutral' | LapColor

  if (isFlashing) {
    // Show the just-completed lap's time (frozen) and its color
    const prevLap = timestamps[lapIndex - 1]
    displayTime = formatTime(prevLap.lap.lapTime)
    bgKey = lapColors[lapIndex - 1]
  } else {
    displayTime = formatTime(lapElapsed)
    bgKey = 'neutral'
  }

  return (
    <div
      style={{
        width: 300,
        height: 80,
        clipPath: 'polygon(0 0, 100% 0, 83% 100%, 17% 100%)',
        background: BACKGROUND[bgKey],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 36,
          fontWeight: 400,
          color: 'white',
          letterSpacing: 1,
          userSelect: 'none',
        }}
      >
        {displayTime}
      </span>
    </div>
  )
}
```

**Step 2: Build to verify no type errors**

```bash
cd apps/renderer && pnpm build
```

Expected: Compiles cleanly (ignoring `sessionAllLaps` errors elsewhere until Task 5).

**Step 3: Commit**

```bash
git add apps/renderer/src/styles/geometric/LapTimerTrap.tsx
git commit -m "feat(renderer): add LapTimerTrap component with trapezium shape and flash logic"
```

---

### Task 4: Build the `geometric` composition

**Files:**
- Create: `apps/renderer/src/styles/geometric/index.tsx`

**Step 1: Create the composition**

```tsx
import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}
    >
      <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
    </AbsoluteFill>
  )
}
```

**Step 2: Build to check for type errors**

```bash
cd apps/renderer && pnpm build
```

Expected: Compiles cleanly.

**Step 3: Commit**

```bash
git add apps/renderer/src/styles/geometric/index.tsx
git commit -m "feat(renderer): add geometric composition — top-centered trapezium lap timer"
```

---

### Task 5: Update registry and Root, delete gt7

**Files:**
- Modify: `apps/renderer/src/registry.ts`
- Modify: `apps/renderer/src/Root.tsx`
- Delete: `apps/renderer/src/styles/gt7/` (entire folder)

**Step 1: Update `registry.ts`**

Replace the entire file contents:

```ts
import type { ComponentType } from 'react'
import type { OverlayProps } from '@racedash/core'
import { Geometric } from './styles/geometric'

export interface RegistryEntry {
  component: ComponentType<OverlayProps>
  width: number
  height: number
  overlayX: number
  overlayY: number
}

export const registry: Record<string, RegistryEntry> = {
  geometric: {
    component: Geometric,
    width: 1920,
    height: 120,
    overlayX: 0,
    overlayY: 0,
  },
}
```

**Step 2: Update `Root.tsx` default props**

Add `sessionAllLaps` to `defaultProps` in `apps/renderer/src/Root.tsx`:

```ts
const defaultProps: OverlayProps = {
  session: defaultSession,
  sessionAllLaps: [defaultSession.laps],   // ← add this line
  fps: 60,
  durationInFrames: 300,
}
```

**Step 3: Delete the gt7 style folder**

```bash
rm -rf apps/renderer/src/styles/gt7
```

**Step 4: Build to verify**

```bash
cd apps/renderer && pnpm build
```

Expected: Compiles cleanly with no references to gt7.

**Step 5: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add apps/renderer/src/registry.ts apps/renderer/src/Root.tsx
git rm -r apps/renderer/src/styles/gt7
git commit -m "feat(renderer): replace gt7 with geometric style, update registry"
```

---

### Task 6: Thread `sessionAllLaps` through the CLI

**Files:**
- Modify: `apps/cli/src/index.ts`

**Step 1: Pass `sessionAllLaps` and update default style**

In the `render` command action in `apps/cli/src/index.ts`, make two changes:

1. Change the `--style` default from `'gt7'` to `'geometric'`:
   ```ts
   .option('--style <name>', 'Overlay style', 'geometric')
   ```

2. Include all drivers' laps in `overlayProps`:
   ```ts
   const overlayProps: OverlayProps = {
     session,
     sessionAllLaps: drivers.map(d => d.laps),   // ← add this
     fps,
     durationInFrames,
   }
   ```

Also update the render command description from `'Render GT7-style overlay onto video'` to `'Render geometric overlay onto video'`.

**Step 2: Build**

```bash
pnpm build
```

Expected: Compiles cleanly with no TypeScript errors across the entire monorepo.

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): pass sessionAllLaps to renderer, switch default style to geometric"
```

---

## Verification

After all tasks, do a quick sanity check via `remotion preview`:

```bash
cd apps/renderer && npx remotion preview src/index.ts
```

Open the `geometric` composition in the Remotion Studio. Scrub to a lap boundary — within 2 seconds of the lap start, you should see the trapezium flash a color (purple/green/red). After 2 seconds, it should show the counting-up timer with a neutral dark background.

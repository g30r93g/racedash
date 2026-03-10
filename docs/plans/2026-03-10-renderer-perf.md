# Renderer Performance Optimisations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant allocations, reduce algorithmic complexity, and remove unnecessary React hook overhead from the overlay rendering pipeline.

**Architecture:** Seven targeted changes across pure utility functions (`timing.ts`, `lapColor.ts`, `position.ts`) and React components (`Banner`, `LapTimerTrap`, `LapCounter`, `PositionCounter`, `TimeLabelPanel`). Pure function changes are tested in isolation via Vitest; React component changes are structural (lifting state up) and verified by existing tests continuing to pass.

**Tech Stack:** TypeScript, React 18, Remotion, Vitest

---

## Chunk 1: Pure Function Optimisations

### Task 1: `computeLapColors` — O(n²) → O(n log n)

**Files:**
- Modify: `apps/renderer/src/styles/banner/lapColor.ts`
- Test: `apps/renderer/src/styles/banner/lapColor.test.ts`

**Context:** The current implementation calls `.filter` + `.reduce` over all session laps for every target lap — O(n × m). The fix pre-sorts all session laps by cumulative time once, then uses a two-pointer approach with a running minimum. `targetLaps` must be in ascending cumulative order — this is guaranteed by the only caller (`session.laps` is always lap-1, lap-2, … by construction). Using `targetLaps` directly (not sorting it) preserves the output contract: color at index `i` corresponds to `targetLaps[i]`.

- [ ] **Step 1: Run the existing tests to establish a green baseline**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose lapColor
```

Expected: all 6 tests pass.

- [ ] **Step 2: Replace `computeLapColors` with the two-pointer implementation**

Replace the entire body of `computeLapColors` in `apps/renderer/src/styles/banner/lapColor.ts`:

```ts
/**
 * @param targetLaps - Must be in ascending cumulative-time order (session.laps always satisfies this).
 */
export function computeLapColors(targetLaps: Lap[], sessionAllLaps: Lap[][]): LapColor[] {
  if (targetLaps.length === 0) return []

  // Sort all session laps once — O(n log n). targetLaps must already be
  // in ascending cumulative order (guaranteed by session.laps construction).
  const allLaps = sessionAllLaps.flat().sort((a, b) => a.cumulative - b.cumulative)

  let personalBest = Infinity
  let sessionBest = Infinity
  let j = 0

  return targetLaps.map(lap => {
    // Advance pointer to include every session lap whose cumulative time
    // is <= this lap's cumulative — i.e. laps that had already occurred.
    while (j < allLaps.length && allLaps[j].cumulative <= lap.cumulative) {
      sessionBest = Math.min(sessionBest, allLaps[j].lapTime)
      j++
    }

    const isPersonalBest = lap.lapTime < personalBest
    personalBest = Math.min(personalBest, lap.lapTime)

    if (!isPersonalBest) return 'red'
    return lap.lapTime <= sessionBest ? 'purple' : 'green'
  })
}
```

- [ ] **Step 3: Add a test for the ordering robustness to `lapColor.test.ts`**

Append to the `describe('computeLapColors', ...)` block:

```ts
  it('produces correct colors when sessionAllLaps contains laps from multiple drivers interleaved by cumulative', () => {
    // Driver A laps: cumulative 60, 115
    // Driver B laps: cumulative 50, 90 — interleaved before A's laps
    const target = [lap(1, 60, 60), lap(2, 55, 115)]
    const other  = [lap(1, 50, 50), lap(2, 45, 90)]
    // Session best at cum<=60: min(50, 60) = 50 → target lap 1 (60) is PB but not session best → green
    // Session best at cum<=115: min(50, 60, 45, 90, 55) = 45 → target lap 2 (55) is PB (55<60) but not session best (55>45) → green
    expect(computeLapColors(target, [target, other])).toEqual(['green', 'green'])
  })
```

- [ ] **Step 4: Run tests**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose lapColor
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/styles/banner/lapColor.ts apps/renderer/src/styles/banner/lapColor.test.ts
git commit -m "perf(renderer): replace O(n²) lap colour scan with two-pointer + running min"
```

---

### Task 2: `getSessionBest` — eliminate intermediate array allocations

**Files:**
- Modify: `apps/renderer/src/timing.ts`
- Test: `apps/renderer/src/timing.test.ts`

**Context:** `Math.min(...completedLaps.map(ts => ts.lap.lapTime))` creates two intermediate allocations (the `map` array and the spread argument list). A `reduce` does the same work with zero allocations.

- [ ] **Step 1: Add a test for `getSessionBest`**

In `apps/renderer/src/timing.test.ts`, replace line 3 (the existing import):

```ts
// Before:
import { getLapAtTime, getLapElapsed } from './timing'

// After:
import { getLapAtTime, getLapElapsed, getSessionBest } from './timing'
```

Then append the following `describe` block after the `getLapElapsed` block:

```ts
describe('getSessionBest', () => {
  it('returns null for empty array', () => {
    expect(getSessionBest([])).toBeNull()
  })

  it('returns the single lap time for one lap', () => {
    expect(getSessionBest([timestamps[0]])).toBeCloseTo(68.588)
  })

  it('returns the minimum lap time across multiple laps', () => {
    expect(getSessionBest(timestamps)).toBeCloseTo(64.776)
  })
})
```

- [ ] **Step 2: Run to verify new tests pass against the current (unchanged) implementation**

`getSessionBest` is already exported from `timing.ts` — only the test file's import was missing. Adding the import and tests in Step 1 is enough to make the suite pass before touching the implementation.

```bash
cd apps/renderer && pnpm test -- --reporter=verbose timing
```

Expected: all tests pass.

- [ ] **Step 3: Replace the implementation in `timing.ts`**

In `apps/renderer/src/timing.ts`, replace lines 32–35:

```ts
export function getSessionBest(completedLaps: LapTimestamp[]): number | null {
  if (completedLaps.length === 0) return null
  return completedLaps.reduce((min, ts) => Math.min(min, ts.lap.lapTime), Infinity)
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose timing
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/timing.ts apps/renderer/src/timing.test.ts
git commit -m "perf(renderer): replace map+spread in getSessionBest with reduce"
```

---

### Task 3: `computeScore` — remove array slice allocations

**Files:**
- Modify: `apps/renderer/src/position.ts`
- Test: `apps/renderer/src/position.test.ts`

**Context:** `computeScore` calls `laps.slice(0, lapNumber)` unconditionally, allocating a new array on every call. In race mode only the last element is needed — a direct index is enough. In practice/qualifying mode a `for` loop replaces `slice` + `map` + `Math.min(...)` spread.

- [ ] **Step 1: Run existing position tests to establish a baseline**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose position
```

Expected: all tests pass.

- [ ] **Step 2: Replace `computeScore` in `position.ts`**

Replace the `computeScore` function (lines 32–42) with:

```ts
function computeScore(mode: SessionMode, lapNumber: number, laps: Lap[]): number | null {
  if (lapNumber < 1 || laps.length < lapNumber) return null

  if (mode === 'race') {
    return laps[lapNumber - 1].cumulative
  }

  // practice / qualifying: best lap time through lapNumber
  let best = Infinity
  for (let i = 0; i < lapNumber; i++) best = Math.min(best, laps[i].lapTime)
  return best
}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose position
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/position.ts
git commit -m "perf(renderer): remove slice allocations in computeScore"
```

---

## Chunk 2: React Render Optimisations

### Task 4: Lift `getLapAtTime` / `indexOf` out of children into `Banner`

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`
- Modify: `apps/renderer/src/styles/banner/LapTimerTrap.tsx`
- Modify: `apps/renderer/src/styles/banner/LapCounter.tsx`
- Modify: `apps/renderer/src/styles/banner/PositionCounter.tsx`
- Modify: `apps/renderer/src/styles/banner/TimeLabelPanel.tsx`

**Context:** Each of the four child components independently calls `getLapAtTime(timestamps, currentTime)` (a binary search) and `timestamps.indexOf(currentLap)` (a linear scan) on every frame that changes `currentTime`. Since all children share the same `timestamps` and `currentTime`, computing these once in `Banner` and passing the results as props removes 3 redundant binary searches and 3 redundant linear scans per frame.

Note: `Banner` does not currently import `useCurrentFrame` or `getLapAtTime` — both need to be added.

- [ ] **Step 1: Run the full renderer test suite to establish a green baseline**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Update `LapTimerTrap` props — accept `currentLap` and `currentIdx`**

In `apps/renderer/src/styles/banner/LapTimerTrap.tsx`:

1. Remove the import of `getLapAtTime` from `../../timing`.
2. Add `currentLap: LapTimestamp` and `currentIdx: number` to the `Props` interface.
3. Remove `fps` from `Props` (it is no longer needed inside the component — timing is now computed by the parent).
4. Remove lines that compute `currentTime`, `raceStart`, the `getLapAtTime` call, and `getLapElapsed` using `fps` — replace with the passed-in `currentLap` and use `currentIdx` to determine flashing.

The updated file:

```tsx
import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import type { LapColor } from './lapColor'
import { getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const FLASH_DURATION_SECONDS = 2

const BACKGROUND: Record<'neutral' | LapColor, string> = {
  neutral: '#111111',
  purple:  'rgba(107,33,168,0.95)',
  green:   'rgba(21,128,61,0.95)',
  red:     'rgba(185,28,28,0.95)',
}

interface Props {
  timestamps: LapTimestamp[]
  lapColors: LapColor[]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  raceEnd: number
  textColor?: string
  bgColor?: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  const sStr = String(s).padStart(2, '0')
  const msStr = String(ms).padStart(3, '0')
  return m > 0 ? `${m}:${sStr}.${msStr}` : `${sStr}.${msStr}`
}

export const LapTimerTrap: React.FC<Props> = ({
  timestamps, lapColors, currentLap, currentIdx, currentTime, raceEnd,
  textColor = 'white', bgColor,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds
  if (currentTime < raceStart) return null

  let displayText: string
  let bgKey: 'neutral' | LapColor

  if (currentTime >= raceEnd) {
    const timeSinceEnd = currentTime - raceEnd
    if (timeSinceEnd < FLASH_DURATION_SECONDS) {
      const lastIndex = timestamps.length - 1
      displayText = formatTime(timestamps[lastIndex].lap.lapTime)
      bgKey = lapColors[lastIndex]
    } else {
      displayText = 'END'
      bgKey = 'neutral'
    }
  } else {
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < FLASH_DURATION_SECONDS && currentIdx > 0

    if (isFlashing) {
      displayText = formatTime(timestamps[currentIdx - 1].lap.lapTime)
      bgKey = lapColors[currentIdx - 1]
    } else {
      displayText = formatTime(lapElapsed)
      bgKey = 'neutral'
    }
  }

  const background = bgKey === 'neutral' && bgColor ? bgColor : BACKGROUND[bgKey]
  const containerStyle: React.CSSProperties = {
    width: 300 * scale,
    height: 80 * scale,
    clipPath: 'polygon(0 0, 100% 0, 83% 100%, 17% 100%)',
    background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const spanStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 36 * scale,
    fontWeight: 400,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  return (
    <div style={containerStyle}>
      <span style={spanStyle}>{displayText}</span>
    </div>
  )
}
```

- [ ] **Step 3: Update `LapCounter` props**

In `apps/renderer/src/styles/banner/LapCounter.tsx`:

1. Remove the import of `getLapAtTime`.
2. Add `currentLap: LapTimestamp` and `currentTime: number` to `Props`, remove `fps`.
3. Replace the internal `useMemo` that calls `getLapAtTime` with direct use of `currentLap`.

```tsx
import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLap: LapTimestamp
  currentTime: number
  textColor?: string
}

export const LapCounter: React.FC<Props> = ({ timestamps, currentLap, currentTime, textColor = 'white' }) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds
  const total = timestamps.length

  const displayText = useMemo(
    () => `${String(currentLap.lap.number).padStart(2, '0')}/${total}`,
    [currentLap, total],
  )

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: 180 * scale,
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16 * scale,
    gap: 2 * scale,
  }), [scale])

  const labelStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: textColor,
    opacity: 0.75,
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const valueStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 28 * scale,
    fontWeight: 700,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  if (currentTime < raceStart) return null

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>LAP</span>
      <span style={valueStyle}>{displayText}</span>
    </div>
  )
}
```

- [ ] **Step 4: Update `PositionCounter` props**

In `apps/renderer/src/styles/banner/PositionCounter.tsx`:

1. Remove imports of `getLapAtTime` and the internal `useMemo` calls that compute `currentLap` and `currentIdx`.
2. Accept `currentLap`, `currentIdx`, and `currentTime` as props; remove `fps`.

```tsx
import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getPosition } from '../../position'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  mode: SessionMode
  startingGridPosition?: number
  textColor?: string
}

export const PositionCounter: React.FC<Props> = ({
  timestamps, currentLaps, sessionAllLaps,
  currentLap, currentIdx, currentTime,
  mode, startingGridPosition, textColor = 'white',
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds

  const position = useMemo<number | null>(() => {
    if (currentTime < raceStart || currentIdx === 0) return startingGridPosition ?? null
    return getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)
  }, [currentTime, raceStart, currentIdx, startingGridPosition, mode, currentLap, currentLaps, sessionAllLaps])

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: 180 * scale,
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16 * scale,
    gap: 2 * scale,
  }), [scale])

  const labelStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: textColor,
    opacity: 0.75,
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const valueStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 44 * scale,
    fontWeight: 700,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  return (
    <div style={containerStyle}>
      {position != null && (
        <>
          <span style={labelStyle}>POSITION</span>
          <span style={valueStyle}>P{position}</span>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update `TimeLabelPanel` props**

In `apps/renderer/src/styles/banner/TimeLabelPanel.tsx`:

1. Remove imports of `getLapAtTime`.
2. Accept `currentLap`, `currentIdx`, and `currentTime` as props; remove `fps`.
3. Remove the two `useMemo` calls that computed `currentLap` and `currentIdx` internally.

```tsx
import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getCompletedLaps, getSessionBest } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  variant: 'last' | 'best'
  textColor?: string
}

function formatBannerTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalS = Math.floor(totalMs / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  const sStr = String(s).padStart(2, '0')
  const msStr = String(ms).padStart(3, '0')
  return m > 0 ? `${m}:${sStr}.${msStr}` : `${sStr}.${msStr}`
}

export const TimeLabelPanel: React.FC<Props> = ({
  timestamps, currentIdx, currentTime, variant, textColor = 'white',
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds

  const completedLaps = useMemo(
    () => currentIdx >= 1 ? getCompletedLaps(timestamps, currentIdx) : [],
    [timestamps, currentIdx],
  )
  const displayTime = useMemo(
    () => variant === 'last'
      ? completedLaps[completedLaps.length - 1]?.lap.lapTime ?? null
      : getSessionBest(completedLaps),
    [variant, completedLaps],
  )

  const label = variant === 'last' ? 'LAST' : 'BEST'

  const labelStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: textColor,
    opacity: 0.75,
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const valueStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 28 * scale,
    fontWeight: 700,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: '100%',
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10 * scale,
  }), [scale])

  if (currentTime < raceStart) return null
  if (currentIdx < 1 || displayTime == null) return null

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{formatBannerTime(displayTime)}</span>
      <span style={labelStyle}>LAP</span>
    </div>
  )
}
```

- [ ] **Step 6: Update `Banner` to compute `currentLap`, `currentIdx`, `currentTime`, and `raceEnd` once and pass them to children**

In `apps/renderer/src/styles/banner/index.tsx`, add `useCurrentFrame` to the Remotion import and `getLapAtTime` to the timing import. Then:

1. Add these computations after the existing `useMemo` calls for `lapColors` / `accent` / `text`:

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'

const DEFAULT_ACCENT = '#3DD73D'

export const Banner: React.FC<OverlayProps> = ({
  session, sessionAllLaps, fps, mode, startingGridPosition,
  accentColor, textColor, timerTextColor, timerBgColor,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const accent = accentColor ?? DEFAULT_ACCENT
  const text = textColor ?? 'white'

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, currentTime), [session.timestamps, currentTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])
  const raceEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const outerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10 * scale,
    overflow: 'hidden',
  }), [scale])

  const bgStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    inset: 0,
    background: accent,
    opacity: 0.82,
  }), [accent])

  const wrapperStyle: React.CSSProperties = useMemo(() => ({
    position: 'relative',
    display: 'flex',
  }), [])

  if (showTimePanels) {
    return (
      <AbsoluteFill>
        <div style={outerStyle}>
          <div style={bgStyle} />
          <div style={wrapperStyle}>
            <PositionCounter
              timestamps={session.timestamps}
              currentLaps={session.laps}
              sessionAllLaps={sessionAllLaps}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentLap={currentLap}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="last"
                textColor={text}
              />
            </div>
            <LapTimerTrap
              timestamps={session.timestamps}
              lapColors={lapColors}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              raceEnd={raceEnd}
              textColor={timerTextColor ?? text}
              bgColor={timerBgColor}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentLap={currentLap}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="best"
                textColor={text}
              />
            </div>
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
            />
          </div>
        </div>
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <PositionCounter
          timestamps={session.timestamps}
          currentLaps={session.laps}
          sessionAllLaps={sessionAllLaps}
          currentLap={currentLap}
          currentIdx={currentIdx}
          currentTime={currentTime}
          mode={mode}
          startingGridPosition={startingGridPosition}
          textColor={text}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap
          timestamps={session.timestamps}
          lapColors={lapColors}
          currentLap={currentLap}
          currentIdx={currentIdx}
          currentTime={currentTime}
          raceEnd={raceEnd}
          textColor={timerTextColor ?? text}
          bgColor={timerBgColor}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter
          timestamps={session.timestamps}
          currentLap={currentLap}
          currentTime={currentTime}
          textColor={text}
        />
      </div>
    </AbsoluteFill>
  )
}
```

Note: `raceEnd` is moved here from `LapTimerTrap` (previously a `useMemo` inside that component). `raceStart` is accessed directly from `timestamps[0].ytSeconds` inside each child.

- [ ] **Step 7: Verify TypeScript compiles cleanly**

```bash
cd apps/renderer && pnpm build
```

Expected: no type errors.

- [ ] **Step 8: Run full test suite**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/renderer/src/styles/banner/
git commit -m "perf(renderer): lift getLapAtTime/indexOf to Banner, pass currentLap+currentIdx as props"
```

---

### Task 5: Drop trivial `useMemo` calls in `Banner`

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`

**Context:** After Task 4, `Banner/index.tsx` still has two `useMemo` calls that wrap nullish-coalescing expressions — `accentColor ?? DEFAULT_ACCENT` and `textColor ?? 'white'`. These are effectively free computations; `useMemo` adds closure allocation and dep-array comparison overhead that costs more than the expression itself saves. Task 4's updated `Banner` already removes these (they become plain `const` assignments). If applying tasks independently, verify and remove any remaining trivial `useMemo` for `accent` and `text`.

This task is already incorporated into the `Banner` rewrite in Task 4. Verify the file does not contain:

```ts
const accent = useMemo(() => accentColor ?? DEFAULT_ACCENT, [accentColor])
const text   = useMemo(() => textColor ?? 'white', [textColor])
```

If it does (because Task 4 was applied differently), replace both with plain `const`:

```ts
const accent = accentColor ?? DEFAULT_ACCENT
const text = textColor ?? 'white'
```

- [ ] **Step 1: Check and fix if needed, then run tests**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Commit (only if a change was needed)**

```bash
git add apps/renderer/src/styles/banner/index.tsx
git commit -m "perf(renderer): replace trivial useMemo with plain const in Banner"
```

---

## Chunk 3: Precomputed Position Rankings

### Task 6: Precompute all lap positions in `PositionCounter`

**Files:**
- Modify: `apps/renderer/src/styles/banner/PositionCounter.tsx`

**Context:** Currently `getPosition` is called from a `useMemo` that fires whenever `currentLap` changes (i.e. on every lap transition). Each call iterates over all drivers to compare scores — O(D) driver iterations, each O(L) for qualifying mode. For a session with 15 drivers and 30 laps, each lap transition triggers O(15 × 30) = 450 comparisons.

By precomputing a `number[]` of positions for every lap at once — using a single `useMemo([mode, currentLaps, sessionAllLaps])` that only re-runs when session data changes — each lap transition becomes an O(1) array lookup. The precompute does the same total work, but only once for the whole session rather than per lap change.

- [ ] **Step 1: Run position tests to establish a baseline**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose position
```

Expected: all tests pass.

- [ ] **Step 2: Update `PositionCounter` to precompute all positions**

Replace the `position` useMemo in `PositionCounter` with a precomputed array + per-frame lookup:

```tsx
// Precompute position for every lap — fires once per session, not per lap change.
const positions = useMemo<(number | null)[]>(() => {
  const result: (number | null)[] = [startingGridPosition ?? null] // index 0 = before race starts
  for (let n = 1; n <= currentLaps.length; n++) {
    result.push(getPosition(mode, n, currentLaps, sessionAllLaps))
  }
  return result
}, [mode, currentLaps, sessionAllLaps, startingGridPosition])

// O(1) lookup per lap change.
// positions[0] = pre-race value; positions[n] = getPosition(..., n, ...) for n=1..N.
// currentIdx is 0-based, so currentLap.lap.number = currentIdx + 1 → positions[currentIdx + 1].
const position: number | null =
  currentTime < raceStart || currentIdx === 0
    ? positions[0]
    : positions[currentIdx + 1] ?? null
```

Remove the old `position` useMemo entirely. All three style `useMemo` blocks (`containerStyle`, `labelStyle`, `valueStyle`) from Task 4 must be preserved unchanged.

The full updated `PositionCounter` (after Task 4's prop changes):

```tsx
import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getPosition } from '../../position'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  mode: SessionMode
  startingGridPosition?: number
  textColor?: string
}

export const PositionCounter: React.FC<Props> = ({
  timestamps, currentLaps, sessionAllLaps,
  currentLap, currentIdx, currentTime,
  mode, startingGridPosition, textColor = 'white',
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920
  const raceStart = timestamps[0].ytSeconds

  const positions = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = [startingGridPosition ?? null]
    for (let n = 1; n <= currentLaps.length; n++) {
      result.push(getPosition(mode, n, currentLaps, sessionAllLaps))
    }
    return result
  }, [mode, currentLaps, sessionAllLaps, startingGridPosition])

  const position: number | null =
    currentTime < raceStart || currentIdx === 0
      ? positions[0]
      : positions[currentIdx] ?? null

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: 180 * scale,
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16 * scale,
    gap: 2 * scale,
  }), [scale])

  const labelStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: textColor,
    opacity: 0.75,
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const valueStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 44 * scale,
    fontWeight: 700,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  return (
    <div style={containerStyle}>
      {position != null && (
        <>
          <span style={labelStyle}>POSITION</span>
          <span style={valueStyle}>P{position}</span>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass. (The `position.test.ts` tests exercise `getPosition` directly, not `PositionCounter`, so they remain valid regression coverage.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/renderer && pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/styles/banner/PositionCounter.tsx
git commit -m "perf(renderer): precompute all lap positions once, replace per-lap-change getPosition call with O(1) lookup"
```

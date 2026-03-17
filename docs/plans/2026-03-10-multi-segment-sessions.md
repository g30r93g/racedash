# Multi-Segment Sessions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a single rendered video to contain multiple session segments (practice, qualifying, race) each driven by its own Alpha Timing URL, with the overlay switching behaviour at segment boundaries and showing a configurable label around each transition.

**Architecture:** Three independent changes: (1) update `@racedash/core` types to replace `mode/session/sessionAllLaps` on `OverlayProps` with `segments: SessionSegment[]`; (2) add a `resolveActiveSegment` pure function + `useActiveSegment` hook and wire all four overlay styles to use it; (3) update the CLI `render` command to accept `--config <file>` or inline `--url/--mode/--offset` flags, with `--driver` now a required flag.

**Tech Stack:** TypeScript, React 18, Remotion, Vitest, Commander.js

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `packages/core/src/index.ts` | Add `SessionSegment`, update `OverlayProps` |
| Create | `apps/renderer/src/activeSegment.ts` | `resolveActiveSegment` pure fn + `useActiveSegment` hook (note: spec names this `useActiveSegment.ts`; plan uses `activeSegment.ts` — intentional, the file contains both the pure fn and the hook) |
| Create | `apps/renderer/src/activeSegment.test.ts` | Unit tests for segment resolution logic |
| Create | `apps/renderer/src/SegmentLabel.tsx` | Shared label overlay component |
| Modify | `apps/renderer/src/Root.tsx` | Update `defaultProps` to use `segments` shape |
| Modify | `apps/renderer/src/styles/banner/index.tsx` | Use `useActiveSegment`, add label |
| Modify | `apps/renderer/src/styles/esports/index.tsx` | Use `useActiveSegment`, add END state + label |
| Modify | `apps/renderer/src/styles/minimal/index.tsx` | Use `useActiveSegment`, add END state + label |
| Modify | `apps/renderer/src/styles/modern/index.tsx` | Use `useActiveSegment`, add END state + label |
| Modify | `apps/cli/src/index.ts` | `--config`/inline flags, `--driver` required |

---

## Chunk 1: Core Types + Segment Resolution

### Task 1: Update `@racedash/core` types

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Run the renderer and scraper test suites to establish a green baseline**

```bash
cd apps/renderer && pnpm test
cd packages/scraper && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2: Replace the contents of `packages/core/src/index.ts`**

```ts
export interface Lap {
  number: number
  lapTime: number      // individual lap duration in seconds
  cumulative: number   // sum of all laps up to and including this one
}

export interface LapTimestamp {
  lap: Lap
  ytSeconds: number    // seconds from video start to this lap's START
}

export interface SessionData {
  driver: { kart: string; name: string }
  laps: Lap[]
  timestamps: LapTimestamp[]
}

export type SessionMode = 'practice' | 'qualifying' | 'race'

export type BoxPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver; segment-isolated (no cross-segment data)
  label?: string            // shown ±labelWindowSeconds around this segment's offset
}

export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number   // race only: grid position at race start
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  labelWindowSeconds?: number     // default 5
}
```

- [ ] **Step 3: Build the core package to verify no type errors**

```bash
cd packages/core && pnpm build
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): replace mode/session/sessionAllLaps with segments: SessionSegment[]"
```

---

### Task 2: Create `resolveActiveSegment` pure function and `useActiveSegment` hook

**Files:**
- Create: `apps/renderer/src/activeSegment.ts`
- Create: `apps/renderer/src/activeSegment.test.ts`

The pure function returns the active segment, whether it is in END state, and a label string when within any segment's label window.

Label window for segment i:
- `labelStart = Math.max(segOffset - window, prevSegEnd ?? 0)`
- `labelEnd = segOffset + window`

This clamps the pre-transition window so it never overlaps the previous session's active laps.

- [ ] **Step 1: Create the test file `apps/renderer/src/activeSegment.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { SessionSegment } from '@racedash/core'
import { resolveActiveSegment } from './activeSegment'

// Helper: minimal SessionSegment with a given offset and optional single lap
function seg(
  offset: number,
  lapTime: number,
  label?: string,
): SessionSegment {
  const ts = { lap: { number: 1, lapTime, cumulative: lapTime }, ytSeconds: offset }
  return {
    mode: 'practice',
    session: { driver: { kart: '1', name: 'Test' }, laps: [ts.lap], timestamps: [ts] },
    sessionAllLaps: [[ts.lap]],
    label,
  }
}

// seg0: starts at t=100, lapTime=60  → ends at t=160
// seg1: starts at t=200, lapTime=50  → ends at t=250
const SEG0 = seg(100, 60, 'Practice Start')
const SEG1 = seg(200, 50, 'Qualifying Start')
const SEGMENTS = [SEG0, SEG1]

describe('resolveActiveSegment', () => {
  describe('active segment selection', () => {
    it('returns first segment before any offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 50, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment at its exact offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 100, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment during its active laps', () => {
      const r = resolveActiveSegment(SEGMENTS, 130, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment in END state (past its last lap but before second offset)', () => {
      const r = resolveActiveSegment(SEGMENTS, 175, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('switches to second segment at its exact offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 200, 5)
      expect(r.segment).toBe(SEG1)
    })

    it('returns last segment after all laps complete', () => {
      const r = resolveActiveSegment(SEGMENTS, 9999, 5)
      expect(r.segment).toBe(SEG1)
    })
  })

  describe('isEnd', () => {
    it('is false during active laps of first segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 130, 5).isEnd).toBe(false)
    })

    it('is true once past the last lap end of the active segment', () => {
      // SEG0 ends at t=160; t=161 is END for SEG0
      expect(resolveActiveSegment(SEGMENTS, 161, 5).isEnd).toBe(true)
    })

    it('is false immediately after switching to second segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 205, 5).isEnd).toBe(false)
    })

    it('is true past the last lap of the final segment', () => {
      // SEG1 ends at t=250
      expect(resolveActiveSegment(SEGMENTS, 260, 5).isEnd).toBe(true)
    })
  })

  describe('label', () => {
    it('shows label for first segment within its window (before offset)', () => {
      // SEG0 offset=100, window=5 → labelStart=max(95, 0)=95, labelEnd=105
      expect(resolveActiveSegment(SEGMENTS, 97, 5).label).toBe('Practice Start')
    })

    it('shows label for first segment within its window (after offset)', () => {
      expect(resolveActiveSegment(SEGMENTS, 103, 5).label).toBe('Practice Start')
    })

    it('returns null outside the label window of first segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 110, 5).label).toBeNull()
    })

    it('shows label for second segment within its window (before offset)', () => {
      // SEG0 ends at t=160, SEG1 offset=200, window=5
      // labelStart = max(200-5, 160) = max(195,160) = 195
      expect(resolveActiveSegment(SEGMENTS, 197, 5).label).toBe('Qualifying Start')
    })

    it('shows label for second segment within its window (after offset)', () => {
      expect(resolveActiveSegment(SEGMENTS, 203, 5).label).toBe('Qualifying Start')
    })

    it('returns null in the gap before the second segment label window', () => {
      // gap is t=160..195; t=180 is in the gap
      expect(resolveActiveSegment(SEGMENTS, 180, 5).label).toBeNull()
    })

    it('clamps pre-window to prevSegEnd when sessions are back-to-back', () => {
      // SEG0 ends at 160, SEG1 offset=162 → labelStart=max(157,160)=160
      const s1 = seg(100, 60, 'Practice Start')
      const s2 = seg(162, 50, 'Qualifying Start')
      // t=159: before prevEnd (160), so still outside label window
      expect(resolveActiveSegment([s1, s2], 159, 5).label).toBeNull()
      // t=162: at offset, inside window
      expect(resolveActiveSegment([s1, s2], 163, 5).label).toBe('Qualifying Start')
    })

    it('returns null when segment has no label', () => {
      const unlabelled = [seg(100, 60), seg(200, 50)]
      expect(resolveActiveSegment(unlabelled, 97, 5).label).toBeNull()
    })

    it('respects custom window size', () => {
      // window=10; SEG0 offset=100, labelStart=max(90,0)=90
      expect(resolveActiveSegment(SEGMENTS, 92, 10).label).toBe('Practice Start')
      expect(resolveActiveSegment(SEGMENTS, 88, 10).label).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the test file to confirm all tests fail (function not yet defined)**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose activeSegment
```

Expected: fails with import error or "resolveActiveSegment is not a function".

- [ ] **Step 3: Create `apps/renderer/src/activeSegment.ts`**

```ts
import { useMemo } from 'react'
import type { SessionSegment } from '@racedash/core'

export interface ActiveSegmentResult {
  segment: SessionSegment
  isEnd: boolean
  label: string | null
}

/**
 * Resolves the active segment and transition state for a given video time.
 *
 * Active segment: the last segment whose offset (timestamps[0].ytSeconds) <= currentTime.
 * If currentTime is before the first segment's offset, returns the first segment
 * (the overlay will be hidden via its own raceStart guard).
 *
 * isEnd: true when currentTime >= the active segment's last lap end time.
 *
 * label: the label string of the first segment whose label window covers currentTime, or null.
 * Label window for segment i:
 *   labelStart = max(segOffset - window, prevSegEnd ?? 0)   — clamped so it never overlaps prior session
 *   labelEnd   = segOffset + window
 */
export function resolveActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds: number,
): ActiveSegmentResult {
  // Find active segment index
  let activeIdx = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].session.timestamps[0].ytSeconds <= currentTime) activeIdx = i
  }
  const segment = segments[activeIdx]

  // Compute isEnd
  const lastTs = segment.session.timestamps[segment.session.timestamps.length - 1]
  const segEnd = lastTs.ytSeconds + lastTs.lap.lapTime
  const isEnd = currentTime >= segEnd

  // Compute label
  let label: string | null = null
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (!s.label) continue
    const segOffset = s.session.timestamps[0].ytSeconds
    let prevEnd = 0
    if (i > 0) {
      const prev = segments[i - 1]
      const prevLast = prev.session.timestamps[prev.session.timestamps.length - 1]
      prevEnd = prevLast.ytSeconds + prevLast.lap.lapTime
    }
    const labelStart = Math.max(segOffset - labelWindowSeconds, prevEnd)
    const labelEnd = segOffset + labelWindowSeconds
    if (currentTime >= labelStart && currentTime <= labelEnd) {
      label = s.label
      break
    }
  }

  return { segment, isEnd, label }
}

/** Memoised hook wrapper around resolveActiveSegment. */
export function useActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds = 5,
): ActiveSegmentResult {
  return useMemo(
    () => resolveActiveSegment(segments, currentTime, labelWindowSeconds),
    [segments, currentTime, labelWindowSeconds],
  )
}
```

- [ ] **Step 4: Run the tests and confirm all pass**

```bash
cd apps/renderer && pnpm test -- --reporter=verbose activeSegment
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/activeSegment.ts apps/renderer/src/activeSegment.test.ts
git commit -m "feat(renderer): add resolveActiveSegment pure fn + useActiveSegment hook"
```

---

## Chunk 2: Overlay Style Updates

### Task 3: Create `SegmentLabel` shared component

**Files:**
- Create: `apps/renderer/src/SegmentLabel.tsx`

- [ ] **Step 1: Create `apps/renderer/src/SegmentLabel.tsx`**

```tsx
import React from 'react'
import { fontFamily } from './Root'

interface Props {
  label: string
  scale: number
}

/**
 * Renders a centered pill label (e.g. "Qualifying Start") over the overlay.
 * Intended to be placed inside an AbsoluteFill so it covers the full canvas.
 */
export const SegmentLabel: React.FC<Props> = ({ label, scale }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.72)',
        padding: `${12 * scale}px ${28 * scale}px`,
        borderRadius: 8 * scale,
        fontFamily,
        fontSize: 36 * scale,
        fontWeight: 700,
        color: 'white',
        letterSpacing: 2 * scale,
        textTransform: 'uppercase',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  </div>
)
```

- [ ] **Step 2: Commit**

Note: do not run a full build here — the renderer will have TypeScript errors from style files that still reference the old `OverlayProps` shape. The build is verified after all style tasks are complete (Task 8, Step 2).

```bash
git add apps/renderer/src/SegmentLabel.tsx
git commit -m "feat(renderer): add SegmentLabel shared overlay component"
```

---

### Task 4: Update `Root.tsx` default props

**Files:**
- Modify: `apps/renderer/src/Root.tsx`

- [ ] **Step 1: Replace the `defaultProps` block in `apps/renderer/src/Root.tsx`**

Find:
```ts
const defaultProps: OverlayProps = {
  session: defaultSession,
  sessionAllLaps: [defaultSession.laps],
  mode: 'race',
  fps: 60,
  durationInFrames: 300,
}
```

Replace with:
```ts
const defaultProps: OverlayProps = {
  segments: [
    {
      mode: 'race',
      session: defaultSession,
      sessionAllLaps: [defaultSession.laps],
      label: 'Race Start',
    },
  ],
  fps: 60,
  durationInFrames: 300,
}
```

- [ ] **Step 2: Commit**

Do not run a build here — the renderer will have TypeScript errors from style files still referencing old `OverlayProps` fields. The build is verified after all style files are updated (Task 8, Step 2).

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/Root.tsx
git commit -m "feat(renderer): update Root defaultProps to segments array"
```

---

### Task 5: Update `Banner` overlay style

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`

Banner already has END-state handling in `LapTimerTrap` (it shows "END" after the session). The main changes are: destructure `segment` from `useActiveSegment`, source `session/sessionAllLaps/mode` from it, and render the label.

- [ ] **Step 1: Replace `apps/renderer/src/styles/banner/index.tsx`**

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapAtTime } from '../../timing'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'

const DEFAULT_ACCENT = '#3DD73D'

export const Banner: React.FC<OverlayProps> = ({
  segments, fps, startingGridPosition,
  accentColor, textColor, timerTextColor, timerBgColor, labelWindowSeconds,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps, mode } = segment

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

  const raceStart = session.timestamps[0].ytSeconds
  if (currentTime < raceStart && !isEnd) return null

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
              currentIdx={currentIdx}
              currentTime={currentTime}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
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
        {label && <SegmentLabel label={label} scale={scale} />}
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
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
```

Key changes vs original:
- Props: `segments` + `labelWindowSeconds` replace `session/sessionAllLaps/mode`
- `useActiveSegment` call at top
- **New early return guard**: `if (currentTime < raceStart && !isEnd) return null` — the original Banner had no top-level guard (children handled it individually). This new guard hides the entire Banner before the active segment starts. When `isEnd=true` (between segments), `raceStart` is the previous segment's offset (in the past), so the guard does not fire and the Banner remains visible in END state. This is intentional and correct.
- `<SegmentLabel>` rendered when `label` is non-null

- [ ] **Step 2: Run the test suite**

```bash
cd apps/renderer && pnpm test
```

Expected: all existing tests pass (banner child components are unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/banner/index.tsx
git commit -m "feat(renderer): migrate Banner to useActiveSegment + segment label"
```

---

### Task 6: Update `Esports` overlay style

**Files:**
- Modify: `apps/renderer/src/styles/esports/index.tsx`

Esports currently returns `null` after `raceEnd`. In multi-segment mode it must show frozen END state. Strategy: compute `effectiveTime = isEnd ? segEnd - 0.001 : currentTime` and use it for lap/elapsed lookups. Remove the `currentTime >= raceEnd` early-return guard.

- [ ] **Step 1: Replace `apps/renderer/src/styles/esports/index.tsx`**

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed, getCompletedLaps, getSessionBest } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'

const EMPTY_TIME = '—:--.---'

function StopwatchIcon({ size, color = 'white' }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v2" />
      <path d="M10 2h4" />
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 13" />
    </svg>
  )
}

interface TimePanelProps {
  iconBg: string
  label: string
  time: string
  sc: number
}

const TimePanel = React.memo(function TimePanel({ iconBg, label, time, sc }: TimePanelProps) {
  const iconBgSize = 40 * sc
  const iconSize = 22 * sc

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * sc }}>
      <div
        style={{
          width: iconBgSize,
          height: iconBgSize,
          background: iconBg,
          borderRadius: 6 * sc,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <StopwatchIcon size={iconSize} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * sc }}>
        <span
          style={{
            fontSize: 10 * sc,
            fontWeight: 400,
            color: '#9ca3af',
            letterSpacing: 1.5 * sc,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 26 * sc,
            fontWeight: 400,
            color: 'white',
            letterSpacing: 0.5 * sc,
            lineHeight: 1,
          }}
        >
          {time}
        </span>
      </div>
    </div>
  )
})

export const Esports: React.FC<OverlayProps> = ({ segments, fps, boxPosition = 'bottom-left', labelWindowSeconds }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps } = segment

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  // Freeze time at last moment of session when in END state (between segments)
  const effectiveTime = isEnd ? segEnd - 0.001 : currentTime

  const currentLap = useMemo(
    () => getLapAtTime(session.timestamps, effectiveTime),
    [session.timestamps, effectiveTime],
  )
  const currentIdx = useMemo(
    () => session.timestamps.indexOf(currentLap),
    [session.timestamps, currentLap],
  )
  const completedLaps = useMemo(
    () => getCompletedLaps(session.timestamps, currentIdx),
    [session.timestamps, currentIdx],
  )
  const lastLapTime = useMemo(
    () => completedLaps.length > 0
      ? formatLapTime(completedLaps[completedLaps.length - 1].lap.lapTime)
      : EMPTY_TIME,
    [completedLaps],
  )
  const sessionBestTime = useMemo(() => {
    const best = getSessionBest(completedLaps)
    return best !== null ? formatLapTime(best) : EMPTY_TIME
  }, [completedLaps])

  const styles = useMemo(() => {
    const margin = 20 * sc
    const pad = 16 * sc
    const vPos = boxPosition.startsWith('top') ? { top: margin } : { bottom: margin }
    const hPos = boxPosition.endsWith('right') ? { right: margin } : { left: margin }
    return {
      container: {
        position: 'absolute' as const,
        ...vPos,
        ...hPos,
        width: 400 * sc,
        display: 'flex',
        flexDirection: 'column' as const,
        fontFamily,
        userSelect: 'none' as const,
      },
      accentBar: {
        height: 28 * sc,
        background: 'linear-gradient(to right, #2563eb, #7c3aed)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: pad,
      },
      accentText: {
        fontSize: 12 * sc,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 1.5 * sc,
        textTransform: 'uppercase' as const,
      },
      timePanels: {
        background: '#3f4755',
        padding: `${pad}px ${pad}px`,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 14 * sc,
      },
      currentBar: {
        background: '#111',
        height: 56 * sc,
        display: 'flex',
        alignItems: 'center',
        gap: 10 * sc,
        paddingLeft: pad,
        paddingRight: pad,
        boxSizing: 'border-box' as const,
      },
      currentLabel: {
        fontSize: 12 * sc,
        fontWeight: 400,
        color: '#9ca3af',
        letterSpacing: 2 * sc,
        textTransform: 'uppercase' as const,
      },
      currentTime: {
        marginLeft: 'auto',
        fontSize: 26 * sc,
        fontWeight: 400,
        color: 'white',
        letterSpacing: 0.5 * sc,
      },
      stopwatchSize: 18 * sc,
    }
  }, [sc, boxPosition])

  // Hidden before the active segment starts (and not in END state from a prior segment)
  if (currentTime < raceStart && !isEnd) return null

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill>
      <div style={styles.container}>
        <div style={styles.accentBar}>
          <span style={styles.accentText}>
            LAP {currentLap.lap.number} / {session.timestamps.length}
          </span>
        </div>
        <div style={styles.timePanels}>
          <TimePanel iconBg="#16a34a" label="LAST LAP" time={lastLapTime} sc={sc} />
          <TimePanel iconBg="#7c3aed" label="SESSION BEST" time={sessionBestTime} sc={sc} />
        </div>
        <div style={styles.currentBar}>
          <StopwatchIcon size={styles.stopwatchSize} color="#9ca3af" />
          <span style={styles.currentLabel}>CURRENT</span>
          <span style={styles.currentTime}>{elapsedFormatted}</span>
        </div>
      </div>
      {label && <SegmentLabel label={label} scale={sc} />}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/esports/index.tsx
git commit -m "feat(renderer): migrate Esports to useActiveSegment + END state + label"
```

---

### Task 7: Update `Minimal` overlay style

**Files:**
- Modify: `apps/renderer/src/styles/minimal/index.tsx`

Same pattern as Esports: `effectiveTime` clamping, remove `raceEnd` null guard, add `SegmentLabel`.

- [ ] **Step 1: Replace `apps/renderer/src/styles/minimal/index.tsx`**

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed, getCompletedLaps, getSessionBest } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'

const EMPTY_TIME = '—:--.---'

interface StatColumnProps {
  label: string
  value: string
  scale: number
}

const StatColumn = React.memo(function StatColumn({ label, value, scale }: StatColumnProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * scale }}>
      <span
        style={{
          fontSize: 10 * scale,
          fontWeight: 400,
          color: '#aaaaaa',
          letterSpacing: 1.5 * scale,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18 * scale,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 0.5 * scale,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  )
})

export const Minimal: React.FC<OverlayProps> = ({ segments, fps, boxPosition = 'bottom-left', labelWindowSeconds }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps } = segment

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const effectiveTime = isEnd ? segEnd - 0.001 : currentTime

  const currentLap = useMemo(
    () => getLapAtTime(session.timestamps, effectiveTime),
    [session.timestamps, effectiveTime],
  )
  const currentIdx = useMemo(
    () => session.timestamps.indexOf(currentLap),
    [session.timestamps, currentLap],
  )
  const completedLaps = useMemo(
    () => getCompletedLaps(session.timestamps, currentIdx),
    [session.timestamps, currentIdx],
  )
  const lastLapTime = useMemo(
    () => completedLaps.length > 0
      ? formatLapTime(completedLaps[completedLaps.length - 1].lap.lapTime)
      : EMPTY_TIME,
    [completedLaps],
  )
  const sessionBestTime = useMemo(() => {
    const best = getSessionBest(completedLaps)
    return best !== null ? formatLapTime(best) : EMPTY_TIME
  }, [completedLaps])

  const styles = useMemo(() => {
    const margin = 20 * scale
    const vPos = boxPosition.startsWith('top') ? { top: margin } : { bottom: margin }
    const hPos = boxPosition.endsWith('right') ? { right: margin } : { left: margin }
    const padV = 14 * scale
    const padH = 20 * scale
    const badgeSize = 36 * scale
    return {
      card: {
        position: 'absolute' as const,
        ...vPos,
        ...hPos,
        width: 440 * scale,
        height: 150 * scale,
        background: 'rgba(20, 22, 28, 0.88)',
        borderRadius: 12 * scale,
        padding: `${padV}px ${padH}px`,
        boxSizing: 'border-box' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'space-between',
        fontFamily,
        userSelect: 'none' as const,
      },
      row: {
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        gap: 12 * scale,
      },
      badge: {
        width: badgeSize,
        height: badgeSize,
        background: 'white',
        borderRadius: 4 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      badgeText: {
        fontSize: 18 * scale,
        fontWeight: 700,
        color: '#222222',
        lineHeight: 1,
      },
      elapsed: {
        fontSize: 58 * scale,
        fontWeight: 700,
        fontStyle: 'italic',
        color: 'white',
        lineHeight: 1,
        letterSpacing: -0.5 * scale,
      },
      statRow: {
        display: 'flex',
        flexDirection: 'row' as const,
        gap: 28 * scale,
      },
    }
  }, [scale, boxPosition])

  if (currentTime < raceStart && !isEnd) return null

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill>
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.badge}>
            <span style={styles.badgeText}>{currentLap.lap.number}</span>
          </div>
          <span style={styles.elapsed}>{elapsedFormatted}</span>
        </div>
        <div style={styles.statRow}>
          <StatColumn label="LAST LAP" value={lastLapTime} scale={scale} />
          <StatColumn label="SESSION BEST" value={sessionBestTime} scale={scale} />
        </div>
      </div>
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd apps/renderer && pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/minimal/index.tsx
git commit -m "feat(renderer): migrate Minimal to useActiveSegment + END state + label"
```

---

### Task 8: Update `Modern` overlay style

**Files:**
- Modify: `apps/renderer/src/styles/modern/index.tsx`

Modern uses `sessionAllLaps.flat()` for session best — it should now come from `segment.sessionAllLaps` (segment-isolated). Same `effectiveTime` pattern.

- [ ] **Step 1: Replace `apps/renderer/src/styles/modern/index.tsx`**

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'

const PLACEHOLDER = '—:--.---'

export const Modern: React.FC<OverlayProps> = ({ segments, fps, labelWindowSeconds }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 520

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps } = segment

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const effectiveTime = isEnd ? segEnd - 0.001 : currentTime

  const currentLap = useMemo(
    () => getLapAtTime(session.timestamps, effectiveTime),
    [session.timestamps, effectiveTime],
  )
  const currentIdx = useMemo(
    () => session.timestamps.indexOf(currentLap),
    [session.timestamps, currentLap],
  )

  const allLaps = useMemo(() => sessionAllLaps.flat(), [sessionAllLaps])
  const sessionBestTime = useMemo(
    () => allLaps.length > 0
      ? formatLapTime(allLaps.reduce((min, l) => Math.min(min, l.lapTime), Infinity))
      : PLACEHOLDER,
    [allLaps],
  )

  const lastLapTime = useMemo(
    () => currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : PLACEHOLDER,
    [currentIdx, session.timestamps],
  )

  const styles = useMemo(() => {
    const padX = 28 * scale
    const statGap = 24 * scale
    const dividerMargin = 20 * scale
    return {
      container: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
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
      elapsed: {
        flex: 1,
        fontSize: 52 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: 1 * scale,
      },
      divider: {
        width: 1 * scale,
        height: 40 * scale,
        background: 'rgba(255,255,255,0.2)',
        flexShrink: 0,
        marginLeft: dividerMargin,
        marginRight: dividerMargin,
      },
      statGroup: {
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        gap: statGap,
      },
      statCol: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 2 * scale,
      },
      label: {
        fontSize: 11 * scale,
        fontWeight: 400,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase' as const,
        letterSpacing: 2 * scale,
        lineHeight: 1,
      },
      statValue: {
        fontSize: 22 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
      },
    }
  }, [scale])

  if (currentTime < raceStart && !isEnd) return null

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill>
      <div style={styles.container}>
        <span style={styles.elapsed}>{elapsedFormatted}</span>
        <div style={styles.divider} />
        <div style={styles.statGroup}>
          <div style={styles.statCol}>
            <span style={styles.label}>LAST</span>
            <span style={styles.statValue}>{lastLapTime}</span>
          </div>
          <div style={styles.statCol}>
            <span style={styles.label}>BEST</span>
            <span style={styles.statValue}>{sessionBestTime}</span>
          </div>
        </div>
      </div>
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Run full renderer test suite and build**

```bash
cd apps/renderer && pnpm test && pnpm build
```

Expected: all tests pass, build exits 0. At this point TypeScript is fully satisfied across all overlay styles.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/modern/index.tsx
git commit -m "feat(renderer): migrate Modern to useActiveSegment + END state + label"
```

---

## Chunk 3: CLI Updates

### Task 9: Update `render` command in CLI

**Files:**
- Modify: `apps/cli/src/index.ts`

Changes:
- Remove positional `<url> [driver]` args from `render`; add `--driver <name>` (required), `--url <url>`, `--config <path>`
- Remove `--mode` and `--offset` from top-level flags; move to inline segment group (`--mode`, `--url`, `--offset`)
- Validate: either `--config` OR all three of `--url`/`--mode`/`--offset` must be present
- Build `segments: SessionSegment[]` from whichever source is given
- Fetch all segment HTMLs in parallel; match driver by partial name in each
- Construct `OverlayProps` with `segments` instead of `session/sessionAllLaps/mode`

- [ ] **Step 1: Add a config-loader helper at the bottom of the existing utility section in `apps/cli/src/index.ts`**

Add this interface and function (before `program.parseAsync`):

```ts
interface SegmentConfig {
  mode: string
  url: string
  offset: string
  label?: string
}

interface RenderConfig {
  segments: SegmentConfig[]
  driver?: string
}

async function loadRenderConfig(opts: RenderOpts): Promise<{ segments: SegmentConfig[]; driverQuery: string }> {
  if (opts.config) {
    const raw = JSON.parse(await import('node:fs/promises').then(m => m.readFile(opts.config!, 'utf8')))
    const config = raw as RenderConfig
    if (!Array.isArray(config.segments) || config.segments.length === 0) {
      throw new Error('Config file must contain a non-empty "segments" array')
    }
    const driverQuery = opts.driver ?? config.driver
    if (!driverQuery) throw new Error('--driver is required (or set "driver" in config file)')
    return { segments: config.segments, driverQuery }
  }

  // Inline single-segment
  if (!opts.url || !opts.mode || !opts.offset) {
    throw new Error('Provide --config <path> or all of --url, --mode, and --offset for a single segment')
  }
  if (!opts.driver) throw new Error('--driver is required')
  return {
    segments: [{ mode: opts.mode, url: opts.url, offset: opts.offset, label: opts.label }],
    driverQuery: opts.driver,
  }
}
```

- [ ] **Step 2: Update the `RenderOpts` interface**

Replace the existing `RenderOpts` interface with:

```ts
interface RenderOpts {
  config?: string
  url?: string
  offset?: string
  mode?: string
  label?: string
  driver: string
  video: string
  output: string
  fps: string
  style: string
  overlayX: string
  overlayY: string
  boxPosition: string
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  labelWindow?: string
}
```

- [ ] **Step 3: Replace the `render` command definition**

Replace the entire `program.command('render ...)` block with:

```ts
program
  .command('render')
  .description('Render overlay onto video')
  .option('--config <path>', 'Path to JSON session config file')
  .option('--url <url>', 'Session URL (inline single-segment)')
  .option('--mode <mode>', 'Session mode for inline segment: practice, qualifying, or race')
  .option('--offset <time>', 'Video timestamp at session start, e.g. 0:02:15.500 (inline single-segment)')
  .option('--label <text>', 'Segment label shown around offset (inline single-segment)')
  .requiredOption('--driver <name>', 'Driver name (partial, case-insensitive)')
  .requiredOption('--video <path>', 'Source video file path')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--fps <n>', 'Output framerate', '60')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels', '0')
  .option('--box-position <pos>', 'Box corner for esports/minimal: bottom-left, bottom-right, top-left, top-right', 'bottom-left')
  .option('--accent-color <color>', 'Accent color (CSS color or hex, e.g. #3DD73D)')
  .option('--text-color <color>', 'Text color for the overlay (default: white)')
  .option('--timer-text-color <color>', 'Text color for the lap timer (default: white)')
  .option('--timer-bg-color <color>', 'Background color for the lap timer (default: #111111)')
  .option('--label-window <seconds>', 'Seconds before/after segment offset to show label', '5')
  .action(async (opts: RenderOpts) => {
    try {
      const fps = parseInt(opts.fps, 10)
      if (isNaN(fps)) {
        console.error('Error: --fps must be a valid integer')
        process.exit(1)
      }
      const validBoxPositions: BoxPosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
      if (!validBoxPositions.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${validBoxPositions.join(', ')}`)
        process.exit(1)
      }
      const boxPosition = opts.boxPosition as BoxPosition
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? '5')
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }
      const frameDuration = 1 / fps

      const { segments: segmentConfigs, driverQuery } = await loadRenderConfig(opts)

      // Validate all modes up front
      const validModes: SessionMode[] = ['practice', 'qualifying', 'race']
      for (const sc of segmentConfigs) {
        const normalised = sc.mode?.toLowerCase()
        if (!normalised || !validModes.includes(normalised as SessionMode)) {
          console.error(`Error: segment mode "${sc.mode}" must be one of: ${validModes.join(', ')}`)
          process.exit(1)
        }
      }

      process.stderr.write('\n  Fetching session data and probing video...\n')

      // Parse and snap each segment's offset
      const rawOffsets = segmentConfigs.map(sc => parseOffset(sc.offset))
      const snappedOffsets = rawOffsets.map(raw => {
        const snapped = Math.round(Math.round(raw / frameDuration) * frameDuration * 1e6) / 1e6
        return snapped
      })

      // Fetch all segment HTMLs + race grid + video metadata in parallel
      const raceSegmentIndices = segmentConfigs
        .map((sc, i) => (sc.mode.toLowerCase() === 'race' ? i : -1))
        .filter(i => i >= 0)

      const [durationSeconds, videoResolution, ...fetchResults] = await Promise.all([
        getVideoDuration(opts.video),
        getVideoResolution(opts.video),
        ...segmentConfigs.map(sc => fetchHtml(sc.url)),
        ...raceSegmentIndices.map(i => fetchGridHtml(segmentConfigs[i].url)),
      ] as const)

      const htmls = fetchResults.slice(0, segmentConfigs.length) as string[]
      const gridHtmls = fetchResults.slice(segmentConfigs.length) as string[]

      // Build SessionSegment[] — find driver in each segment independently
      const segments: import('@racedash/core').SessionSegment[] = []
      let startingGridPosition: number | undefined

      for (let i = 0; i < segmentConfigs.length; i++) {
        const sc = segmentConfigs[i]
        const mode = sc.mode.toLowerCase() as SessionMode
        const html = htmls[i]
        const offsetSeconds = snappedOffsets[i]

        const allDrivers = parseDrivers(html)
        // Driver matching: partial, case-insensitive; error on 0 or 2+ matches
        const matches = allDrivers.filter(d =>
          d.name.toLowerCase().includes(driverQuery.toLowerCase()),
        )
        if (matches.length === 0) {
          console.error(`Error: no driver matching "${driverQuery}" found in segment ${i + 1} (${sc.url})`)
          process.exit(1)
        }
        if (matches.length > 1) {
          console.error(
            `Error: "${driverQuery}" is ambiguous in segment ${i + 1}. Matches:\n` +
              matches.map(d => `  [${d.kart}] ${d.name}`).join('\n'),
          )
          process.exit(1)
        }
        const driver = matches[0]
        const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

        const session: import('@racedash/core').SessionData = {
          driver: { kart: driver.kart, name: driver.name },
          laps: driver.laps,
          timestamps,
        }

        // Grid position from first race segment
        if (mode === 'race' && startingGridPosition === undefined) {
          const raceIdx = raceSegmentIndices.indexOf(i)
          if (raceIdx >= 0 && gridHtmls[raceIdx]) {
            const grid = parseGrid(gridHtmls[raceIdx])
            const entry = grid.find(e => e.kart === driver.kart)
            if (entry) startingGridPosition = entry.position
            else process.stderr.write(`\n  ⚠  kart ${driver.kart} not found in starting grid\n`)
          }
        }

        const rawOffset = rawOffsets[i]
        const snapped = snappedOffsets[i]
        const offsetSnapped = Math.abs(snapped - rawOffset) >= 0.0001

        stat(`Segment ${i + 1}`, `[${mode}]  ${driver.name}  [${driver.kart}]  ·  ${driver.laps.length} laps`)
        if (offsetSnapped) {
          stat('  Offset', `${formatOffsetTime(rawOffset)} → ${formatOffsetTime(snapped)}  (snapped)`)
        } else {
          stat('  Offset', formatOffsetTime(snapped))
        }
        if (sc.label) stat('  Label', sc.label)

        segments.push({
          mode,
          session,
          sessionAllLaps: allDrivers.map(d => d.laps),
          label: sc.label,
        })
      }

      const durationInFrames = Math.ceil(durationSeconds * fps)

      process.stderr.write('\n')
      stat('Video', `${videoResolution.width}×${videoResolution.height}  ·  ${fps} fps`)
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Style', opts.style)
      const resolvedAccent    = opts.accentColor    ?? '#3DD73D'
      const resolvedText      = opts.textColor      ?? 'white'
      const resolvedTimerText = opts.timerTextColor ?? resolvedText
      const resolvedTimerBg   = opts.timerBgColor   ?? '#111111'
      stat('Accent',      `${colorSwatch(resolvedAccent)}${resolvedAccent}`)
      stat('Text',        `${colorSwatch(resolvedText)}${resolvedText}`)
      stat('Timer text',  `${colorSwatch(resolvedTimerText)}${resolvedTimerText}`)
      stat('Timer bg',    `${colorSwatch(resolvedTimerBg)}${resolvedTimerBg}`)
      process.stderr.write('\n')

      const overlayProps: OverlayProps = {
        segments,
        startingGridPosition,
        fps,
        durationInFrames,
        videoWidth: videoResolution.width,
        videoHeight: videoResolution.height,
        boxPosition,
        accentColor: opts.accentColor,
        textColor: opts.textColor,
        timerTextColor: opts.timerTextColor,
        timerBgColor: opts.timerBgColor,
        labelWindowSeconds,
      }

      const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')
      const overlayPath = opts.output.replace(/\.[^.]+$/, '-overlay.mov')
      const workStart = Date.now()

      let overlayReused = false
      try {
        await access(overlayPath)
        const overlayDuration = await getVideoDuration(overlayPath)
        overlayReused = overlayDuration > 0
      } catch { /* no valid overlay on disk */ }

      if (overlayReused) {
        process.stderr.write(`  Reusing overlay        ${overlayPath}\n`)
      } else {
        try {
          await renderOverlay(rendererEntry, opts.style, overlayProps, overlayPath, makeProgressCallback('Rendering overlay'))
        } finally {
          process.stderr.write('\n')
        }
      }

      const overlayX = parseInt(opts.overlayX, 10)
      let overlayY = parseInt(opts.overlayY, 10)
      if (isNaN(overlayX) || isNaN(overlayY)) {
        console.error('Error: --overlay-x and --overlay-y must be valid integers')
        process.exit(1)
      }

      const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 250, minimal: 190 }
      const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
      if (stripHeight != null) {
        const scaledStrip = Math.round(stripHeight * videoResolution.width / 1920)
        overlayY = boxPosition.startsWith('bottom') ? videoResolution.height - scaledStrip : 0
      }

      try {
        await compositeVideo(
          opts.video,
          overlayPath,
          opts.output,
          { fps, overlayX, overlayY, durationSeconds },
          makeProgressCallback('Compositing'),
        )
      } finally {
        process.stderr.write('\n')
      }

      const totalSeconds = Math.round((Date.now() - workStart) / 1000)
      process.stderr.write(`\n  ✓  ${opts.output}  ·  ${formatSeconds(totalSeconds)}\n\n`)
      console.log(opts.output)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

Note: the `import('@racedash/core').SessionSegment` references in the action body should be replaced by a top-level import of `SessionSegment` and `SessionData` from `@racedash/core`. Add them to the existing import on line 9:

```ts
import type { BoxPosition, OverlayProps, SessionData, SessionMode, SessionSegment } from '@racedash/core'
```

Also add `import { readFile } from 'node:fs/promises'` to the existing fs import, replacing `import { access } from 'node:fs/promises'` with:

```ts
import { access, readFile } from 'node:fs/promises'
```

And update `loadRenderConfig` to use the top-level `readFile` directly instead of dynamic import:

```ts
async function loadRenderConfig(opts: RenderOpts): Promise<{ segments: SegmentConfig[]; driverQuery: string }> {
  if (opts.config) {
    const raw = JSON.parse(await readFile(opts.config, 'utf8'))
    const config = raw as RenderConfig
    if (!Array.isArray(config.segments) || config.segments.length === 0) {
      throw new Error('Config file must contain a non-empty "segments" array')
    }
    const driverQuery = opts.driver ?? config.driver
    if (!driverQuery) throw new Error('--driver is required (or set "driver" in config file)')
    return { segments: config.segments, driverQuery }
  }

  // Inline single-segment
  if (!opts.url || !opts.mode || !opts.offset) {
    throw new Error('Provide --config <path> or all of --url, --mode, and --offset for a single segment')
  }
  if (!opts.driver) throw new Error('--driver is required')
  return {
    segments: [{ mode: opts.mode, url: opts.url, offset: opts.offset, label: opts.label }],
    driverQuery: opts.driver,
  }
}
```

- [ ] **Step 4: Remove the now-unused `selectDriver` import from `apps/cli/src/index.ts`**

Find and delete this line near the top of the file:

```ts
import { selectDriver } from './select'
```

The `selectDriver` function is no longer called anywhere in the updated `render` command — driver matching is now done inline. The `./select` module can remain on disk (it is still valid code) but must not be imported.

- [ ] **Step 5: Build the CLI to verify no type errors**

```bash
cd apps/cli && pnpm build
```

Expected: exits 0. If TypeScript errors appear, fix them before proceeding.

- [ ] **Step 6: Smoke-test with inline single-segment (dry-run to the fetch stage)**

The full render requires a video file, but you can verify the CLI parses and fetches correctly with a real URL:

```bash
node apps/cli/dist/index.js render \
  --mode practice \
  --url https://results.alphatiming.co.uk/bukc/e/358384/s/741328/laptimes \
  --offset 0:00:00 \
  --driver "Surrey C" \
  --video /dev/null \
  --output /tmp/test-out.mp4 2>&1 | head -30
```

Expected: prints segment stats for Surrey C from the practice session; may fail at video probe step (since `/dev/null` is not a video), but the fetch+parse stage should succeed.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "feat(cli): multi-segment render command — --config file, --driver required, inline shorthand"
```

---

## Final Verification

- [ ] **Run full test suite across all packages**

```bash
pnpm -r test
```

Expected: all tests pass.

- [ ] **Build all packages**

```bash
pnpm -r build
```

Expected: exits 0.

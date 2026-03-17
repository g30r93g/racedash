# Geometric Banner Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `geometric-banner` overlay style using a five-section Inkscape SVG as the background, with each section individually colour-configurable, reusing existing content components.

**Architecture:** A single `<svg>` with the five verbatim Inkscape paths scales to any render width via `viewBox` + `preserveAspectRatio="none"`. The `GeometricBanner` component mirrors the `Banner` layout pattern — an `AbsoluteFill` containing a background SVG (positioned absolutely) with a flex row of content components on top. No new coordinate-math functions are needed.

**Tech Stack:** React 18, TypeScript, Remotion 4, pnpm monorepo (packages: `@racedash/core`, `apps/renderer`)

---

## Chunk 1: Core types + SVG asset

### Task 1: Commit source SVG to the repo

**Files:**
- Create: `apps/renderer/src/styles/geometric-banner/geometric-banner.svg`

The five path `d` strings come verbatim from `/Users/g30r93g/Desktop/geometric-banner.svg`. Copy the file as-is.

- [ ] **Step 1: Copy the SVG into the repo**

```bash
mkdir -p apps/renderer/src/styles/geometric-banner
cp /Users/g30r93g/Desktop/geometric-banner.svg \
   apps/renderer/src/styles/geometric-banner/geometric-banner.svg
```

- [ ] **Step 2: Verify the file landed correctly**

```bash
head -5 apps/renderer/src/styles/geometric-banner/geometric-banner.svg
```

Expected: XML declaration + `<svg` opening tag with `width="3818.0071"`.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/geometric-banner/geometric-banner.svg
git commit -m "feat(geometric-banner): add source SVG asset"
```

---

### Task 2: Add `GeometricBannerStyling` to core

**Files:**
- Modify: `packages/core/src/index.ts` (after the existing `BannerStyling` block, around line 94)

- [ ] **Step 1: Add the interface and extend `OverlayStyling`**

Open `packages/core/src/index.ts`. After the closing `}` of `BannerStyling` (currently around line 94), insert:

```ts
export interface GeometricBannerStyling {
  positionCounterColor?: string  // position-counter fill        (default: #0bc770)
  lastLapColor?: string          // last-lap fill                (default: #16aa9c)
  lapTimerNeutralColor?: string  // lap-timer neutral fill       (default: #0e0ab8)
  previousLapColor?: string      // previous-lap fill            (default: #7c16aa)
  lapCounterColor?: string       // lap-counter fill             (default: #c70b4d)
  lapColorPurple?: string        // personal best flash          (default: rgba(107,33,168,0.95))
  lapColorGreen?: string         // session best flash           (default: rgba(21,128,61,0.95))
  lapColorRed?: string           // slower lap flash             (default: rgba(185,28,28,0.95))
  timerTextColor?: string        // timer text colour            (default: white)
  flashDuration?: number         // flash duration in s          (default: 2)
  opacity?: number               // background fill opacity      (default: 1)
}
```

Then in `OverlayStyling` (currently around line 127), add after `banner?: BannerStyling`:

```ts
  geometricBanner?: GeometricBannerStyling
```

- [ ] **Step 2: Build core to verify TypeScript is happy (run from repo root)**

```bash
pnpm --filter @racedash/core build
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add GeometricBannerStyling interface"
```

---

## Chunk 2: Background component

### Task 3: Create `GeometricBannerBackground`

**Files:**
- Create: `apps/renderer/src/styles/geometric-banner/GeometricBannerBackground.tsx`

The five path `d` strings to embed verbatim (copy from the SVG file committed in Task 1):

| `id`               | Path data source in SVG |
|--------------------|-------------------------|
| `position-counter` | `<path id="position-counter" d="...">` |
| `last-lap`         | `<path id="last-lap" d="...">` |
| `lap-timer`        | `<path id="lap-timer" d="...">` |
| `previous-lap`     | `<path id="previous-lap" d="...">` |
| `lap-counter`      | `<path id="lap-counter" d="...">` |

Extract each `d="..."` attribute value directly from `geometric-banner.svg` and paste into the component below. The group transform `translate(4.1444685,42.938681)` is kept as-is so the shapes sit exactly as in the SVG.

- [ ] **Step 1: Extract the five `d` strings**

First verify the SVG asset from Task 1 is present:

```bash
test -f apps/renderer/src/styles/geometric-banner/geometric-banner.svg \
  && echo "OK" || echo "ERROR: complete Task 1 first"
```

Then extract each path's `d` attribute, keyed by `id` (works on macOS and Linux):

```bash
python3 -c "
import re, sys
svg = open('apps/renderer/src/styles/geometric-banner/geometric-banner.svg').read()
for pid in ['position-counter','last-lap','lap-timer','previous-lap','lap-counter']:
    elem_start = svg.index(f'id=\"{pid}\"')
    path_start = svg.rindex('<path', 0, elem_start)
    path_end   = svg.index('/>', elem_start) + 2
    elem = svg[path_start:path_end]
    d_vals = re.findall(r'd=\"([^\"]+)\"', elem)
    d = max(d_vals, key=len)
    print(f'{pid}:')
    print(d)
    print()
"
```

This prints each `id` followed by its `d` string. Copy each one into the corresponding constant in Step 2.

- [ ] **Step 2: Create the component**

Create `apps/renderer/src/styles/geometric-banner/GeometricBannerBackground.tsx`:

```tsx
import React from 'react'

// Path d-strings are verbatim from geometric-banner.svg (viewBox 0 0 1010.181 110.2687).
// The group transform translate(4.1444685,42.938681) is preserved so shapes sit as authored.
// preserveAspectRatio="none" scales uniformly to any width × height.

const POSITION_COUNTER_D = '/* paste d string for position-counter */'
const LAST_LAP_D          = '/* paste d string for last-lap */'
const LAP_TIMER_D         = '/* paste d string for lap-timer */'
const PREVIOUS_LAP_D      = '/* paste d string for previous-lap */'
const LAP_COUNTER_D       = '/* paste d string for lap-counter */'

interface GeometricBannerBackgroundProps {
  width: number
  height: number
  positionCounterColor: string
  lastLapColor: string      // pass 'none' in race mode
  lapTimerFill: string      // pre-computed dynamic colour (neutral or flash)
  previousLapColor: string  // pass 'none' in race mode
  lapCounterColor: string
  opacity: number           // SVG-level opacity; multiplies all fills including flash colours
}

export const GeometricBannerBackground: React.FC<GeometricBannerBackgroundProps> = ({
  width, height,
  positionCounterColor, lastLapColor, lapTimerFill, previousLapColor, lapCounterColor,
  opacity,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 1010.181 110.2687"
    preserveAspectRatio="none"
    opacity={opacity}
    style={{ position: 'absolute', inset: 0 }}
  >
    <g transform="translate(4.1444685,42.938681)">
      <path id="position-counter" d={POSITION_COUNTER_D} fill={positionCounterColor} />
      <path id="last-lap"         d={LAST_LAP_D}         fill={lastLapColor} />
      <path id="lap-timer"        d={LAP_TIMER_D}        fill={lapTimerFill} />
      <path id="previous-lap"     d={PREVIOUS_LAP_D}     fill={previousLapColor} />
      <path id="lap-counter"      d={LAP_COUNTER_D}      fill={lapCounterColor} />
    </g>
  </svg>
)
```

Replace each `/* paste d string for ... */` placeholder with the actual `d` string extracted in Step 1.

- [ ] **Step 3: Build the renderer to verify no TypeScript errors (run from repo root)**

```bash
pnpm --filter @racedash/renderer build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/styles/geometric-banner/GeometricBannerBackground.tsx
git commit -m "feat(geometric-banner): add GeometricBannerBackground SVG component"
```

---

## Chunk 3: Main component + registration

### Task 4: Create the `GeometricBanner` component

**Files:**
- Create: `apps/renderer/src/styles/geometric-banner/index.tsx`

This mirrors the `Banner` component in `apps/renderer/src/styles/banner/index.tsx`. Key differences:

- `bannerHeight` is derived from the SVG aspect ratio, not a fixed `80 * scale`
- `wrapperStyle` adds `alignItems: 'center'` and `height: '100%'` so the 80 px content containers vertically centre within the taller banner
- The background component is `GeometricBannerBackground` (5 paths) instead of `BannerBackground` (2 paths)
- In race mode, `lastLapColor` and `previousLapColor` are `'none'`; in practice/qualifying they use their configured colours
- `timerColorMap.neutral` reads from `geometricBanner?.lapTimerNeutralColor`
- `anchorTop` for the leaderboard is `bannerHeight + 30`

- [ ] **Step 1: Create the component**

Create `apps/renderer/src/styles/geometric-banner/index.tsx`:

```tsx
import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { GeometricBannerBackground } from './GeometricBannerBackground'
import { computeLapColors } from '../banner/lapColor'
import { LapTimerTrap } from '../banner/LapTimerTrap'
import { LapCounter } from '../banner/LapCounter'
import { PositionCounter } from '../banner/PositionCounter'
import { TimeLabelPanel } from '../banner/TimeLabelPanel'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { buildLeaderboard } from '../../leaderboard'

// SVG natural aspect ratio: viewBox 1010.181 × 110.2687
const SVG_W = 1010.181
const SVG_H = 110.2687

export const GeometricBanner: React.FC<OverlayProps> = ({
  segments, fps, startingGridPosition,
  styling, labelWindowSeconds,
  qualifyingTablePosition,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const currentTime = frame / fps

  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps, mode } = segment

  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const showTable = segment.leaderboardDrivers != null

  const livePosition = useMemo<number | null>(() => {
    if (!showTable) return null
    const leaderboard = buildLeaderboard(
      segment.leaderboardDrivers!, currentTime, mode,
      session.driver.kart, segment.raceLapSnapshots,
    )
    return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
  }, [showTable, segment.leaderboardDrivers, currentTime, mode, session.driver.kart, segment.raceLapSnapshots])

  const gb = styling?.geometricBanner

  // Five section colours
  const positionCounterColor = gb?.positionCounterColor ?? '#0bc770'
  const lapCounterColor      = gb?.lapCounterColor      ?? '#c70b4d'
  const lastLapColor         = showTimePanels ? (gb?.lastLapColor     ?? '#16aa9c') : 'none'
  const previousLapColor     = showTimePanels ? (gb?.previousLapColor ?? '#7c16aa') : 'none'

  // Timer flash colours
  const timerColorMap = {
    neutral: gb?.lapTimerNeutralColor ?? '#0e0ab8',
    purple:  gb?.lapColorPurple       ?? 'rgba(107,33,168,0.95)',
    green:   gb?.lapColorGreen        ?? 'rgba(21,128,61,0.95)',
    red:     gb?.lapColorRed          ?? 'rgba(185,28,28,0.95)',
  }

  const text = styling?.textColor ?? 'white'
  const bgOpacity = gb?.opacity ?? 1

  const raceStart  = session.timestamps[0].ytSeconds
  const preRoll    = styling?.fade?.preRollSeconds ?? 0
  const showFrom   = raceStart - preRoll

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, currentTime), [session.timestamps, currentTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])
  const raceEnd    = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  if (currentTime < showFrom && !isEnd) return null

  const fadeEnabled   = styling?.fade?.enabled ?? false
  const fadeDuration  = styling?.fade?.durationSeconds ?? 0.5
  const fadeOpacity   = fadeEnabled && !isEnd
    ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1

  // Flash logic — identical to Banner
  const flashDurationSeconds = gb?.flashDuration ?? 2
  const timerBackground = (() => {
    if (currentTime >= raceEnd) {
      const sinceEnd = currentTime - raceEnd
      return sinceEnd < flashDurationSeconds
        ? timerColorMap[lapColors[session.timestamps.length - 1] ?? 'neutral']
        : timerColorMap.neutral
    }
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < flashDurationSeconds && currentIdx > 0
    return isFlashing ? timerColorMap[lapColors[currentIdx - 1] ?? 'neutral'] : timerColorMap.neutral
  })()

  const bannerHeight = Math.round(width * (SVG_H / SVG_W))

  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: bannerHeight,
    overflow: 'hidden',
  }

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: '100%',
  }

  const bgProps = {
    width,
    height: bannerHeight,
    positionCounterColor,
    lastLapColor,
    lapTimerFill: timerBackground,
    previousLapColor,
    lapCounterColor,
    opacity: bgOpacity,
  }

  const lapTimerProps = {
    timestamps: session.timestamps,
    currentLap,
    currentIdx,
    currentTime,
    raceEnd,
    textColor: gb?.timerTextColor ?? text,
    flashDuration: gb?.flashDuration,
  }

  const anchorTop = bannerHeight + 30

  if (showTimePanels) {
    return (
      <AbsoluteFill style={{ opacity: fadeOpacity }}>
        <div style={outerStyle}>
          <GeometricBannerBackground {...bgProps} />
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
              livePosition={livePosition}
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
            <LapTimerTrap {...lapTimerProps} />
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
        {showTable && (
          <LeaderboardTable
            mode={mode}
            leaderboardDrivers={segment.leaderboardDrivers!}
            ourKart={session.driver.kart}
            fps={fps}
            accentColor={styling?.accentColor ?? '#3DD73D'}
            leaderboardStyling={styling?.leaderboard}
            anchorTop={anchorTop}
            position={qualifyingTablePosition ?? 'top-right'}
            raceLapSnapshots={segment.raceLapSnapshots}
          />
        )}
        {label && <SegmentLabel label={label} scale={width / 1920} styling={styling?.segmentLabel} />}
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill style={{ opacity: fadeOpacity }}>
      <div style={outerStyle}>
        <GeometricBannerBackground {...bgProps} />
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
            livePosition={livePosition}
          />
          <div style={{ flex: 1 }} />
          <LapTimerTrap {...lapTimerProps} />
          <div style={{ flex: 1 }} />
          <LapCounter
            timestamps={session.timestamps}
            currentLap={currentLap}
            currentTime={currentTime}
            textColor={text}
          />
        </div>
      </div>
      {showTable && (
        <LeaderboardTable
          mode={mode}
          leaderboardDrivers={segment.leaderboardDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          accentColor={styling?.accentColor ?? '#3DD73D'}
          leaderboardStyling={styling?.leaderboard}
          position={qualifyingTablePosition}
          raceLapSnapshots={segment.raceLapSnapshots}
        />
      )}
      {label && <SegmentLabel label={label} scale={width / 1920} styling={styling?.segmentLabel} />}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Build renderer to verify TypeScript (run from repo root)**

```bash
pnpm --filter @racedash/renderer build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/geometric-banner/index.tsx
git commit -m "feat(geometric-banner): add GeometricBanner component"
```

---

### Task 5: Register in the renderer registry

**Files:**
- Modify: `apps/renderer/src/registry.ts`

- [ ] **Step 1: Add the import and registry entry**

In `apps/renderer/src/registry.ts`, add the import after the existing style imports:

```ts
import { GeometricBanner } from './styles/geometric-banner'
```

Add the entry inside the `registry` object after `modern`:

```ts
  'geometric-banner': {
    component: GeometricBanner,
    width: 1920,
    height: 500,     // tall canvas for leaderboard; actual banner shape is ~209 px
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
  },
```

- [ ] **Step 2: Final build to verify everything compiles end-to-end**

```bash
pnpm build
```

Expected: exits 0, all packages build cleanly.

- [ ] **Step 3: Verify the composition appears in Remotion Studio**

```bash
pnpm --filter @racedash/renderer remotion studio
```

Open the browser. You should see a `geometric-banner` composition in the sidebar with the five geometric shapes visible over the default preview data.

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/registry.ts
git commit -m "feat(geometric-banner): register geometric-banner composition"
```

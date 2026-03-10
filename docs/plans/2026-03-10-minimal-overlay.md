# Minimal Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `minimal` Remotion style — a compact dark rounded card showing the current lap number badge, a large elapsed-time ticker, and two smaller stats (last lap + session best) below.

**Architecture:** Single `Minimal` component at `apps/renderer/src/styles/minimal/index.tsx`. Uses `sessionAllLaps` from `OverlayProps` for session best. Scales to video width using `useVideoConfig()`. Registered as a 440×150 composition (bottom-left card, positioned via `--overlay-x/y` flags at render time).

**Tech Stack:** Remotion 4, TypeScript strict, Atkinson Hyperlegible Mono (already loaded in `Root.tsx`).

**Prerequisite:** The geometric overlay branch must be merged to main first — it extends `OverlayProps` with `sessionAllLaps`.

---

### Task 1: Create the `Minimal` component

**Files:**
- Create: `apps/renderer/src/styles/minimal/index.tsx`

**Step 1: Create the component**

```tsx
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

export const Minimal: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 440
  const currentTime = frame / fps

  const currentLap = getLapAtTime(session.timestamps, currentTime)
  const currentIdx = session.timestamps.indexOf(currentLap)
  const elapsed = getLapElapsed(currentLap, currentTime)

  const lastLapTime = currentIdx >= 1
    ? session.timestamps[currentIdx - 1].lap.lapTime
    : null

  const allLapTimes = sessionAllLaps.flat().map(l => l.lapTime)
  const sessionBestTime = allLapTimes.length > 0 ? Math.min(...allLapTimes) : null

  const em = Math.floor(elapsed / 60)
  const es = Math.floor(elapsed % 60)
  const ems = Math.floor((elapsed % 1) * 1000)
  const elapsedStr = `${em}:${String(es).padStart(2, '0')}.${String(ems).padStart(3, '0')}`

  return (
    <div
      style={{
        fontFamily,
        userSelect: 'none',
        background: '#555',
        borderRadius: 12 * sc,
        padding: `${14 * sc}px ${20 * sc}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6 * sc,
        width: `calc(100% - ${40 * sc}px)`,
        margin: `0 ${20 * sc}px`,
      }}
    >
      {/* Lap number badge */}
      <div
        style={{
          width: 36 * sc,
          height: 36 * sc,
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4 * sc,
        }}
      >
        <span style={{ fontSize: 20 * sc, fontWeight: 900, color: '#111', lineHeight: 1 }}>
          {currentLap.lap.number}
        </span>
      </div>

      {/* Large elapsed timer */}
      <div style={{
        fontSize: 58 * sc,
        fontWeight: 700,
        fontStyle: 'italic',
        color: 'white',
        letterSpacing: -1 * sc,
        lineHeight: 1,
      }}>
        {elapsedStr}
      </div>

      {/* Last lap + session best stats */}
      <div style={{
        display: 'flex',
        gap: 24 * sc,
        fontSize: 13 * sc,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 0.5 * sc,
        textTransform: 'uppercase',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 * sc }}>
          <span>Last Lap</span>
          <span style={{ color: 'white', fontSize: 20 * sc, fontWeight: 700 }}>
            {lastLapTime != null ? formatLapTime(lastLapTime) : '—:——.———'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 * sc }}>
          <span>Session Best</span>
          <span style={{ color: 'white', fontSize: 20 * sc, fontWeight: 700 }}>
            {sessionBestTime != null ? formatLapTime(sessionBestTime) : '—:——.———'}
          </span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Build to verify no type errors**

```bash
cd /path/to/racedash/apps/renderer && pnpm build
```

Expected: Compiles cleanly.

**Step 3: Commit**

```bash
git add apps/renderer/src/styles/minimal/index.tsx
git commit -m "feat(renderer): add minimal overlay style — rounded card with lap badge and stats"
```

---

### Task 2: Register the `minimal` style

**Files:**
- Modify: `apps/renderer/src/registry.ts`

**Step 1: Add the minimal entry**

In `apps/renderer/src/registry.ts`, add the import and registry entry:

```ts
import { Minimal } from './styles/minimal'

// Inside registry object, add:
minimal: {
  component: Minimal,
  width: 440,
  height: 150,
  overlayX: 48,
  overlayY: 882,  // for 1080p: 1080 - 150 - 48
},
```

**Step 2: Build and preview**

```bash
cd apps/renderer && pnpm build
npx remotion preview src/index.ts
```

Open the `minimal` composition. You should see a dark rounded card with:
- Small white square in the top-left showing the current lap number
- Large bold italic elapsed time below it
- Two stat columns at the bottom: LAST LAP and SESSION BEST

**Step 3: Commit**

```bash
git add apps/renderer/src/registry.ts
git commit -m "feat(renderer): register minimal style in registry"
```

---

## Verification

```bash
cd apps/renderer && npx remotion preview src/index.ts
```

Scrub through the `minimal` composition:
- Lap number badge updates when crossing a lap boundary
- Elapsed timer resets to 0 at each lap start and counts up
- LAST LAP shows `—:——.———` on lap 1, then the previous lap's time
- SESSION BEST shows the fastest lap across all drivers throughout

# Esports Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `esports` Remotion style — a full-width bottom strip with a blue accent bar, two icon+time panels (last lap green, session best purple), and a black current-lap ticker.

**Architecture:** Single `Esports` component at `apps/renderer/src/styles/esports/index.tsx`. Reads `sessionAllLaps` from `OverlayProps` (added by the geometric overlay work) to compute session best. Scales everything to video width using `useVideoConfig()` width / 1920. Registered in `registry.ts` as a 1920×228 composition.

**Tech Stack:** Remotion 4 (React, headless Chrome), TypeScript strict, `useCurrentFrame`, `useVideoConfig`, Atkinson Hyperlegible Mono font (already loaded in `Root.tsx`).

**Prerequisite:** The geometric overlay branch must be merged to main first — it extends `OverlayProps` with `sessionAllLaps`, `mode`, `startingGridPosition`, `videoWidth`, `videoHeight`.

---

### Task 1: Create the `Esports` component

**Files:**
- Create: `apps/renderer/src/styles/esports/index.tsx`

**Step 1: Create the component**

```tsx
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const StopwatchIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="13" r="7" />
    <path d="M12 10v3l2 2" />
    <path d="M9.5 3.5h5" />
    <path d="M12 3.5v2" />
    <path d="M19 6l1-1" />
  </svg>
)

export const Esports: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920
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
    <div style={{ width: '100%', fontFamily, userSelect: 'none' }}>
      {/* Blue-to-purple accent bar */}
      <div style={{
        height: 8 * sc,
        background: 'linear-gradient(to right, #2563eb, #7c3aed)',
      }} />

      {/* Gray middle section: last lap (green) + session best (purple) */}
      <div style={{
        background: '#3f4755',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 100 * sc,
        height: 140 * sc,
      }}>
        {/* Last lap panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 * sc }}>
          <div style={{
            width: 52 * sc,
            height: 52 * sc,
            background: '#16a34a',
            borderRadius: 8 * sc,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <StopwatchIcon size={28 * sc} />
          </div>
          <span style={{ fontSize: 52 * sc, fontWeight: 700, color: 'white', letterSpacing: 1 * sc }}>
            {lastLapTime != null ? formatLapTime(lastLapTime) : '—:——.———'}
          </span>
        </div>

        {/* Session best panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 * sc }}>
          <div style={{
            width: 52 * sc,
            height: 52 * sc,
            background: '#7c3aed',
            borderRadius: 8 * sc,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <StopwatchIcon size={28 * sc} />
          </div>
          <span style={{ fontSize: 52 * sc, fontWeight: 700, color: 'white', letterSpacing: 1 * sc }}>
            {sessionBestTime != null ? formatLapTime(sessionBestTime) : '—:——.———'}
          </span>
        </div>
      </div>

      {/* Black current-lap ticker */}
      <div style={{
        background: '#111',
        display: 'flex',
        alignItems: 'center',
        gap: 20 * sc,
        padding: `0 ${40 * sc}px`,
        height: 80 * sc,
      }}>
        <StopwatchIcon size={24 * sc} />
        <span style={{
          fontSize: 20 * sc,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 4 * sc,
          textTransform: 'uppercase',
        }}>
          Current
        </span>
        <span style={{
          fontSize: 36 * sc,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 2 * sc,
          marginLeft: 'auto',
        }}>
          {elapsedStr}
        </span>
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
git add apps/renderer/src/styles/esports/index.tsx
git commit -m "feat(renderer): add esports overlay style — icon panels + current lap ticker"
```

---

### Task 2: Register the `esports` style

**Files:**
- Modify: `apps/renderer/src/registry.ts`

**Step 1: Add the esports entry**

In `apps/renderer/src/registry.ts`, add the import and registry entry:

```ts
import { Esports } from './styles/esports'

// Inside registry object, add:
esports: {
  component: Esports,
  width: 1920,
  height: 228,
  overlayX: 0,
  overlayY: 852,  // for 1080p video: 1080 - 228
},
```

**Step 2: Build and preview**

```bash
cd apps/renderer && pnpm build
npx remotion preview src/index.ts
```

Open the `esports` composition in Remotion Studio. You should see:
- Blue-to-purple thin accent bar at top
- Gray section with green icon + last lap time | purple icon + session best time
- Black row at bottom with "CURRENT" label and counting elapsed time

**Step 3: Commit**

```bash
git add apps/renderer/src/registry.ts
git commit -m "feat(renderer): register esports style in registry"
```

---

## Verification

```bash
cd apps/renderer && npx remotion preview src/index.ts
```

Scrub through the `esports` composition:
- Before first lap completes: last lap shows `—:——.———`
- After first lap: last lap shows that lap's time
- Session best shows the fastest lap across all drivers throughout
- Current timer counts up continuously

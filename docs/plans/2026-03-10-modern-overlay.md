# Modern Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `modern` Remotion style — a translucent dark horizontal bar with a large elapsed-time ticker on the left, compact LAST/BEST stats on the right, and a subtle diagonal stripe pattern in the background.

**Architecture:** Single `Modern` component at `apps/renderer/src/styles/modern/index.tsx`. Uses `sessionAllLaps` from `OverlayProps` for session best. The diagonal background pattern uses a CSS `repeating-linear-gradient`. Scales to video width using `useVideoConfig()`. Registered as a 520×96 composition.

**Tech Stack:** Remotion 4, TypeScript strict, Atkinson Hyperlegible Mono (already loaded in `Root.tsx`), CSS `repeating-linear-gradient` for the geometric pattern.

**Prerequisite:** The geometric overlay branch must be merged to main first — it extends `OverlayProps` with `sessionAllLaps`.

---

### Task 1: Create the `Modern` component

**Files:**
- Create: `apps/renderer/src/styles/modern/index.tsx`

**Step 1: Create the component**

```tsx
import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

export const Modern: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 520
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
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        // Dark base + subtle diagonal stripe pattern on the right half
        background: `
          repeating-linear-gradient(
            -55deg,
            rgba(255,255,255,0.035),
            rgba(255,255,255,0.035) 2px,
            transparent 2px,
            transparent 18px
          ),
          rgba(13, 15, 20, 0.88)
        `,
        padding: `0 ${28 * sc}px`,
        gap: 32 * sc,
      }}
    >
      {/* Large elapsed timer */}
      <div style={{
        fontSize: 52 * sc,
        fontWeight: 700,
        color: 'white',
        letterSpacing: -0.5 * sc,
        lineHeight: 1,
        flex: 1,
      }}>
        {elapsedStr}
      </div>

      {/* Stats: LAST and BEST */}
      <div style={{
        display: 'flex',
        gap: 24 * sc,
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 * sc }}>
          <span style={{
            fontSize: 11 * sc,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: 2 * sc,
            textTransform: 'uppercase',
          }}>
            Last
          </span>
          <span style={{
            fontSize: 22 * sc,
            fontWeight: 700,
            color: 'white',
            letterSpacing: 0.5 * sc,
          }}>
            {lastLapTime != null ? formatLapTime(lastLapTime) : '—:——.———'}
          </span>
        </div>

        {/* Vertical divider */}
        <div style={{
          width: 1 * sc,
          height: 40 * sc,
          background: 'rgba(255,255,255,0.2)',
          alignSelf: 'center',
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 * sc }}>
          <span style={{
            fontSize: 11 * sc,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: 2 * sc,
            textTransform: 'uppercase',
          }}>
            Best
          </span>
          <span style={{
            fontSize: 22 * sc,
            fontWeight: 700,
            color: 'white',
            letterSpacing: 0.5 * sc,
          }}>
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
git add apps/renderer/src/styles/modern/index.tsx
git commit -m "feat(renderer): add modern overlay style — translucent bar with diagonal stripe pattern"
```

---

### Task 2: Register the `modern` style

**Files:**
- Modify: `apps/renderer/src/registry.ts`

**Step 1: Add the modern entry**

In `apps/renderer/src/registry.ts`, add the import and registry entry:

```ts
import { Modern } from './styles/modern'

// Inside registry object, add:
modern: {
  component: Modern,
  width: 520,
  height: 96,
  overlayX: 0,
  overlayY: 984,  // for 1080p: 1080 - 96
},
```

**Step 2: Build and preview**

```bash
cd apps/renderer && pnpm build
npx remotion preview src/index.ts
```

Open the `modern` composition. You should see:
- A dark translucent bar with subtle diagonal stripes
- Large elapsed time on the left
- Compact LAST / BEST stats on the right, separated by a thin divider

**Step 3: Commit**

```bash
git add apps/renderer/src/registry.ts
git commit -m "feat(renderer): register modern style in registry"
```

---

## Verification

```bash
cd apps/renderer && npx remotion preview src/index.ts
```

Scrub through the `modern` composition:
- Elapsed timer counts up, resets at each lap boundary
- LAST shows `—:——.———` on lap 1, then updates on each lap completion
- BEST shows the fastest time across all drivers throughout
- Diagonal stripe pattern is subtle — barely visible, dark aesthetic maintained

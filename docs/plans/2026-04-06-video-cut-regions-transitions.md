# Video Cut Regions & Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to define cut regions on the joined source video to remove dead content, place transition effects at boundaries, and export the trimmed video with transitions composited.

**Architecture:** Cut regions and transitions are stored in `project.json`. Derived state (kept ranges, boundaries, segment buffers, frame mapping) is computed via React hooks with `useMemo`. The editor gains a toggleable left drawer and Source/Project timeline view. Export pipeline processes kept ranges and composites transitions via FFmpeg filter chains.

**Tech Stack:** TypeScript, React 18, shadcn/ui, @dnd-kit (drag-and-drop), FFmpeg (compositor), Remotion (overlay rendering)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `apps/desktop/src/types/videoEditing.ts` | `CutRegion`, `Transition`, `Boundary`, `KeptRange`, `DerivedSegmentBuffers` types |
| `apps/desktop/src/renderer/src/hooks/useVideoEditing.ts` | `useKeptRanges`, `useBoundaries`, `useSegmentBuffers`, `useFrameMapping` hooks |
| `apps/desktop/src/renderer/src/hooks/__tests__/useVideoEditing.test.ts` | Tests for video editing hooks (pure function tests on the underlying computations) |
| `apps/desktop/src/renderer/src/lib/videoEditing.ts` | Pure functions: `computeKeptRanges`, `toOutputFrame`, `toSourceFrame`, `deriveSegmentBuffers`, `inferCutBounds`, `computeBoundaries`, `reconcileTransitions` |
| `apps/desktop/src/renderer/src/lib/__tests__/videoEditing.test.ts` | Tests for pure video editing functions |
| `apps/desktop/src/renderer/src/components/video-editing/VideoEditingDrawer.tsx` | Left drawer shell with Cuts and Transitions sections |
| `apps/desktop/src/renderer/src/components/video-editing/CutRegionList.tsx` | Cuts list + add button |
| `apps/desktop/src/renderer/src/components/video-editing/CutRegionPopover.tsx` | Popover for editing cut in/out timestamps |
| `apps/desktop/src/renderer/src/components/video-editing/TransitionPills.tsx` | Draggable transition type pills |
| `apps/desktop/src/renderer/src/components/video-editing/TransitionPopover.tsx` | Popover for editing transition type + duration |
| `apps/desktop/src/renderer/src/components/video-editing/CutRegionOverlay.tsx` | Cut region greyed spans on VIDEO track |
| `apps/desktop/src/renderer/src/components/video-editing/BoundaryMarker.tsx` | Drop target markers on timeline boundaries |
| `apps/desktop/src/renderer/src/components/video-editing/TransitionBar.tsx` | Placed transition bars on timeline |

### Modified files

| Path | Change |
|---|---|
| `apps/desktop/src/types/project.ts` | Add `id` to `SegmentConfig`, add `cutRegions` + `transitions` to `ProjectData` and `CreateProjectOpts` |
| `apps/desktop/src/types/ipc.ts` | Add `cutRegions` + `transitions` to `RenderStartOpts` |
| `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | 3-column layout with toggleable drawer, wire video editing state |
| `apps/desktop/src/renderer/src/components/video/timeline/Timeline.tsx` | Add Source/Project tabs, pass view mode + video editing props to tracks |
| `apps/desktop/src/renderer/src/components/video/timeline/TimelineTracks.tsx` | Render cut overlays, boundary markers, transition bars, pre/post-roll wings |
| `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Pass `cutRegions` + `transitions` to `startRender`, disable when zero kept ranges |
| `apps/desktop/src/main/ipc.ts` | Accept `cutRegions` + `transitions` in render handler, pass to compositor |
| `packages/compositor/src/index.ts` | Add `compositeWithCuts()` function that handles kept ranges + transitions |

---

### Task 1: Video Editing Types

**Files:**
- Create: `apps/desktop/src/types/videoEditing.ts`
- Modify: `apps/desktop/src/types/project.ts`

- [ ] **Step 1: Write video editing types**

```ts
// apps/desktop/src/types/videoEditing.ts

export interface CutRegion {
  id: string
  startFrame: number  // inclusive, global frame in joined source video
  endFrame: number    // exclusive
}

export type TransitionType = 'fadeFromBlack' | 'fadeToBlack' | 'fadeThroughBlack' | 'crossfade'

export interface Transition {
  id: string
  boundaryId: string  // "start" | "end" | "cut:<cutId>" | "segment:<idA>:<idB>"
  type: TransitionType
  durationMs: number  // default 500, snapped to whole frames at render time
}

export type BoundaryKind = 'projectStart' | 'projectEnd' | 'cut' | 'segment'

export interface Boundary {
  id: string
  kind: BoundaryKind
  frameInSource: number
  oneSided: boolean
  label: string
  allowedTypes: TransitionType[]
}

export interface KeptRange {
  startFrame: number  // inclusive, source frames
  endFrame: number    // exclusive, source frames
}

export interface DerivedSegmentBuffers {
  segmentLabel: string
  segmentId: string
  preRollFrames: number
  postRollFrames: number
}
```

- [ ] **Step 2: Add `id` to SegmentConfig and new fields to ProjectData**

In `apps/desktop/src/types/project.ts`, add `id: string` to `SegmentConfig` and add `cutRegions` + `transitions` to `ProjectData`:

```ts
// Add to SegmentConfig interface (after label field):
  id: string // UUID, generated on creation, stable across edits

// Add to ProjectData interface:
  cutRegions: CutRegion[]
  transitions: Transition[]

// Add import at top:
import type { CutRegion, Transition } from './videoEditing'
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/types/videoEditing.ts apps/desktop/src/types/project.ts
git commit -m "feat: add video editing types (CutRegion, Transition, Boundary)"
```

---

### Task 2: Pure Video Editing Functions

**Files:**
- Create: `apps/desktop/src/renderer/src/lib/videoEditing.ts`
- Create: `apps/desktop/src/renderer/src/lib/__tests__/videoEditing.test.ts`

- [ ] **Step 1: Write failing tests for `computeKeptRanges`**

```ts
// apps/desktop/src/renderer/src/lib/__tests__/videoEditing.test.ts
import { describe, it, expect } from 'vitest'
import { computeKeptRanges } from '../videoEditing'

describe('computeKeptRanges', () => {
  it('returns full range when no cuts', () => {
    expect(computeKeptRanges(1000, [])).toEqual([{ startFrame: 0, endFrame: 1000 }])
  })

  it('splits around a single cut', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 200, endFrame: 400 }])).toEqual([
      { startFrame: 0, endFrame: 200 },
      { startFrame: 400, endFrame: 1000 },
    ])
  })

  it('handles head trim (cut starting at 0)', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 0, endFrame: 300 }])).toEqual([
      { startFrame: 300, endFrame: 1000 },
    ])
  })

  it('handles tail trim (cut ending at total)', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 800, endFrame: 1000 }])).toEqual([
      { startFrame: 0, endFrame: 800 },
    ])
  })

  it('handles multiple cuts', () => {
    expect(
      computeKeptRanges(1000, [
        { id: 'c1', startFrame: 100, endFrame: 200 },
        { id: 'c2', startFrame: 500, endFrame: 700 },
      ]),
    ).toEqual([
      { startFrame: 0, endFrame: 100 },
      { startFrame: 200, endFrame: 500 },
      { startFrame: 700, endFrame: 1000 },
    ])
  })

  it('merges overlapping cuts', () => {
    expect(
      computeKeptRanges(1000, [
        { id: 'c1', startFrame: 100, endFrame: 400 },
        { id: 'c2', startFrame: 300, endFrame: 600 },
      ]),
    ).toEqual([
      { startFrame: 0, endFrame: 100 },
      { startFrame: 600, endFrame: 1000 },
    ])
  })

  it('returns empty when entire video is cut', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 0, endFrame: 1000 }])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `computeKeptRanges`**

```ts
// apps/desktop/src/renderer/src/lib/videoEditing.ts
import type { CutRegion, KeptRange } from '../../../../types/videoEditing'

export function computeKeptRanges(totalFrames: number, cuts: CutRegion[]): KeptRange[] {
  if (cuts.length === 0) return [{ startFrame: 0, endFrame: totalFrames }]

  // Sort and merge overlapping cuts
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  const merged: CutRegion[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    if (sorted[i].startFrame <= prev.endFrame) {
      prev.endFrame = Math.max(prev.endFrame, sorted[i].endFrame)
    } else {
      merged.push({ ...sorted[i] })
    }
  }

  const ranges: KeptRange[] = []
  let cursor = 0
  for (const cut of merged) {
    if (cut.startFrame > cursor) {
      ranges.push({ startFrame: cursor, endFrame: cut.startFrame })
    }
    cursor = cut.endFrame
  }
  if (cursor < totalFrames) {
    ranges.push({ startFrame: cursor, endFrame: totalFrames })
  }
  return ranges
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for `toOutputFrame` and `toSourceFrame`**

Add to the same test file:

```ts
import { toOutputFrame, toSourceFrame } from '../videoEditing'

describe('toOutputFrame / toSourceFrame', () => {
  const cuts: CutRegion[] = [
    { id: 'c1', startFrame: 200, endFrame: 400 },
    { id: 'c2', startFrame: 700, endFrame: 800 },
  ]
  // Total cut frames: 200 + 100 = 300
  // Kept: [0,200), [400,700), [800,...)

  it('maps source frame before any cut', () => {
    expect(toOutputFrame(100, cuts, [], 60)).toBe(100)
  })

  it('maps source frame after first cut', () => {
    // Source 500 is in kept range [400,700), offset by 200 cut frames
    expect(toOutputFrame(500, cuts, [], 60)).toBe(300)
  })

  it('maps source frame after both cuts', () => {
    // Source 900 is in kept range [800,...), offset by 300 cut frames
    expect(toOutputFrame(900, cuts, [], 60)).toBe(600)
  })

  it('round-trips correctly', () => {
    const output = toOutputFrame(500, cuts, [], 60)
    expect(toSourceFrame(output, cuts, [], 60)).toBe(500)
  })

  it('round-trips at boundaries', () => {
    const output = toOutputFrame(0, cuts, [], 60)
    expect(toSourceFrame(output, cuts, [], 60)).toBe(0)
  })
})
```

- [ ] **Step 6: Implement `toOutputFrame` and `toSourceFrame`**

```ts
import type { Transition } from '../../../../types/videoEditing'

export function toOutputFrame(
  sourceFrame: number,
  cuts: CutRegion[],
  _transitions: Transition[],
  _fps: number,
): number {
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  let offset = 0
  for (const cut of sorted) {
    if (sourceFrame <= cut.startFrame) break
    if (sourceFrame >= cut.endFrame) {
      offset += cut.endFrame - cut.startFrame
    } else {
      // Source frame is inside a cut — clamp to cut start
      offset += sourceFrame - cut.startFrame
      break
    }
  }
  return sourceFrame - offset
}

export function toSourceFrame(
  outputFrame: number,
  cuts: CutRegion[],
  _transitions: Transition[],
  _fps: number,
): number {
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  let sourceFrame = outputFrame
  for (const cut of sorted) {
    if (sourceFrame < cut.startFrame) break
    sourceFrame += cut.endFrame - cut.startFrame
  }
  return sourceFrame
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

- [ ] **Step 8: Write failing tests for `deriveSegmentBuffers`**

```ts
import { deriveSegmentBuffers } from '../videoEditing'
import type { OverlayStyling } from '@racedash/core'

describe('deriveSegmentBuffers', () => {
  it('uses fade pre/post roll as base', () => {
    const styling: OverlayStyling = {
      fade: { preRollSeconds: 3, postRollSeconds: 2, durationSeconds: 1, fadeOutDurationSeconds: 1 },
    }
    const result = deriveSegmentBuffers(styling, 60)
    // preRoll = preRollSeconds + fadeInDuration = 3 + 1 = 4s = 240 frames
    // postRoll = postRollSeconds + fadeOutDuration = 2 + 1 = 3s = 180 frames
    expect(result.preRollFrames).toBe(240)
    expect(result.postRollFrames).toBe(180)
  })

  it('includes segment label timing', () => {
    const styling: OverlayStyling = {
      fade: { preRollSeconds: 1, postRollSeconds: 1, durationSeconds: 0.5, fadeOutDurationSeconds: 0.5 },
      segmentLabel: { preRollSeconds: 5, postRollSeconds: 3, fadeInDurationSeconds: 0.5, fadeOutDurationSeconds: 0.5 },
    }
    const result = deriveSegmentBuffers(styling, 60)
    // fade: pre=1+0.5=1.5s, post=1+0.5=1.5s
    // label: pre=5+0.5=5.5s, post=3+0.5=3.5s
    // max: pre=5.5s=330f, post=3.5s=210f
    expect(result.preRollFrames).toBe(330)
    expect(result.postRollFrames).toBe(210)
  })

  it('uses defaults when styling is undefined', () => {
    const result = deriveSegmentBuffers(undefined, 60)
    // defaults: fade preRoll=3, fadeIn=1 → 4s=240f; postRoll=2, fadeOut=1 → 3s=180f
    expect(result.preRollFrames).toBe(240)
    expect(result.postRollFrames).toBe(180)
  })
})
```

- [ ] **Step 9: Implement `deriveSegmentBuffers`**

```ts
import type { OverlayStyling } from '@racedash/core'
import {
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_FADE_POST_ROLL_SECONDS,
  DEFAULT_FADE_IN_DURATION_SECONDS,
  DEFAULT_FADE_OUT_DURATION_SECONDS,
} from '@racedash/core'

export function deriveSegmentBuffers(
  styling: OverlayStyling | undefined,
  fps: number,
): { preRollFrames: number; postRollFrames: number } {
  const fade = styling?.fade
  const fadePreRoll = (fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS) +
    (fade?.durationSeconds ?? DEFAULT_FADE_IN_DURATION_SECONDS)
  const fadePostRoll = (fade?.postRollSeconds ?? DEFAULT_FADE_POST_ROLL_SECONDS) +
    (fade?.fadeOutDurationSeconds ?? DEFAULT_FADE_OUT_DURATION_SECONDS)

  const label = styling?.segmentLabel
  const labelPreRoll = label
    ? (label.preRollSeconds ?? 2) + (label.fadeInDurationSeconds ?? 0.5)
    : 0
  const labelPostRoll = label
    ? (label.postRollSeconds ?? 2) + (label.fadeOutDurationSeconds ?? 0.5)
    : 0

  const preRollSeconds = Math.max(fadePreRoll, labelPreRoll)
  const postRollSeconds = Math.max(fadePostRoll, labelPostRoll)

  return {
    preRollFrames: Math.round(preRollSeconds * fps),
    postRollFrames: Math.round(postRollSeconds * fps),
  }
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

- [ ] **Step 11: Write failing tests for `inferCutBounds`**

```ts
import { inferCutBounds } from '../videoEditing'
import type { SegmentConfig } from '../../../../../types/project'

describe('inferCutBounds', () => {
  const segments = [
    { id: 's1', label: 'Practice', videoOffsetFrame: 13740 }, // 3:49 at 60fps
    { id: 's2', label: 'Qualifying', videoOffsetFrame: 32460 }, // 9:01 at 60fps
  ] as SegmentConfig[]

  const segmentSpans = [
    { startFrame: 13740, endFrame: 30540 },  // Practice 3:49-8:29
    { startFrame: 32460, endFrame: 68400 },   // Qualifying 9:01-19:00
  ]

  const buffers = { preRollFrames: 300, postRollFrames: 180 }  // 5s pre, 3s post at 60fps

  it('infers cut before first segment', () => {
    const result = inferCutBounds(0, segmentSpans, buffers, 100000)
    expect(result).toEqual({ id: expect.any(String), startFrame: 0, endFrame: 13440 })
    // endFrame = first segment start (13740) - preRoll (300) = 13440
  })

  it('infers cut between segments', () => {
    const result = inferCutBounds(31000, segmentSpans, buffers, 100000)
    // startFrame = Practice end (30540) + postRoll (180) = 30720
    // endFrame = Qualifying start (32460) - preRoll (300) = 32160
    expect(result).toEqual({ id: expect.any(String), startFrame: 30720, endFrame: 32160 })
  })

  it('returns null when playhead is inside a segment', () => {
    expect(inferCutBounds(20000, segmentSpans, buffers, 100000)).toBeNull()
  })

  it('returns null when playhead is inside pre-roll zone', () => {
    // 13740 - 300 = 13440. Frame 13500 is inside pre-roll.
    expect(inferCutBounds(13500, segmentSpans, buffers, 100000)).toBeNull()
  })
})
```

- [ ] **Step 12: Implement `inferCutBounds`**

```ts
export function inferCutBounds(
  playheadFrame: number,
  segmentSpans: Array<{ startFrame: number; endFrame: number }>,
  buffers: { preRollFrames: number; postRollFrames: number },
  totalFrames: number,
): CutRegion | null {
  // Check if playhead is inside any segment or its buffer zone
  for (const seg of segmentSpans) {
    const bufferedStart = seg.startFrame - buffers.preRollFrames
    const bufferedEnd = seg.endFrame + buffers.postRollFrames
    if (playheadFrame >= bufferedStart && playheadFrame < bufferedEnd) {
      return null
    }
  }

  // Find surrounding segments
  const sorted = [...segmentSpans].sort((a, b) => a.startFrame - b.startFrame)
  let prevEnd = 0
  let nextStart = totalFrames

  for (const seg of sorted) {
    if (seg.startFrame > playheadFrame) {
      nextStart = seg.startFrame
      break
    }
    prevEnd = seg.endFrame
  }

  const startFrame = prevEnd === 0 ? 0 : prevEnd + buffers.postRollFrames
  const endFrame = nextStart === totalFrames ? totalFrames : nextStart - buffers.preRollFrames

  if (startFrame >= endFrame) return null

  return { id: crypto.randomUUID(), startFrame, endFrame }
}
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

- [ ] **Step 14: Write failing tests for `computeBoundaries`**

```ts
import { computeBoundaries } from '../videoEditing'

describe('computeBoundaries', () => {
  it('returns project start and end with no cuts or segments', () => {
    const result = computeBoundaries(1000, [], [])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'start', kind: 'projectStart', oneSided: true })
    expect(result[1]).toMatchObject({ id: 'end', kind: 'projectEnd', oneSided: true })
  })

  it('adds cut boundaries', () => {
    const result = computeBoundaries(1000, [{ id: 'c1', startFrame: 200, endFrame: 400 }], [])
    const cutBoundary = result.find((b) => b.kind === 'cut')
    expect(cutBoundary).toMatchObject({ id: 'cut:c1', kind: 'cut', oneSided: false })
  })

  it('adds segment seam boundaries', () => {
    const segments = [
      { id: 's1', startFrame: 100, endFrame: 300 },
      { id: 's2', startFrame: 400, endFrame: 600 },
    ]
    const result = computeBoundaries(1000, [], segments)
    const segBoundary = result.find((b) => b.kind === 'segment')
    expect(segBoundary).toMatchObject({ id: 'segment:s1:s2', kind: 'segment', oneSided: false })
  })

  it('project start allows only fadeFromBlack and fadeThroughBlack', () => {
    const result = computeBoundaries(1000, [], [])
    const start = result.find((b) => b.id === 'start')!
    expect(start.allowedTypes).toEqual(['fadeFromBlack', 'fadeThroughBlack'])
  })

  it('project end allows only fadeToBlack and fadeThroughBlack', () => {
    const result = computeBoundaries(1000, [], [])
    const end = result.find((b) => b.id === 'end')!
    expect(end.allowedTypes).toEqual(['fadeToBlack', 'fadeThroughBlack'])
  })
})
```

- [ ] **Step 15: Implement `computeBoundaries`**

```ts
import type { Boundary, TransitionType } from '../../../../types/videoEditing'

const ONE_SIDED_START_TYPES: TransitionType[] = ['fadeFromBlack', 'fadeThroughBlack']
const ONE_SIDED_END_TYPES: TransitionType[] = ['fadeToBlack', 'fadeThroughBlack']
const ALL_TYPES: TransitionType[] = ['fadeFromBlack', 'fadeToBlack', 'fadeThroughBlack', 'crossfade']

export function computeBoundaries(
  totalFrames: number,
  cuts: CutRegion[],
  segmentSpans: Array<{ id: string; startFrame: number; endFrame: number }>,
): Boundary[] {
  const boundaries: Boundary[] = [
    { id: 'start', kind: 'projectStart', frameInSource: 0, oneSided: true, label: 'Project Start', allowedTypes: ONE_SIDED_START_TYPES },
    { id: 'end', kind: 'projectEnd', frameInSource: totalFrames, oneSided: true, label: 'Project End', allowedTypes: ONE_SIDED_END_TYPES },
  ]

  for (const cut of cuts) {
    boundaries.push({
      id: `cut:${cut.id}`,
      kind: 'cut',
      frameInSource: cut.startFrame,
      oneSided: false,
      label: `Cut at ${formatFrameAsTime(cut.startFrame, 60)}`,
      allowedTypes: ALL_TYPES,
    })
  }

  // Segment seams: adjacent segments not separated by a cut
  const sorted = [...segmentSpans].sort((a, b) => a.startFrame - b.startFrame)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const seamFrame = Math.floor((a.endFrame + b.startFrame) / 2)
    // Check no cut separates them
    const separated = cuts.some((c) => c.startFrame <= a.endFrame && c.endFrame >= b.startFrame)
    if (!separated) {
      boundaries.push({
        id: `segment:${a.id}:${b.id}`,
        kind: 'segment',
        frameInSource: seamFrame,
        oneSided: false,
        label: `${a.id} → ${b.id}`,
        allowedTypes: ALL_TYPES,
      })
    }
  }

  return boundaries.sort((a, b) => a.frameInSource - b.frameInSource)
}

function formatFrameAsTime(frame: number, fps: number): string {
  const seconds = frame / fps
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

- [ ] **Step 16: Run all tests**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

- [ ] **Step 17: Write failing test for `reconcileTransitions`**

```ts
import { reconcileTransitions } from '../videoEditing'
import type { Transition, Boundary } from '../../../../../types/videoEditing'

describe('reconcileTransitions', () => {
  it('removes transitions referencing non-existent boundaries', () => {
    const transitions: Transition[] = [
      { id: 't1', boundaryId: 'cut:c1', type: 'crossfade', durationMs: 500 },
      { id: 't2', boundaryId: 'cut:c_gone', type: 'crossfade', durationMs: 500 },
    ]
    const boundaries: Boundary[] = [
      { id: 'start', kind: 'projectStart', frameInSource: 0, oneSided: true, label: '', allowedTypes: [] },
      { id: 'cut:c1', kind: 'cut', frameInSource: 200, oneSided: false, label: '', allowedTypes: [] },
      { id: 'end', kind: 'projectEnd', frameInSource: 1000, oneSided: true, label: '', allowedTypes: [] },
    ]
    const result = reconcileTransitions(transitions, boundaries)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].id).toBe('t1')
    expect(result.removed).toHaveLength(1)
    expect(result.removed[0].id).toBe('t2')
  })
})
```

- [ ] **Step 18: Implement `reconcileTransitions`**

```ts
export function reconcileTransitions(
  transitions: Transition[],
  boundaries: Boundary[],
): { kept: Transition[]; removed: Transition[] } {
  const boundaryIds = new Set(boundaries.map((b) => b.id))
  const kept: Transition[] = []
  const removed: Transition[] = []
  for (const t of transitions) {
    if (boundaryIds.has(t.boundaryId)) {
      kept.push(t)
    } else {
      removed.push(t)
    }
  }
  return { kept, removed }
}
```

- [ ] **Step 19: Run all tests and commit**

Run: `cd apps/desktop && npx vitest run src/renderer/src/lib/__tests__/videoEditing.test.ts`
Expected: PASS

```bash
git add apps/desktop/src/renderer/src/lib/videoEditing.ts apps/desktop/src/renderer/src/lib/__tests__/videoEditing.test.ts
git commit -m "feat: add pure video editing functions with tests"
```

---

### Task 3: React Hooks for Video Editing

**Files:**
- Create: `apps/desktop/src/renderer/src/hooks/useVideoEditing.ts`

- [ ] **Step 1: Implement hooks**

```ts
// apps/desktop/src/renderer/src/hooks/useVideoEditing.ts
import { useMemo, useCallback } from 'react'
import type { CutRegion, Transition, Boundary, KeptRange } from '../../../../types/videoEditing'
import type { OverlayStyling } from '@racedash/core'
import {
  computeKeptRanges,
  toOutputFrame,
  toSourceFrame,
  deriveSegmentBuffers,
  computeBoundaries,
  reconcileTransitions,
} from '../lib/videoEditing'

export function useKeptRanges(cutRegions: CutRegion[], totalFrames: number): KeptRange[] {
  return useMemo(() => computeKeptRanges(totalFrames, cutRegions), [cutRegions, totalFrames])
}

export function useSegmentBuffers(
  styling: OverlayStyling | undefined,
  fps: number,
): { preRollFrames: number; postRollFrames: number } {
  return useMemo(() => deriveSegmentBuffers(styling, fps), [styling, fps])
}

export function useBoundaries(
  totalFrames: number,
  cuts: CutRegion[],
  segmentSpans: Array<{ id: string; startFrame: number; endFrame: number }>,
): Boundary[] {
  return useMemo(() => computeBoundaries(totalFrames, cuts, segmentSpans), [totalFrames, cuts, segmentSpans])
}

export function useFrameMapping(
  cuts: CutRegion[],
  transitions: Transition[],
  fps: number,
): {
  toOutput: (sourceFrame: number) => number
  toSource: (outputFrame: number) => number
} {
  const toOutput = useCallback(
    (sourceFrame: number) => toOutputFrame(sourceFrame, cuts, transitions, fps),
    [cuts, transitions, fps],
  )
  const toSource = useCallback(
    (outputFrame: number) => toSourceFrame(outputFrame, cuts, transitions, fps),
    [cuts, transitions, fps],
  )
  return useMemo(() => ({ toOutput, toSource }), [toOutput, toSource])
}

export function useReconciledTransitions(
  transitions: Transition[],
  boundaries: Boundary[],
): { kept: Transition[]; removed: Transition[] } {
  return useMemo(() => reconcileTransitions(transitions, boundaries), [transitions, boundaries])
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/useVideoEditing.ts
git commit -m "feat: add React hooks for video editing derived state"
```

---

### Task 4: Editor Layout — Toggleable Left Drawer

**Files:**
- Create: `apps/desktop/src/renderer/src/components/video-editing/VideoEditingDrawer.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`

- [ ] **Step 1: Create drawer shell component**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/VideoEditingDrawer.tsx
import React from 'react'
import { SectionLabel } from '@/components/shared/SectionLabel'

interface VideoEditingDrawerProps {
  children?: React.ReactNode
}

export function VideoEditingDrawer({ children }: VideoEditingDrawerProps): React.ReactElement {
  return (
    <div className="flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-card p-3">
      <span className="mb-3 text-xs font-medium tracking-widest text-muted-foreground">VIDEO EDITING</span>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Update Editor.tsx layout to 3-column with drawer toggle**

In `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`:

Add state for drawer visibility:
```tsx
const [drawerOpen, setDrawerOpen] = useState(false)
```

Add state for video editing data:
```tsx
import type { CutRegion, Transition } from '../../../../types/videoEditing'

const [cutRegions, setCutRegions] = useState<CutRegion[]>(projectState.cutRegions ?? [])
const [transitions, setTransitions] = useState<Transition[]>(projectState.transitions ?? [])
```

Change the layout grid from `grid-cols-[1fr_430px]` to conditionally include the drawer:

```tsx
<div className={`grid h-full w-full overflow-hidden ${drawerOpen ? 'grid-cols-[256px_1fr_430px]' : 'grid-cols-[1fr_430px]'}`}>
  {/* Left drawer */}
  {drawerOpen && (
    <VideoEditingDrawer>
      {/* Cuts and Transitions sections — wired in later tasks */}
    </VideoEditingDrawer>
  )}

  {/* Center pane — video + timeline */}
  <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
    {/* ... existing VideoPane + Timeline */}
  </div>

  {/* Right pane — tabbed panel */}
  <div className="flex min-w-0 flex-col overflow-hidden bg-card">
    {/* ... existing EditorTabsPane */}
  </div>
</div>
```

Add a toggle button in the editor header. Add it to the TabsList area in EditorTabsPane, or add a small toolbar above the left pane. The simplest approach: add an icon button at the top-left of the center pane's header:

Add to Timeline header pass-through — we'll wire this in Task 5 when adding tabs. For now, add a drawer toggle button to the EditorTabsPane header bar (next to Save):

In `EditorTabsPane.tsx`, add prop `onToggleDrawer` and `drawerOpen`:
```tsx
// Add to EditorTabsPaneProps:
  drawerOpen?: boolean
  onToggleDrawer?: () => void

// In the header area (next to Save button):
<Button size="sm" variant="ghost" onClick={onToggleDrawer} className="mr-auto">
  <PanelLeft className="h-4 w-4" />
</Button>
```

Import `PanelLeft` from `lucide-react`.

- [ ] **Step 3: Wire drawer toggle in Editor.tsx**

Pass `drawerOpen` and `onToggleDrawer={() => setDrawerOpen((o) => !o)}` to `EditorTabsPane`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video-editing/VideoEditingDrawer.tsx \
  apps/desktop/src/renderer/src/screens/editor/Editor.tsx \
  apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx
git commit -m "feat: add toggleable video editing left drawer to editor layout"
```

---

### Task 5: Timeline Source/Project View Tabs

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/video/timeline/Timeline.tsx`

- [ ] **Step 1: Add view mode state and tabs to Timeline header**

```tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type TimelineViewMode = 'source' | 'project'

// Add to TimelineProps:
  viewMode?: TimelineViewMode
  onViewModeChange?: (mode: TimelineViewMode) => void
```

Replace the header's left side with:
```tsx
<div className="flex items-center gap-3">
  <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
  {onViewModeChange && (
    <Tabs value={viewMode ?? 'source'} onValueChange={(v) => onViewModeChange(v as TimelineViewMode)}>
      <TabsList className="h-6">
        <TabsTrigger value="source" className="h-5 px-2 text-[10px]">Source</TabsTrigger>
        <TabsTrigger value="project" className="h-5 px-2 text-[10px]">Project</TabsTrigger>
      </TabsList>
    </Tabs>
  )}
</div>
```

- [ ] **Step 2: Wire view mode from Editor.tsx**

In `Editor.tsx`, add:
```tsx
const [timelineViewMode, setTimelineViewMode] = useState<TimelineViewMode>('source')
```

Pass to `<Timeline>`:
```tsx
<Timeline
  ref={timelineRef}
  project={projectState}
  videoInfo={videoInfo}
  multiVideoInfo={multiVideoInfo}
  timestampsResult={timestampsResult}
  overrides={overrides}
  onSeek={handleSeek}
  viewMode={timelineViewMode}
  onViewModeChange={setTimelineViewMode}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video/timeline/Timeline.tsx \
  apps/desktop/src/renderer/src/screens/editor/Editor.tsx
git commit -m "feat: add Source/Project view tabs to timeline header"
```

---

### Task 6: Cut Region Visualization on Timeline

**Files:**
- Create: `apps/desktop/src/renderer/src/components/video-editing/CutRegionOverlay.tsx`
- Modify: `apps/desktop/src/renderer/src/components/video/timeline/TimelineTracks.tsx`

- [ ] **Step 1: Create CutRegionOverlay component**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/CutRegionOverlay.tsx
import React from 'react'
import type { CutRegion } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface CutRegionOverlayProps {
  cuts: CutRegion[]
  duration: number
  fps: number
  onClick?: (cut: CutRegion) => void
}

export function CutRegionOverlay({ cuts, duration, fps, onClick }: CutRegionOverlayProps): React.ReactElement {
  return (
    <>
      {cuts.map((cut) => {
        const startSec = cut.startFrame / fps
        const widthSec = (cut.endFrame - cut.startFrame) / fps
        return (
          <div
            key={cut.id}
            className="absolute inset-y-0 cursor-pointer bg-red-500/15 hover:bg-red-500/25 transition-colors"
            style={{
              left: pct(startSec, duration),
              width: pct(widthSec, duration),
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)',
            }}
            onClick={() => onClick?.(cut)}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Add cut overlays to TimelineTracks VIDEO track**

In `TimelineTracks.tsx`, add props:
```tsx
import type { CutRegion } from '../../../../../types/videoEditing'
import type { TimelineViewMode } from '../Timeline'
import { CutRegionOverlay } from '@/components/video-editing/CutRegionOverlay'

// Add to TimelineTracksProps:
  cutRegions?: CutRegion[]
  viewMode?: TimelineViewMode
  onCutClick?: (cut: CutRegion) => void
```

In the VIDEO track section (after the existing video file bars), add:
```tsx
{viewMode !== 'project' && cutRegions && cutRegions.length > 0 && (
  <CutRegionOverlay
    cuts={cutRegions}
    duration={duration}
    fps={fps}
    onClick={onCutClick}
  />
)}
```

- [ ] **Step 3: Wire props from Timeline.tsx → TimelineTracks**

Pass `cutRegions`, `viewMode`, and `onCutClick` through from `Timeline` props to `TimelineTracks`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video-editing/CutRegionOverlay.tsx \
  apps/desktop/src/renderer/src/components/video/timeline/TimelineTracks.tsx \
  apps/desktop/src/renderer/src/components/video/timeline/Timeline.tsx
git commit -m "feat: render cut regions as striped overlays on timeline VIDEO track"
```

---

### Task 7: Left Drawer — Cuts List + Add Button + Popover

**Files:**
- Create: `apps/desktop/src/renderer/src/components/video-editing/CutRegionList.tsx`
- Create: `apps/desktop/src/renderer/src/components/video-editing/CutRegionPopover.tsx`

- [ ] **Step 1: Create CutRegionPopover**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/CutRegionPopover.tsx
import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CutRegion } from '../../../../../types/videoEditing'

function frameToTimestamp(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  const f = Math.round((totalSeconds % 1) * fps)
  return `${m}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
}

function timestampToFrame(ts: string, fps: number): number | null {
  const parts = ts.split(':').map(Number)
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return Math.round((parts[0] * 60 + parts[1] + parts[2] / fps) * fps)
  }
  if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
    return Math.round((parts[0] * 60 + parts[1]) * fps)
  }
  return null
}

interface CutRegionPopoverProps {
  cut: CutRegion
  fps: number
  onUpdate: (updated: CutRegion) => void
  onDelete: (id: string) => void
  children: React.ReactNode
}

export function CutRegionPopover({ cut, fps, onUpdate, onDelete, children }: CutRegionPopoverProps): React.ReactElement {
  const [inStr, setInStr] = useState(frameToTimestamp(cut.startFrame, fps))
  const [outStr, setOutStr] = useState(frameToTimestamp(cut.endFrame, fps))

  const handleSave = () => {
    const newStart = timestampToFrame(inStr, fps)
    const newEnd = timestampToFrame(outStr, fps)
    if (newStart !== null && newEnd !== null && newStart < newEnd) {
      onUpdate({ ...cut, startFrame: newStart, endFrame: newEnd })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">In (m:ss:ff)</Label>
          <Input value={inStr} onChange={(e) => setInStr(e.target.value)} onBlur={handleSave} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Out (m:ss:ff)</Label>
          <Input value={outStr} onChange={(e) => setOutStr(e.target.value)} onBlur={handleSave} className="h-7 text-xs" />
        </div>
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(cut.id)}>
          Delete
        </Button>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Create CutRegionList**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/CutRegionList.tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, AlertTriangle } from 'lucide-react'
import type { CutRegion } from '../../../../../types/videoEditing'
import { CutRegionPopover } from './CutRegionPopover'

function formatRange(cut: CutRegion, fps: number): string {
  const toTime = (frame: number) => {
    const s = frame / fps
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  return `${toTime(cut.startFrame)} – ${toTime(cut.endFrame)}`
}

interface CutRegionListProps {
  cuts: CutRegion[]
  fps: number
  warningCutIds?: Set<string>
  onAdd: () => void
  onUpdate: (updated: CutRegion) => void
  onDelete: (id: string) => void
  disabled?: boolean
}

export function CutRegionList({
  cuts,
  fps,
  warningCutIds,
  onAdd,
  onUpdate,
  onDelete,
  disabled,
}: CutRegionListProps): React.ReactElement {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Cuts</span>
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onAdd} disabled={disabled}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {cuts.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No cuts. Position the playhead in dead space and click +.</p>
      ) : (
        <div className="space-y-1">
          {cuts.map((cut) => (
            <CutRegionPopover key={cut.id} cut={cut} fps={fps} onUpdate={onUpdate} onDelete={onDelete}>
              <button className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-accent">
                <span className="flex-1 truncate">{formatRange(cut, fps)}</span>
                {warningCutIds?.has(cut.id) && <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />}
              </button>
            </CutRegionPopover>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Wire into VideoEditingDrawer in Editor.tsx**

In `Editor.tsx`, import and use `CutRegionList` inside the drawer:

```tsx
import { CutRegionList } from '@/components/video-editing/CutRegionList'
import { inferCutBounds } from '@/lib/videoEditing'
import { useSegmentBuffers } from '@/hooks/useVideoEditing'

// Inside Editor component:
const segmentBuffers = useSegmentBuffers(styleState.styling, videoInfo?.fps ?? 60)

const handleAddCut = useCallback(() => {
  const fps = videoInfo?.fps ?? 60
  const totalFrames = Math.ceil((videoInfo?.durationSeconds ?? 0) * fps)
  const playheadFrame = Math.round(currentTimeRef.current * fps)
  // Build segment spans from timestampsResult
  const spans = (projectState.segments ?? []).map((seg, i) => {
    const startSeconds = timestampsResult?.offsets[i] ?? (seg.videoOffsetFrame ?? 0) / fps
    const rawSeg = timestampsResult?.segments[i] as any
    const laps = rawSeg?.selectedDriver?.laps as Array<{ cumulative: number }> | undefined
    const lastLap = laps?.[laps.length - 1]
    const endSeconds = lastLap ? startSeconds + lastLap.cumulative : startSeconds
    return { startFrame: Math.round(startSeconds * fps), endFrame: Math.round(endSeconds * fps) }
  })

  const newCut = inferCutBounds(playheadFrame, spans, segmentBuffers, totalFrames)
  if (!newCut) {
    toast.error('No dead space at playhead position')
    return
  }
  setCutRegions((prev) => [...prev, newCut])
}, [videoInfo, timestampsResult, projectState.segments, segmentBuffers])

const handleUpdateCut = useCallback((updated: CutRegion) => {
  setCutRegions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
}, [])

const handleDeleteCut = useCallback((id: string) => {
  setCutRegions((prev) => prev.filter((c) => c.id !== id))
  setTransitions((prev) => prev.filter((t) => t.boundaryId !== `cut:${id}`))
}, [])
```

Wire into the drawer:
```tsx
{drawerOpen && (
  <VideoEditingDrawer>
    <CutRegionList
      cuts={cutRegions}
      fps={videoInfo?.fps ?? 60}
      onAdd={handleAddCut}
      onUpdate={handleUpdateCut}
      onDelete={handleDeleteCut}
      disabled={!timestampsResult}
    />
  </VideoEditingDrawer>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video-editing/CutRegionList.tsx \
  apps/desktop/src/renderer/src/components/video-editing/CutRegionPopover.tsx \
  apps/desktop/src/renderer/src/screens/editor/Editor.tsx
git commit -m "feat: add cuts list and popover in video editing drawer"
```

---

### Task 8: Transition Drag Pills + Drop Targets + Popover

**Files:**
- Create: `apps/desktop/src/renderer/src/components/video-editing/TransitionPills.tsx`
- Create: `apps/desktop/src/renderer/src/components/video-editing/TransitionPopover.tsx`
- Create: `apps/desktop/src/renderer/src/components/video-editing/BoundaryMarker.tsx`
- Create: `apps/desktop/src/renderer/src/components/video-editing/TransitionBar.tsx`

This task introduces @dnd-kit for drag-and-drop.

- [ ] **Step 1: Install @dnd-kit**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm add @dnd-kit/core @dnd-kit/utilities --filter desktop`

- [ ] **Step 2: Create TransitionPills (draggable pills in drawer)**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/TransitionPills.tsx
import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { TransitionType } from '../../../../../types/videoEditing'

const TRANSITION_TYPES: { type: TransitionType; label: string }[] = [
  { type: 'fadeFromBlack', label: 'Fade From Black' },
  { type: 'fadeToBlack', label: 'Fade To Black' },
  { type: 'fadeThroughBlack', label: 'Fade Through Black' },
  { type: 'crossfade', label: 'Crossfade' },
]

function DraggablePill({ type, label }: { type: TransitionType; label: string }): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `transition-pill-${type}`,
    data: { type: 'transition-pill', transitionType: type },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border border-border bg-accent px-2 py-1 text-[10px] text-foreground select-none ${isDragging ? 'opacity-50' : ''}`}
    >
      {label}
    </div>
  )
}

function DraggableCutPill(): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'cut-pill',
    data: { type: 'cut-pill' },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-[10px] text-destructive select-none ${isDragging ? 'opacity-50' : ''}`}
    >
      Cut
    </div>
  )
}

export function TransitionPills(): React.ReactElement {
  return (
    <section>
      <span className="mb-2 block text-xs font-medium text-muted-foreground">Transitions</span>
      <div className="flex flex-wrap gap-1.5">
        <DraggableCutPill />
        {TRANSITION_TYPES.map(({ type, label }) => (
          <DraggablePill key={type} type={type} label={label} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create BoundaryMarker (drop targets on timeline)**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/BoundaryMarker.tsx
import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Boundary } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface BoundaryMarkerProps {
  boundary: Boundary
  duration: number
  fps: number
  hasTransition: boolean
}

export function BoundaryMarker({ boundary, duration, fps, hasTransition }: BoundaryMarkerProps): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({
    id: `boundary-${boundary.id}`,
    data: { type: 'boundary', boundary },
  })

  const posSeconds = boundary.frameInSource / fps

  return (
    <div
      ref={setNodeRef}
      className={`absolute top-0 bottom-0 z-10 flex w-3 -translate-x-1/2 items-center justify-center ${isOver ? 'bg-primary/20' : ''}`}
      style={{ left: pct(posSeconds, duration) }}
    >
      <div
        className={`h-3 w-1 rounded-full ${hasTransition ? 'bg-primary' : 'bg-muted-foreground/40'} ${isOver ? 'scale-150 bg-primary' : ''} transition-transform`}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create TransitionPopover**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/TransitionPopover.tsx
import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Transition, TransitionType } from '../../../../../types/videoEditing'

const TYPE_LABELS: Record<TransitionType, string> = {
  fadeFromBlack: 'Fade From Black',
  fadeToBlack: 'Fade To Black',
  fadeThroughBlack: 'Fade Through Black',
  crossfade: 'Crossfade',
}

interface TransitionPopoverProps {
  transition: Transition
  allowedTypes: TransitionType[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
  children: React.ReactNode
}

export function TransitionPopover({
  transition,
  allowedTypes,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  children,
}: TransitionPopoverProps): React.ReactElement {
  const [durationStr, setDurationStr] = useState(String(transition.durationMs))

  const handleTypeChange = (type: string) => {
    onUpdate({ ...transition, type: type as TransitionType })
  }

  const handleDurationBlur = () => {
    const ms = parseInt(durationStr, 10)
    if (!isNaN(ms) && ms > 0) {
      onUpdate({ ...transition, durationMs: ms })
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={transition.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedTypes.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (ms)</Label>
          <Input value={durationStr} onChange={(e) => setDurationStr(e.target.value)} onBlur={handleDurationBlur} className="h-7 text-xs" />
        </div>
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(transition.id)}>
          Delete
        </Button>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 5: Create TransitionBar (placed transitions on timeline)**

```tsx
// apps/desktop/src/renderer/src/components/video-editing/TransitionBar.tsx
import React, { useState } from 'react'
import type { Transition, Boundary, TransitionType } from '../../../../../types/videoEditing'
import { TransitionPopover } from './TransitionPopover'
import { pct } from '@/components/video/timeline/types'

interface TransitionBarProps {
  transition: Transition
  boundary: Boundary
  duration: number
  fps: number
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
}

export function TransitionBar({ transition, boundary, duration, fps, onUpdate, onDelete }: TransitionBarProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const posSeconds = boundary.frameInSource / fps
  const widthSeconds = transition.durationMs / 1000

  return (
    <TransitionPopover
      transition={transition}
      allowedTypes={boundary.allowedTypes}
      open={open}
      onOpenChange={setOpen}
      onUpdate={onUpdate}
      onDelete={onDelete}
    >
      <div
        className="absolute top-0.5 bottom-0.5 z-20 cursor-pointer rounded-sm bg-primary/30 border border-primary/50 hover:bg-primary/40 transition-colors"
        style={{
          left: `calc(${pct(posSeconds, duration)} - ${pct(widthSeconds / 2, duration)})`,
          width: pct(widthSeconds, duration),
        }}
        onClick={() => setOpen(true)}
      />
    </TransitionPopover>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video-editing/TransitionPills.tsx \
  apps/desktop/src/renderer/src/components/video-editing/BoundaryMarker.tsx \
  apps/desktop/src/renderer/src/components/video-editing/TransitionPopover.tsx \
  apps/desktop/src/renderer/src/components/video-editing/TransitionBar.tsx
git commit -m "feat: add transition pills, boundary markers, and transition bar components"
```

---

### Task 9: Wire Drag-and-Drop in Editor + Timeline

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`
- Modify: `apps/desktop/src/renderer/src/components/video/timeline/TimelineTracks.tsx`

- [ ] **Step 1: Wrap Editor in DndContext**

In `Editor.tsx`:
```tsx
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
```

Wrap the entire layout in `<DndContext onDragEnd={handleDragEnd}>`:

```tsx
const handleDragEnd = useCallback((event: DragEndEvent) => {
  const { active, over } = event
  if (!over) return

  const activeData = active.data.current
  const overData = over.data.current

  // Cut pill dropped on timeline dead space
  if (activeData?.type === 'cut-pill' && overData?.type === 'timeline-track') {
    const fps = videoInfo?.fps ?? 60
    const totalFrames = Math.ceil((videoInfo?.durationSeconds ?? 0) * fps)
    // Use drop position X to estimate frame
    // For MVP, use current playhead position as drop position proxy
    const playheadFrame = Math.round(currentTimeRef.current * fps)
    const spans = segmentSpansWithIds.map(({ startFrame, endFrame }) => ({ startFrame, endFrame }))
    const newCut = inferCutBounds(playheadFrame, spans, segmentBuffers, totalFrames)
    if (!newCut) {
      toast.error('No dead space here')
      return
    }
    setCutRegions((prev) => [...prev, newCut])
    return
  }

  // Transition pill dropped on a boundary
  if (activeData?.type === 'transition-pill' && overData?.type === 'boundary') {
    const boundary = overData.boundary as Boundary
    const transitionType = activeData.transitionType as TransitionType

    // Check if boundary already has a transition
    const existing = transitions.find((t) => t.boundaryId === boundary.id)
    if (existing) {
      toast.error('This boundary already has a transition', {
        action: { label: 'Edit', onClick: () => { /* scroll to and open popover — handled by state */ } },
      })
      return
    }

    // Check compatibility
    if (!boundary.allowedTypes.includes(transitionType)) {
      toast.error(`${transitionType} is not compatible with ${boundary.label}`)
      return
    }

    const newTransition: Transition = {
      id: crypto.randomUUID(),
      boundaryId: boundary.id,
      type: transitionType,
      durationMs: 500,
    }
    setTransitions((prev) => [...prev, newTransition])
  }
}, [transitions])
```

- [ ] **Step 2: Pass boundaries and transitions to TimelineTracks**

Add to Timeline props and pass through:
```tsx
// Timeline.tsx — new props:
  boundaries?: Boundary[]
  transitions?: Transition[]
  onTransitionUpdate?: (updated: Transition) => void
  onTransitionDelete?: (id: string) => void
```

In TimelineTracks, render BoundaryMarker and TransitionBar components in the VIDEO track section:

```tsx
{boundaries?.map((b) => (
  <BoundaryMarker
    key={b.id}
    boundary={b}
    duration={duration}
    fps={fps}
    hasTransition={transitions?.some((t) => t.boundaryId === b.id) ?? false}
  />
))}
{transitions?.map((t) => {
  const boundary = boundaries?.find((b) => b.id === t.boundaryId)
  if (!boundary) return null
  return (
    <TransitionBar
      key={t.id}
      transition={t}
      boundary={boundary}
      duration={duration}
      fps={fps}
      onUpdate={onTransitionUpdate!}
      onDelete={onTransitionDelete!}
    />
  )
})}
```

- [ ] **Step 3: Add TransitionPills to drawer**

In `Editor.tsx`, add `TransitionPills` to the drawer below `CutRegionList`:
```tsx
import { TransitionPills } from '@/components/video-editing/TransitionPills'

{drawerOpen && (
  <VideoEditingDrawer>
    <CutRegionList ... />
    <TransitionPills />
  </VideoEditingDrawer>
)}
```

- [ ] **Step 4: Compute boundaries in Editor.tsx and pass down**

```tsx
import { useBoundaries, useReconciledTransitions } from '@/hooks/useVideoEditing'

// Compute segment spans with IDs for boundary computation
const segmentSpansWithIds = useMemo(() => {
  const fps = videoInfo?.fps ?? 60
  return (projectState.segments ?? []).map((seg, i) => {
    const startSeconds = timestampsResult?.offsets[i] ?? (seg.videoOffsetFrame ?? 0) / fps
    const rawSeg = timestampsResult?.segments[i] as any
    const laps = rawSeg?.selectedDriver?.laps as Array<{ cumulative: number }> | undefined
    const lastLap = laps?.[laps.length - 1]
    const endSeconds = lastLap ? startSeconds + lastLap.cumulative : startSeconds
    return {
      id: seg.id,
      startFrame: Math.round(startSeconds * fps),
      endFrame: Math.round(endSeconds * fps),
    }
  })
}, [projectState.segments, timestampsResult, videoInfo])

const totalFrames = Math.ceil((videoInfo?.durationSeconds ?? 0) * (videoInfo?.fps ?? 60))
const boundaries = useBoundaries(totalFrames, cutRegions, segmentSpansWithIds)

// Reconcile transitions when boundaries change
const { kept: reconciledTransitions, removed } = useReconciledTransitions(transitions, boundaries)
useEffect(() => {
  if (removed.length > 0) {
    setTransitions(reconciledTransitions)
    toast.info(`${removed.length} transition(s) removed — boundary no longer exists`)
  }
}, [reconciledTransitions, removed])
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/Editor.tsx \
  apps/desktop/src/renderer/src/components/video/timeline/Timeline.tsx \
  apps/desktop/src/renderer/src/components/video/timeline/TimelineTracks.tsx
git commit -m "feat: wire drag-and-drop transitions onto timeline boundaries"
```

---

### Task 10: Project View Scrubbing

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx`

- [ ] **Step 1: Adjust time update and seek for Project view**

In `Editor.tsx`, use `useFrameMapping` to convert frames:

```tsx
import { useFrameMapping } from '@/hooks/useVideoEditing'

const frameMapping = useFrameMapping(cutRegions, transitions, videoInfo?.fps ?? 60)
```

Modify `handleTimeUpdate` — when in Project view, convert source time to output time for the timeline:
```tsx
const handleTimeUpdate = useCallback((t: number) => {
  currentTimeRef.current = t
  const displayTime = timelineViewMode === 'project'
    ? frameMapping.toOutput(Math.round(t * (videoInfo?.fps ?? 60))) / (videoInfo?.fps ?? 60)
    : t
  timelineRef.current?.seek(displayTime)
  timeUpdateFrameRef.current++
  if (timeUpdateFrameRef.current % 15 === 0) {
    setCurrentTime(displayTime)
  }
}, [timelineViewMode, frameMapping, videoInfo])
```

Modify `handleSeek` — when in Project view, convert output time to source time for the video player:
```tsx
const handleSeek = useCallback((t: number) => {
  const sourceTime = timelineViewMode === 'project'
    ? frameMapping.toSource(Math.round(t * (videoInfo?.fps ?? 60))) / (videoInfo?.fps ?? 60)
    : t
  videoPaneRef.current?.seek(sourceTime)
}, [timelineViewMode, frameMapping, videoInfo])
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/Editor.tsx
git commit -m "feat: project view scrubbing skips cut regions via frame mapping"
```

---

### Task 11: Persist Cut Regions + Transitions to project.json

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`
- Modify: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Auto-save video editing state when it changes**

In `Editor.tsx`, add an effect that saves `cutRegions` and `transitions` to the project config:

```tsx
// Save cut regions and transitions to project.json
useEffect(() => {
  window.racedash
    .updateProjectVideoEditing(projectState.configPath, { cutRegions, transitions })
    .catch((err: unknown) => {
      console.warn('[Editor] failed to save video editing state:', err)
    })
}, [cutRegions, transitions, projectState.configPath])
```

- [ ] **Step 2: Add IPC handler for saving video editing state**

In `apps/desktop/src/main/ipc.ts`, add handler:

```ts
ipcMain.handle('racedash:updateProjectVideoEditing', (_event, configPath: string, data: { cutRegions: CutRegion[]; transitions: Transition[] }) => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  config.cutRegions = data.cutRegions
  config.transitions = data.transitions
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
})
```

Add the preload bridge and type definitions as well — follow the existing pattern for `updateProjectConfigOverrides`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/Editor.tsx \
  apps/desktop/src/main/ipc.ts \
  apps/desktop/src/types/ipc.ts
git commit -m "feat: persist cut regions and transitions to project.json"
```

---

### Task 12: Export Pipeline — Pass Cut Regions + Transitions

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`
- Modify: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Update RenderStartOpts**

In `apps/desktop/src/types/ipc.ts`, add to `RenderStartOpts`:
```ts
import type { CutRegion, Transition } from './videoEditing'

export interface RenderStartOpts {
  // ...existing fields
  cutRegions: CutRegion[]
  transitions: Transition[]
}
```

- [ ] **Step 2: Pass from ExportTab**

`ExportTab` needs `cutRegions` and `transitions` props. Add them to `ExportTabProps`:

```tsx
cutRegions: CutRegion[]
transitions: Transition[]
```

In `handleRender`, pass to `startRender`:
```tsx
await window.racedash.startRender({
  configPath: project.configPath,
  videoPaths: project.videoPaths,
  outputPath,
  style: overlayType,
  outputResolution,
  outputFrameRate,
  renderMode,
  cutRegions,
  transitions,
})
```

Disable the render button when no kept ranges:
```tsx
import { computeKeptRanges } from '@/lib/videoEditing'

const hasContent = useMemo(() => {
  if (!videoInfo) return false
  const totalFrames = Math.ceil(videoInfo.durationSeconds * videoInfo.fps)
  return computeKeptRanges(totalFrames, cutRegions).length > 0
}, [videoInfo, cutRegions])

// In the render button:
disabled={isBusy || !hasContent}
```

Add tooltip when disabled: `"Nothing to export — all video content has been cut."`

- [ ] **Step 3: Wire props from Editor.tsx to ExportTab**

In `EditorTabsPane`, add `cutRegions` and `transitions` props, pass to `ExportTab`.
In `Editor.tsx`, pass `cutRegions` and `transitions` to `EditorTabsPane`.

- [ ] **Step 4: Update IPC render handler to receive cut/transition data**

In `apps/desktop/src/main/ipc.ts`, the `racedash:startRender` handler already receives `opts: RenderStartOpts`. The new fields are now available. For MVP, the compositor integration (FFmpeg filter chains for transitions) is the next task.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/types/ipc.ts \
  apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx \
  apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx \
  apps/desktop/src/renderer/src/screens/editor/Editor.tsx \
  apps/desktop/src/main/ipc.ts
git commit -m "feat: pass cut regions and transitions through export pipeline"
```

---

### Task 13: Compositor — Render with Cut Regions

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Create: `packages/compositor/src/cuts.ts`
- Create: `packages/compositor/src/__tests__/cuts.test.ts`

- [ ] **Step 1: Write failing tests for FFmpeg concat filter generation**

```ts
// packages/compositor/src/__tests__/cuts.test.ts
import { describe, it, expect } from 'vitest'
import { buildCutConcatArgs } from '../cuts'

describe('buildCutConcatArgs', () => {
  it('returns simple args when no cuts', () => {
    const result = buildCutConcatArgs('/in.mp4', '/out.mp4', [], [], 60, 30)
    expect(result.trimFilterUsed).toBe(false)
  })

  it('generates trim+concat filter for cuts without transitions', () => {
    const result = buildCutConcatArgs(
      '/in.mp4',
      '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      [],
      60,
      30,
    )
    // Expects a filter_complex with trim filters for two kept ranges:
    // [0, 10s) and [20s, 30s)
    expect(result.trimFilterUsed).toBe(true)
    expect(result.args.join(' ')).toContain('trim')
    expect(result.args.join(' ')).toContain('concat')
  })
})
```

- [ ] **Step 2: Implement `buildCutConcatArgs`**

```ts
// packages/compositor/src/cuts.ts
import type { CutRegion, Transition } from '../../core/src' // adjust import path as needed

interface CutConcatResult {
  args: string[]
  trimFilterUsed: boolean
}

export function computeKeptRanges(
  totalFrames: number,
  cuts: CutRegion[],
): Array<{ startFrame: number; endFrame: number }> {
  if (cuts.length === 0) return [{ startFrame: 0, endFrame: totalFrames }]
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  const merged = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    if (sorted[i].startFrame <= prev.endFrame) {
      prev.endFrame = Math.max(prev.endFrame, sorted[i].endFrame)
    } else {
      merged.push({ ...sorted[i] })
    }
  }

  const ranges: Array<{ startFrame: number; endFrame: number }> = []
  let cursor = 0
  for (const cut of merged) {
    if (cut.startFrame > cursor) ranges.push({ startFrame: cursor, endFrame: cut.startFrame })
    cursor = cut.endFrame
  }
  if (cursor < totalFrames) ranges.push({ startFrame: cursor, endFrame: totalFrames })
  return ranges
}

export function buildCutConcatArgs(
  sourcePath: string,
  outputPath: string,
  cuts: CutRegion[],
  _transitions: Transition[],
  fps: number,
  totalDurationSeconds: number,
): CutConcatResult {
  const totalFrames = Math.ceil(totalDurationSeconds * fps)
  const keptRanges = computeKeptRanges(totalFrames, cuts)

  if (keptRanges.length === 1 && keptRanges[0].startFrame === 0 && keptRanges[0].endFrame === totalFrames) {
    return { args: [], trimFilterUsed: false }
  }

  // Build FFmpeg filter_complex with trim + concat
  const filters: string[] = []
  const concatInputs: string[] = []

  keptRanges.forEach((range, i) => {
    const startSec = range.startFrame / fps
    const endSec = range.endFrame / fps
    filters.push(`[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[a${i}]`)
    concatInputs.push(`[v${i}][a${i}]`)
  })

  filters.push(`${concatInputs.join('')}concat=n=${keptRanges.length}:v=1:a=1[outv][outa]`)
  const filterComplex = filters.join(';')

  const args = [
    '-i', sourcePath,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '[outa]',
    '-y', outputPath,
  ]

  return { args, trimFilterUsed: true }
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/compositor && npx vitest run src/__tests__/cuts.test.ts`
Expected: PASS

- [ ] **Step 4: Integrate into render session in ipc.ts**

In the `racedash:startRender` handler in `apps/desktop/src/main/ipc.ts`, the render pipeline is:
1. `renderOverlay()` — renders the Remotion overlay to a separate file (full video length).
2. `compositeVideo()` — FFmpeg composites overlay onto source video.

For cut regions, add a **third step** after compositing: apply cuts to the composited output using `buildCutConcatArgs`. This avoids modifying the overlay render (which runs at full video length).

```ts
import { buildCutConcatArgs } from '@racedash/compositor/cuts'

// After compositeVideo completes:
if (opts.cutRegions && opts.cutRegions.length > 0) {
  const compositedPath = opts.outputPath
  const trimmedPath = compositedPath.replace(/\.mp4$/, '-trimmed.mp4')

  const cutResult = buildCutConcatArgs(
    compositedPath,
    trimmedPath,
    opts.cutRegions,
    opts.transitions ?? [],
    fps,
    durationSeconds,
  )

  if (cutResult.trimFilterUsed) {
    await runFFmpegWithProgress(cutResult.args, durationSeconds, (pct) => {
      activeRenderSender?.send('racedash:renderProgress', {
        phase: 'Trimming',
        progress: 0.9 + pct * 0.1,  // 90-100% of total progress
      })
    })
    // Replace the composited file with the trimmed one
    await rename(trimmedPath, compositedPath)
  }
}
```

Import `rename` from `node:fs/promises` and export `runFFmpegWithProgress` from the compositor package.

- [ ] **Step 5: Commit**

```bash
git add packages/compositor/src/cuts.ts \
  packages/compositor/src/__tests__/cuts.test.ts \
  apps/desktop/src/main/ipc.ts
git commit -m "feat: compositor trim+concat for cut regions in export pipeline"
```

---

### Task 14: Segment ID Migration

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts` (project creation handler)
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx`

- [ ] **Step 1: Generate UUID for segments on project creation**

In the `createProject` IPC handler (in `ipc.ts`), when writing segments to `config.json`, generate an `id` for each segment if not present:

```ts
import { randomUUID } from 'node:crypto'

// When creating segments:
const segmentsWithIds = segments.map((seg) => ({
  ...seg,
  id: seg.id ?? randomUUID(),
}))
```

- [ ] **Step 2: Generate UUID in wizard segment setup**

In `SegmentSetupStep.tsx`, when a new segment is added, include `id: crypto.randomUUID()`.

- [ ] **Step 3: Migrate existing projects on load**

In the project loading path, if a segment has no `id`, generate one and save back:

```ts
// In project load handler:
let needsSave = false
for (const seg of project.segments) {
  if (!seg.id) {
    seg.id = randomUUID()
    needsSave = true
  }
}
if (needsSave) {
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf-8')
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc.ts \
  apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx
git commit -m "feat: add stable UUID to segments, migrate existing projects"
```

---

## Execution Order

Tasks 1-3 are foundational (types, pure functions, hooks) — no UI dependency.
Task 14 (segment IDs) should run early since boundaries depend on segment IDs.
Tasks 4-5 (layout, timeline tabs) are independent UI scaffolding.
Tasks 6-9 (visualization, drawer, DnD) build on 4-5.
Task 10 (project view scrubbing) needs hooks from 3.
Tasks 11-12 (persistence, export) need all prior.
Task 13 (compositor) can run in parallel with UI tasks.

Recommended order: **1 → 14 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13**

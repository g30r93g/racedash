# Multi-Render Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each checked Render Asset (Entire Project, segment, or lap) produces an independent render job with its own output file, executed sequentially as a batch.

**Architecture:** The engine gains a `renderBatch` function that precomputes shared data (join, timing, fps) once, then iterates jobs. Each job extracts a clip, builds isolated overlay props (with rebased timestamps snapped to frames), renders the overlay, and composites. The IPC layer adds batch channels with per-job progress. The UI shows a job queue with status, retry, and cancel.

**Tech Stack:** TypeScript, FFmpeg (clip extraction), Remotion (overlay rendering), Electron IPC

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/engine/src/batch.ts` | `renderBatch()` orchestrator, `rebaseSegment()`, clip time range computation |
| `packages/engine/src/__tests__/batch.test.ts` | Tests for rebaseSegment, clip range computation, job building |
| `packages/compositor/src/clip.ts` | `extractClip()` FFmpeg wrapper |
| `packages/compositor/src/__tests__/clip.test.ts` | Tests for extractClip arg generation |
| `apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx` | Job queue list UI component |

### Modified files

| Path | Change |
|---|---|
| `packages/engine/src/types.ts` | Add `BatchRenderOpts`, `RenderJobOpts`, `LapOverlayProps`, batch event types |
| `packages/engine/src/index.ts` | Export `renderBatch` and new types |
| `packages/compositor/src/index.ts` | Export `extractClip` |
| `apps/desktop/src/types/ipc.ts` | Add batch IPC types, replace single-render types |
| `apps/desktop/src/main/ipc.ts` | Add batch render IPC handler |
| `apps/desktop/src/preload/index.ts` | Add batch render bridges |
| `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Build job list, use batch IPC, show queue UI |
| `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx` | Replace single progress bar with job queue |

---

### Task 1: Batch Types & LapOverlayProps

**Files:**
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/core/src/index.ts` (add `LapOverlayProps`)

- [ ] **Step 1: Add batch types to engine**

In `packages/engine/src/types.ts`, add:

```ts
export type RenderJobType = 'entireProject' | 'segment' | 'linkedSegment' | 'lap'

export interface RenderJobOpts {
  id: string
  type: RenderJobType
  segmentIndices: number[]
  lapNumber?: number
  outputPath: string
}

export interface BatchRenderOpts {
  configPath: string
  videoPaths: string[]
  rendererEntry: string
  style: string
  outputResolution?: { width: number; height: number }
  outputFrameRate?: string
  jobs: RenderJobOpts[]
  cutRegions?: Array<{ id: string; startFrame: number; endFrame: number }>
  transitions?: Array<{ id: string; boundaryId: string; type: string; durationMs: number }>
}

export interface BatchJobProgressEvent {
  jobId: string
  phase: string
  progress: number
  renderedFrames?: number
  totalFrames?: number
}

export interface BatchJobResult {
  jobId: string
  outputPath: string
}
```

- [ ] **Step 2: Add LapOverlayProps to core**

In `packages/core/src/index.ts`, after the `OverlayProps` interface, add:

```ts
export interface LapOverlayProps extends OverlayProps {
  /** The target lap number. Timer is zeroed outside this lap's range. */
  targetLapNumber: number
  /** Frame where the target lap starts (relative to clip start). */
  targetLapStartFrame: number
  /** Frame where the target lap ends (relative to clip start). */
  targetLapEndFrame: number
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts packages/core/src/index.ts
git commit -m "feat: add batch render types and LapOverlayProps"
```

---

### Task 2: rebaseSegment + Clip Range Computation

**Files:**
- Create: `packages/engine/src/batch.ts`
- Create: `packages/engine/src/__tests__/batch.test.ts`

- [ ] **Step 1: Write failing tests for rebaseSegment**

```ts
// packages/engine/src/__tests__/batch.test.ts
import { describe, it, expect } from 'vitest'
import { rebaseSegment, computeClipRange } from '../batch'
import type { SessionSegment } from '@racedash/core'

describe('rebaseSegment', () => {
  const makeSegment = (ytSeconds: number[]): SessionSegment => ({
    mode: 'race',
    session: {
      driver: { kart: '1', name: 'Driver' },
      laps: ytSeconds.map((_, i) => ({ number: i + 1, lapTime: 30, cumulative: (i + 1) * 30 })),
      timestamps: ytSeconds.map((yt, i) => ({
        lap: { number: i + 1, lapTime: 30, cumulative: (i + 1) * 30 },
        ytSeconds: yt,
      })),
    },
    sessionAllLaps: [],
    leaderboardDrivers: [{
      kart: '1',
      name: 'Driver',
      timestamps: ytSeconds.map((yt, i) => ({
        lap: { number: i + 1, lapTime: 30, cumulative: (i + 1) * 30 },
        ytSeconds: yt,
      })),
    }],
    raceLapSnapshots: ytSeconds.map((yt) => ({
      videoTimestamp: yt,
      entries: [],
    })),
    positionOverrides: ytSeconds.map((yt) => ({
      timestamp: Math.round(yt * 60), // frames at 60fps
      position: 1,
    })),
  })

  it('rebases session timestamps by clipStartFrame', () => {
    const seg = makeSegment([100, 130, 160])
    const rebased = rebaseSegment(seg, 5400, 60) // clipStart = 90s = 5400 frames
    expect(rebased.session.timestamps[0].ytSeconds).toBeCloseTo(10, 5) // 100 - 90 = 10
    expect(rebased.session.timestamps[1].ytSeconds).toBeCloseTo(40, 5)
    expect(rebased.session.timestamps[2].ytSeconds).toBeCloseTo(70, 5)
  })

  it('rebases leaderboardDrivers timestamps', () => {
    const seg = makeSegment([100, 130])
    const rebased = rebaseSegment(seg, 5400, 60)
    expect(rebased.leaderboardDrivers![0].timestamps[0].ytSeconds).toBeCloseTo(10, 5)
  })

  it('rebases raceLapSnapshots videoTimestamp', () => {
    const seg = makeSegment([100, 130])
    const rebased = rebaseSegment(seg, 5400, 60)
    expect(rebased.raceLapSnapshots![0].videoTimestamp).toBeCloseTo(10, 5)
  })

  it('rebases positionOverrides (frame-based)', () => {
    const seg = makeSegment([100])
    const rebased = rebaseSegment(seg, 5400, 60)
    // Original: 100 * 60 = 6000 frames, rebased: 6000 - 5400 = 600
    expect(rebased.positionOverrides![0].timestamp).toBe(600)
  })

  it('snaps rebased values to nearest frame', () => {
    const seg = makeSegment([100.017]) // not frame-aligned at 60fps
    const rebased = rebaseSegment(seg, 5400, 60)
    const result = rebased.session.timestamps[0].ytSeconds
    // Should snap to nearest frame: Math.round(10.017 * 60) / 60 = 10.016666...
    expect(result * 60).toBeCloseTo(Math.round(10.017 * 60), 0)
  })

  it('does not modify cumulative lap times (segment-relative)', () => {
    const seg = makeSegment([100, 130])
    const rebased = rebaseSegment(seg, 5400, 60)
    expect(rebased.session.laps[0].cumulative).toBe(30)
    expect(rebased.session.laps[1].cumulative).toBe(60)
  })
})

describe('computeClipRange', () => {
  const PRE_ROLL = 5
  const POST_ROLL = 5

  it('computes segment clip range with 5s pre/post roll', () => {
    const range = computeClipRange('segment', 100, 200, 60, 300)
    // start = 100 - 5 = 95s = 5700 frames
    // end = 200 + 5 = 205s = 12300 frames
    expect(range.startFrame).toBe(5700)
    expect(range.endFrame).toBe(12300)
  })

  it('clamps start to 0', () => {
    const range = computeClipRange('segment', 2, 50, 60, 300)
    expect(range.startFrame).toBe(0) // 2 - 5 = -3, clamped to 0
  })

  it('clamps end to total frames', () => {
    const range = computeClipRange('segment', 290, 298, 60, 300)
    expect(range.endFrame).toBe(18000) // 300 * 60 = 18000
  })

  it('computes lap clip range', () => {
    const range = computeClipRange('lap', 150, 180, 60, 600)
    expect(range.startFrame).toBe(8700) // (150 - 5) * 60
    expect(range.endFrame).toBe(11100) // (180 + 5) * 60
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run src/__tests__/batch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement rebaseSegment and computeClipRange**

```ts
// packages/engine/src/batch.ts
import type { SessionSegment } from '@racedash/core'

const SUB_RENDER_PRE_ROLL_SECONDS = 5
const SUB_RENDER_POST_ROLL_SECONDS = 5

function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps
}

export function rebaseSegment(
  segment: SessionSegment,
  clipStartFrame: number,
  fps: number,
): SessionSegment {
  const clipStartSec = clipStartFrame / fps

  const rebaseTime = (ytSeconds: number): number =>
    snapToFrame(ytSeconds - clipStartSec, fps)

  return {
    ...segment,
    session: {
      ...segment.session,
      // laps.cumulative is segment-relative — not rebased
      laps: segment.session.laps,
      timestamps: segment.session.timestamps.map((t) => ({
        ...t,
        ytSeconds: rebaseTime(t.ytSeconds),
      })),
    },
    sessionAllLaps: segment.sessionAllLaps,
    leaderboardDrivers: segment.leaderboardDrivers?.map((d) => ({
      ...d,
      timestamps: d.timestamps.map((t) => ({
        ...t,
        ytSeconds: rebaseTime(t.ytSeconds),
      })),
    })),
    raceLapSnapshots: segment.raceLapSnapshots?.map((s) => ({
      ...s,
      videoTimestamp: rebaseTime(s.videoTimestamp),
    })),
    positionOverrides: segment.positionOverrides?.map((o) => ({
      ...o,
      timestamp: o.timestamp - clipStartFrame,
    })),
  }
}

export function computeClipRange(
  _type: 'segment' | 'lap',
  startSeconds: number,
  endSeconds: number,
  fps: number,
  totalDurationSeconds: number,
): { startFrame: number; endFrame: number } {
  const startSec = Math.max(0, startSeconds - SUB_RENDER_PRE_ROLL_SECONDS)
  const endSec = Math.min(totalDurationSeconds, endSeconds + SUB_RENDER_POST_ROLL_SECONDS)
  return {
    startFrame: Math.round(startSec * fps),
    endFrame: Math.round(endSec * fps),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run src/__tests__/batch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/batch.ts packages/engine/src/__tests__/batch.test.ts
git commit -m "feat: add rebaseSegment and computeClipRange with tests"
```

---

### Task 3: extractClip in Compositor

**Files:**
- Create: `packages/compositor/src/clip.ts`
- Create: `packages/compositor/src/__tests__/clip.test.ts`
- Modify: `packages/compositor/src/index.ts`

- [ ] **Step 1: Write failing tests for buildExtractClipArgs**

```ts
// packages/compositor/src/__tests__/clip.test.ts
import { describe, it, expect } from 'vitest'
import { buildExtractClipArgs } from '../clip'

describe('buildExtractClipArgs', () => {
  it('generates correct ffmpeg args for clip extraction', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 5700, 12300, 60)
    expect(args).toContain('-ss')
    expect(args).toContain('95') // 5700/60
    expect(args).toContain('-to')
    expect(args).toContain('205') // 12300/60
    expect(args).toContain('-c')
    expect(args).toContain('copy')
    expect(args).toContain('/in.mp4')
    expect(args).toContain('/out.mp4')
  })

  it('uses stream copy for fast extraction', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const copyIdx = args.indexOf('copy')
    expect(copyIdx).toBeGreaterThan(-1)
  })
})
```

- [ ] **Step 2: Implement extractClip**

```ts
// packages/compositor/src/clip.ts
import { spawn } from 'node:child_process'

export function buildExtractClipArgs(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
): string[] {
  const startSec = startFrame / fps
  const endSec = endFrame / fps
  return [
    '-ss', String(startSec),
    '-to', String(endSec),
    '-i', sourcePath,
    '-c', 'copy',
    '-y', outputPath,
  ]
}

export async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const args = buildExtractClipArgs(sourcePath, outputPath, startFrame, endFrame, fps)
  const totalSeconds = (endFrame - startFrame) / fps

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        onProgress?.(Math.max(0, Math.min(1, processed / totalSeconds)))
      }
    })
    proc.on('close', (code: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (signal) reject(new Error(`ffmpeg killed by signal ${signal}\n${stderr}`))
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      if (error.code === 'ENOENT') reject(new Error('ffmpeg was not found on PATH.'))
      else reject(error)
    })
  })
}
```

- [ ] **Step 3: Export from compositor index**

In `packages/compositor/src/index.ts`, add:
```ts
export { extractClip } from './clip'
```

- [ ] **Step 4: Run tests and commit**

```bash
cd packages/compositor && npx vitest run src/__tests__/clip.test.ts
git add packages/compositor/src/clip.ts packages/compositor/src/__tests__/clip.test.ts packages/compositor/src/index.ts
git commit -m "feat: add extractClip FFmpeg wrapper for sub-render clips"
```

---

### Task 4: renderBatch Orchestrator

**Files:**
- Modify: `packages/engine/src/batch.ts`
- Modify: `packages/engine/src/index.ts`

This is the largest task. `renderBatch` precomputes once, then iterates jobs.

- [ ] **Step 1: Add renderBatch function**

In `packages/engine/src/batch.ts`, add the full orchestrator. This function:

1. Joins videos (if multiple) — once
2. Probes fps/resolution/duration — once
3. Loads timing config, resolves segments — once
4. For each job:
   - `entireProject`: delegates to existing `renderSession` (unchanged)
   - `segment`/`linkedSegment`: extracts clip → builds isolated overlay props → renders overlay → composites
   - `lap`: extracts clip → builds `LapOverlayProps` → renders overlay → composites

The implementation follows the same patterns as `renderSession` in `operations.ts` but splits precompute from per-job work. Due to the size of this function, the code is in the spec — the implementer should reference `packages/engine/src/operations.ts:90-240` for the existing pipeline patterns and replicate them.

Key details:
- `renderSession` is called directly for `entireProject` jobs (no changes to existing pipeline)
- For segment/lap jobs, `rebaseSegment()` is called on the cloned target segment(s)
- `extractClip()` writes to a temp file, overlay renders on the clip, composite onto the clip
- Clip duration = `(endFrame - startFrame) / fps`, overlay `durationInFrames` = `endFrame - startFrame`
- For lap jobs, filter the segment's `session.laps` and `session.timestamps` to only the target lap before passing to overlay

- [ ] **Step 2: Export from engine index**

In `packages/engine/src/index.ts`, add:
```ts
export { renderBatch, rebaseSegment, computeClipRange } from './batch'
export type { BatchRenderOpts, RenderJobOpts, BatchJobProgressEvent, BatchJobResult } from './types'
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/batch.ts packages/engine/src/index.ts
git commit -m "feat: add renderBatch orchestrator for multi-render jobs"
```

---

### Task 5: IPC Batch Channels

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add batch IPC types**

In `apps/desktop/src/types/ipc.ts`, add the batch render types and update `RacedashAPI`:

```ts
export interface RenderBatchOpts {
  configPath: string
  videoPaths: string[]
  outputPath: string
  style: string
  outputResolution: OutputResolution
  outputFrameRate: OutputFrameRate
  renderMode: RenderMode
  jobs: Array<{
    id: string
    type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap'
    segmentIndices: number[]
    lapNumber?: number
    outputPath: string
  }>
  cutRegions: CutRegion[]
  transitions: Transition[]
}
```

Add to `RacedashAPI`:
```ts
startBatchRender(opts: RenderBatchOpts): Promise<void>
cancelBatchRender(): Promise<void>
retryBatchJobs(jobIds: string[]): Promise<void>
onBatchJobProgress(cb: (event: { jobId: string; phase: string; progress: number }) => void): () => void
onBatchJobComplete(cb: (event: { jobId: string; outputPath: string }) => void): () => void
onBatchJobError(cb: (event: { jobId: string; message: string }) => void): () => void
onBatchComplete(cb: (event: { completed: number; errored: number; skipped: number }) => void): () => void
```

- [ ] **Step 2: Add IPC handlers in main process**

In `apps/desktop/src/main/ipc.ts`, add handlers that call `renderBatch` from the engine. The handler:
- Receives `RenderBatchOpts`
- Maps to `BatchRenderOpts` (resolving output resolution, renderer entry path)
- Calls `renderBatch()` with callbacks that `send` events to the renderer
- Tracks cancellation via a ref

- [ ] **Step 3: Add preload bridges**

In `apps/desktop/src/preload/index.ts`, add the IPC bridges following the existing pattern for `startRender`/`onRenderProgress`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/types/ipc.ts apps/desktop/src/main/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add batch render IPC channels"
```

---

### Task 6: Job Queue UI Component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx`

- [ ] **Step 1: Create RenderJobQueue component**

A list of render jobs showing status, progress, and retry buttons. Props:

```tsx
interface RenderJobQueueProps {
  jobs: RenderJob[]
  onRetry: (jobId: string) => void
  onRetryAll: () => void
  onCancel: () => void
  batchActive: boolean
}
```

Each row shows:
- Status icon (✓ completed, ● rendering with progress, ○ queued, ✕ error, − skipped)
- Job label
- Progress percentage (when rendering)
- Phase text (when rendering)
- Retry button (for errored/skipped jobs)

Bottom: Cancel button (during batch), Retry All (after batch with errors), Show in Finder (after all complete).

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx
git commit -m "feat: add RenderJobQueue UI component"
```

---

### Task 7: Wire ExportTab to Batch Render

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`
- Modify: `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx`

- [ ] **Step 1: Build job list from RenderAssetsSelection**

In ExportTab, add a function that converts the selection into `RenderJob[]`:

```ts
function buildJobList(
  selection: RenderAssetsSelection,
  segments: SegmentInfo[],
  outputDir: string,
): RenderJob[]
```

Logic:
- If `entireProject` → add one job
- For each segment in `selection.segments` → check if linked with adjacent → `linkedSegment` or `segment` job
- For each lap in `selection.laps` → `lap` job
- Generate output paths using slugified labels + `HHMMSS` timestamp

- [ ] **Step 2: Replace single render with batch**

Replace `handleRender()` to:
1. Build job list
2. Set job queue state
3. Call `window.racedash.startBatchRender(opts)`
4. Listen to batch events to update job statuses

- [ ] **Step 3: Replace LocalRenderControls progress bar with RenderJobQueue**

Pass the job queue state to `RenderJobQueue` instead of the single progress bar.

- [ ] **Step 4: Add retry handlers**

Wire `onRetry` and `onRetryAll` to call `window.racedash.retryBatchJobs(jobIds)`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx \
  apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx
git commit -m "feat: wire ExportTab to batch render with job queue UI"
```

---

### Task 8: Filename Slugification Utility

**Files:**
- Create: `apps/desktop/src/renderer/src/utils/slugify.ts`
- Create: `apps/desktop/src/renderer/src/utils/__tests__/slugify.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { slugify, buildOutputPath } from '../slugify'

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Race 1')).toBe('race-1')
  })
  it('removes special characters', () => {
    expect(slugify('Practice/Qualifying')).toBe('practice-qualifying')
  })
  it('trims leading/trailing hyphens', () => {
    expect(slugify('--test--')).toBe('test')
  })
})

describe('buildOutputPath', () => {
  it('builds entire project path', () => {
    const result = buildOutputPath('/dir', 'entireProject', undefined, undefined, '143022')
    expect(result).toBe('/dir/output-143022.mp4')
  })
  it('builds segment path', () => {
    const result = buildOutputPath('/dir', 'segment', 'Race 1', undefined, '143022')
    expect(result).toBe('/dir/output-race-1-143022.mp4')
  })
  it('builds lap path', () => {
    const result = buildOutputPath('/dir', 'lap', 'Race 1', 3, '143022')
    expect(result).toBe('/dir/output-race-1-lap3-143022.mp4')
  })
  it('builds linked segment path', () => {
    const result = buildOutputPath('/dir', 'linkedSegment', 'Qualifying-Race 1', undefined, '143022')
    expect(result).toBe('/dir/output-qualifying-race-1-143022.mp4')
  })
})
```

- [ ] **Step 2: Implement**

```ts
// apps/desktop/src/renderer/src/utils/slugify.ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildOutputPath(
  dir: string,
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap',
  label?: string,
  lapNumber?: number,
  timestamp?: string,
): string {
  const ts = timestamp ?? new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  if (type === 'entireProject') return `${dir}/output-${ts}.mp4`
  const slug = slugify(label ?? 'unknown')
  if (type === 'lap') return `${dir}/output-${slug}-lap${lapNumber}-${ts}.mp4`
  return `${dir}/output-${slug}-${ts}.mp4`
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/desktop && npx vitest run src/renderer/src/utils/__tests__/slugify.test.ts
git add apps/desktop/src/renderer/src/utils/slugify.ts apps/desktop/src/renderer/src/utils/__tests__/slugify.test.ts
git commit -m "feat: add slugify and buildOutputPath utilities"
```

---

## Execution Order

Tasks 1-3 are foundational (types, pure functions, compositor util) — no dependencies between them.
Task 4 (renderBatch) depends on Tasks 1-3.
Task 5 (IPC) depends on Task 4.
Tasks 6 and 8 are independent UI/utility work.
Task 7 (wire ExportTab) depends on Tasks 5, 6, and 8.

Recommended order: **1 → 2 → 3 → 8 → 4 → 5 → 6 → 7**

Tasks 1, 2, 3, 8 can run in parallel.

# Multi-Render Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each checked Render Asset (Entire Project, segment, or lap) produces an independent render job with its own output file, executed sequentially as a batch.

**Architecture:** The engine gains a `renderBatch` function that precomputes shared data (timing, video file map) once, then each job determines the minimal source files needed, extracts a clip (with I-frame alignment), rebases overlay timestamps to the actual clip start, renders the overlay, and composites. The old `renderSession` is deprecated — all renders go through `renderBatch`. Cancellation uses `AbortSignal`. The Remotion renderer gains a `useLapGate` hook for lap-specific overlay isolation.

**Tech Stack:** TypeScript, FFmpeg (clip extraction via `-c copy`), Remotion (overlay rendering), Electron IPC, AbortController

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/engine/src/batch.ts` | `renderBatch()`, `rebaseSegment()`, `computeClipRange()`, `resolveSourceFiles()`, `PrecomputedContext` |
| `packages/engine/src/__tests__/batch.test.ts` | Tests for rebaseSegment, clip range, source file resolution |
| `packages/compositor/src/clip.ts` | `extractClip()` with I-frame probing, `probeActualStartFrame()` |
| `packages/compositor/src/__tests__/clip.test.ts` | Tests for extractClip arg generation |
| `apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx` | Job queue list UI |
| `apps/desktop/src/renderer/src/utils/slugify.ts` | `slugify()`, `buildOutputPath()` |
| `apps/desktop/src/renderer/src/utils/__tests__/slugify.test.ts` | Tests for slugify + output paths |
| `apps/renderer/src/hooks/useLapGate.ts` | Lap-gating hook for Remotion compositions |

### Modified files

| Path | Change |
|---|---|
| `packages/engine/src/types.ts` | Add `BatchRenderOpts`, `RenderJobOpts`, `PrecomputedContext`, batch event types |
| `packages/engine/src/index.ts` | Export `renderBatch` and new types, remove `renderSession` export |
| `packages/engine/src/operations.ts` | Deprecate `renderSession`, extract shared precompute logic |
| `packages/core/src/index.ts` | Add `LapOverlayProps` |
| `packages/compositor/src/index.ts` | Export `extractClip`, `probeActualStartFrame` |
| `packages/compositor/src/cuts.ts` | Add `AbortSignal` support to `trimVideo` |
| `apps/desktop/src/types/ipc.ts` | Add batch IPC types, deprecate single-render types |
| `apps/desktop/src/main/ipc.ts` | Add batch render IPC handler with AbortController |
| `apps/desktop/src/preload/index.ts` | Add batch render bridges |
| `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Build job list, use batch IPC |
| `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx` | Show job queue instead of single progress bar |
| `apps/renderer/src/useCardOverlayState.ts` | Integrate `useLapGate` |
| `apps/renderer/src/components/shared/LapTimer.tsx` | Respond to `targetLapNumber` |

---

### Task 1: Batch Types, LapOverlayProps, PrecomputedContext

**Files:**
- Modify: `packages/engine/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add batch types to engine**

In `packages/engine/src/types.ts`, add after `RenderResult`:

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
  renderMode?: 'overlay+footage' | 'overlay-only'
  jobs: RenderJobOpts[]
  cutRegions?: Array<{ id: string; startFrame: number; endFrame: number }>
  transitions?: Array<{ id: string; boundaryId: string; type: string; durationMs: number }>
}

export interface PrecomputedContext {
  files: Array<{
    path: string
    startFrame: number
    endFrame: number
    durationSeconds: number
  }>
  fps: number
  totalDurationSeconds: number
  totalFrames: number
  videoResolution: { width: number; height: number }
  outputResolution: { width: number; height: number }
  segments: import('@racedash/core').SessionSegment[]
  startingGridPosition?: number
  styling: import('@racedash/core').OverlayStyling
  overlayComponents: import('@racedash/core').OverlayComponentsConfig
  overlayY: number
  boxPosition: import('@racedash/core').BoxPosition
  qualifyingTablePosition?: import('@racedash/core').CornerPosition
  rendererEntry: string
  style: string
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

In `packages/core/src/index.ts`, after the `OverlayProps` interface:

```ts
export interface LapOverlayProps extends OverlayProps {
  targetLapNumber: number
  targetLapStartFrame: number
  targetLapEndFrame: number
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts packages/core/src/index.ts
git commit -m "feat: add batch render types, PrecomputedContext, and LapOverlayProps"
```

---

### Task 2: rebaseSegment, computeClipRange, resolveSourceFiles

**Files:**
- Create: `packages/engine/src/batch.ts`
- Create: `packages/engine/src/__tests__/batch.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for:
- `rebaseSegment`: rebases `session.timestamps`, `leaderboardDrivers.timestamps`, `raceLapSnapshots.videoTimestamp`, `positionOverrides.timestamp`. Snaps to nearest frame. Does NOT rebase `session.laps.cumulative`.
- `computeClipRange`: adds 5s pre/post-roll, clamps to 0 and total frames.
- `resolveSourceFiles`: given a file frame map and a required frame range, returns the minimal set of files needed.

See spec for exact rebase fields and snapping logic.

- [ ] **Step 2: Implement**

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
  actualClipStartFrame: number,
  fps: number,
): SessionSegment {
  const clipStartSec = actualClipStartFrame / fps
  const rebaseTime = (yt: number) => snapToFrame(yt - clipStartSec, fps)

  return {
    ...segment,
    session: {
      ...segment.session,
      laps: segment.session.laps, // cumulative is segment-relative, not rebased
      timestamps: segment.session.timestamps.map((t) => ({
        ...t,
        ytSeconds: rebaseTime(t.ytSeconds),
      })),
    },
    sessionAllLaps: segment.sessionAllLaps,
    leaderboardDrivers: segment.leaderboardDrivers?.map((d) => ({
      ...d,
      timestamps: d.timestamps.map((t) => ({ ...t, ytSeconds: rebaseTime(t.ytSeconds) })),
    })),
    raceLapSnapshots: segment.raceLapSnapshots?.map((s) => ({
      ...s,
      videoTimestamp: rebaseTime(s.videoTimestamp),
    })),
    positionOverrides: segment.positionOverrides?.map((o) => ({
      ...o,
      timestamp: o.timestamp - actualClipStartFrame,
    })),
  }
}

export function computeClipRange(
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

export interface FileFrameRange {
  path: string
  startFrame: number
  endFrame: number
}

export function resolveSourceFiles(
  files: FileFrameRange[],
  requiredStartFrame: number,
  requiredEndFrame: number,
): FileFrameRange[] {
  return files.filter(
    (f) => f.startFrame < requiredEndFrame && f.endFrame > requiredStartFrame,
  )
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd packages/engine && npx vitest run src/__tests__/batch.test.ts
git add packages/engine/src/batch.ts packages/engine/src/__tests__/batch.test.ts
git commit -m "feat: add rebaseSegment, computeClipRange, resolveSourceFiles with tests"
```

---

### Task 3: extractClip with I-Frame Probing

**Files:**
- Create: `packages/compositor/src/clip.ts`
- Create: `packages/compositor/src/__tests__/clip.test.ts`
- Modify: `packages/compositor/src/index.ts`

- [ ] **Step 1: Write failing tests for buildExtractClipArgs**

Test that the function generates `-ss`, `-to`, `-c copy`, `-y` args with correct second values from frame inputs.

- [ ] **Step 2: Implement extractClip and probeActualStartFrame**

```ts
// packages/compositor/src/clip.ts
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function buildExtractClipArgs(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
): string[] {
  return [
    '-ss', String(startFrame / fps),
    '-to', String(endFrame / fps),
    '-i', sourcePath,
    '-c', 'copy',
    '-y', outputPath,
  ]
}

export async function probeActualStartFrame(filePath: string, fps: number): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'frame=pts_time',
    '-read_intervals', '%+#1', // read only first frame
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const pts = parseFloat(stdout.trim())
  if (isNaN(pts)) return 0
  return Math.round(pts * fps)
}

export async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<{ actualStartFrame: number }> {
  const args = buildExtractClipArgs(sourcePath, outputPath, startFrame, endFrame, fps)
  const totalSeconds = (endFrame - startFrame) / fps

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    const onAbort = () => {
      proc.kill('SIGTERM')
      if (!settled) { settled = true; reject(new Error('Cancelled')) }
    }
    signal.addEventListener('abort', onAbort, { once: true })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        onProgress?.(Math.max(0, Math.min(1, processed / totalSeconds)))
      }
    })
    proc.on('close', (code, sig) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (sig) reject(new Error(`ffmpeg killed by signal ${sig}\n${stderr}`))
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      reject(error.code === 'ENOENT' ? new Error('ffmpeg not found on PATH') : error)
    })
  })

  const actualStartFrame = await probeActualStartFrame(outputPath, fps)
  return { actualStartFrame }
}
```

- [ ] **Step 3: Export from compositor index and commit**

```bash
git add packages/compositor/src/clip.ts packages/compositor/src/__tests__/clip.test.ts packages/compositor/src/index.ts
git commit -m "feat: add extractClip with I-frame probing and AbortSignal support"
```

---

### Task 4: Slugify & Output Path Utilities

**Files:**
- Create: `apps/desktop/src/renderer/src/utils/slugify.ts`
- Create: `apps/desktop/src/renderer/src/utils/__tests__/slugify.test.ts`

- [ ] **Step 1: Write tests for slugify and buildOutputPath**

Cover: spaces to hyphens, special chars removed, entire project path, segment path, lap path, linked segment path, overlay-only mode with `.mov` extension.

- [ ] **Step 2: Implement**

```ts
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function buildOutputPath(
  dir: string,
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap',
  label?: string,
  lapNumber?: number,
  timestamp?: string,
  overlayOnly?: boolean,
): string {
  const ts = timestamp ?? new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const ext = overlayOnly ? '.mov' : '.mp4'
  const overlaySuffix = overlayOnly ? '-overlay' : ''
  if (type === 'entireProject') return `${dir}/output${overlaySuffix}-${ts}${ext}`
  const slug = slugify(label ?? 'unknown')
  if (type === 'lap') return `${dir}/output-${slug}-lap${lapNumber}${overlaySuffix}-${ts}${ext}`
  return `${dir}/output-${slug}${overlaySuffix}-${ts}${ext}`
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/desktop && npx vitest run src/renderer/src/utils/__tests__/slugify.test.ts
git add apps/desktop/src/renderer/src/utils/slugify.ts apps/desktop/src/renderer/src/utils/__tests__/slugify.test.ts
git commit -m "feat: add slugify and buildOutputPath utilities"
```

---

### Task 5: renderBatch Orchestrator

**Files:**
- Modify: `packages/engine/src/batch.ts`
- Modify: `packages/engine/src/operations.ts`
- Modify: `packages/engine/src/index.ts`

This is the largest task. The implementer should read `operations.ts:90-240` for the existing pipeline patterns.

- [ ] **Step 1: Extract precompute logic from renderSession into a shared function**

Create `buildPrecomputedContext(opts)` that does: probe files, resolve timing, build segments, compute overlay position. This absorbs lines 95-170 of `renderSession`.

- [ ] **Step 2: Implement renderBatch**

`renderBatch` calls `buildPrecomputedContext` once, then iterates jobs:
- **entireProject**: reuses the full pipeline logic (join → overlay → composite → trim with cuts/transitions)
- **segment/linkedSegment**: resolveSourceFiles → join if needed → extractClip → rebaseSegment → renderOverlay → composite
- **lap**: same as segment but filters segment data to target lap, builds `LapOverlayProps`

Each stage checks `signal.aborted` before proceeding.

- [ ] **Step 3: Deprecate renderSession**

Mark `renderSession` as deprecated. Optionally keep it as a thin wrapper that calls `renderBatch` with a single `entireProject` job, or remove entirely and update all callers.

- [ ] **Step 4: Export from engine index and commit**

```bash
git add packages/engine/src/batch.ts packages/engine/src/operations.ts packages/engine/src/index.ts
git commit -m "feat: add renderBatch orchestrator, deprecate renderSession"
```

---

### Task 6: Renderer Lap-Gating Hook

**Files:**
- Create: `apps/renderer/src/hooks/useLapGate.ts`
- Modify: `apps/renderer/src/useCardOverlayState.ts`
- Modify: `apps/renderer/src/components/shared/LapTimer.tsx`

- [ ] **Step 1: Create useLapGate hook**

```ts
// apps/renderer/src/hooks/useLapGate.ts
import { useCurrentFrame } from 'remotion'
import type { LapOverlayProps } from '@racedash/core'

interface LapGate {
  isLapRender: boolean
  isActive: boolean       // true only during the target lap's frame range
  targetLapNumber: number | null
}

export function useLapGate(props: Record<string, unknown>): LapGate {
  const frame = useCurrentFrame()
  const lapProps = props as Partial<LapOverlayProps>

  if (lapProps.targetLapNumber == null) {
    return { isLapRender: false, isActive: true, targetLapNumber: null }
  }

  const active = frame >= lapProps.targetLapStartFrame! && frame <= lapProps.targetLapEndFrame!
  return {
    isLapRender: true,
    isActive: active,
    targetLapNumber: lapProps.targetLapNumber,
  }
}
```

- [ ] **Step 2: Integrate into overlay state and components**

In `useCardOverlayState.ts`: if `lapGate.isLapRender && !lapGate.isActive`, return inactive state (timer shows zero, position hidden).

In `LapTimer.tsx`: when `lapGate.isLapRender`, show `0:00.000` when not active, freeze at final value after target lap ends.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/hooks/useLapGate.ts apps/renderer/src/useCardOverlayState.ts apps/renderer/src/components/shared/LapTimer.tsx
git commit -m "feat: add useLapGate hook for lap-specific overlay rendering"
```

---

### Task 7: IPC Batch Channels

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add batch IPC types**

Add `RenderBatchOpts` and batch event types to `ipc.ts`. Add `startBatchRender`, `cancelBatchRender`, `retryBatchJobs` and batch event listeners to `RacedashAPI`.

- [ ] **Step 2: Add IPC handlers**

In `ipc.ts`, add `racedash:renderBatch:start` handler that:
1. Creates an `AbortController`
2. Maps `RenderBatchOpts` to `BatchRenderOpts`
3. Calls `renderBatch()` with callbacks that send events via `webContents.send`
4. Stores the controller for cancel/retry

Add `racedash:renderBatch:cancel` that calls `controller.abort()`.
Add `racedash:renderBatch:retry` that re-queues specified job IDs.

- [ ] **Step 3: Add preload bridges and commit**

```bash
git add apps/desktop/src/types/ipc.ts apps/desktop/src/main/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add batch render IPC channels with AbortSignal"
```

---

### Task 8: Job Queue UI Component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx`

- [ ] **Step 1: Create component**

Shows job list with status icons (✓/●/○/✕/−), labels, progress, phase, retry buttons. Bottom bar with Cancel (during batch) and Retry All (after batch with errors).

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx
git commit -m "feat: add RenderJobQueue UI component"
```

---

### Task 9: Wire ExportTab to Batch Render

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`
- Modify: `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx`

- [ ] **Step 1: Add buildJobList function**

Converts `RenderAssetsSelection` + segment infos into `RenderJob[]`, generating output paths via `buildOutputPath`.

- [ ] **Step 2: Replace handleRender with batch render**

Build job list → set queue state → call `startBatchRender` → listen to batch events → update job statuses.

- [ ] **Step 3: Replace single progress bar with RenderJobQueue**

Pass job queue state to `RenderJobQueue`. Wire retry/cancel handlers.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx \
  apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx
git commit -m "feat: wire ExportTab to batch render with job queue UI"
```

---

## Execution Order

```
Task 1 (types)  ─┐
Task 2 (engine)  ├─→ Task 5 (renderBatch) ─→ Task 7 (IPC) ─→ Task 9 (wire ExportTab)
Task 3 (clip)   ─┤
Task 4 (slugify) ─┘
Task 6 (renderer lap gate) — independent, can run anytime after Task 1
Task 8 (job queue UI) — independent, can run anytime before Task 9
```

Tasks 1-4 can run in parallel. Task 6 and 8 can run in parallel with 5-7.

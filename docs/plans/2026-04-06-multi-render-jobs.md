# Multi-Render Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each checked Render Asset (Entire Project, segment, or lap) produces an independent render job with its own output file, executed sequentially as a batch.

**Architecture:** The engine gains a `renderBatch` function that precomputes shared data (timing, video file map) once, then each job determines the minimal source files needed, extracts a clip (with I-frame alignment + `-copyts`), rebases overlay timestamps to the actual clip start, renders the overlay, and composites. `renderSession` is removed — all renders go through `renderBatch`. Cancellation uses `AbortSignal` plumbed through every compositor function. The Remotion renderer gains a `useLapGate` hook integrated into every overlay style.

**Tech Stack:** TypeScript, FFmpeg (clip extraction via `-c copy -copyts`), Remotion (overlay rendering), Electron IPC, AbortController

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/engine/src/batch.ts` | `renderBatch()`, `rebaseSegment()`, `computeClipRange()`, `resolveSourceFiles()`, `buildPrecomputedContext()` |
| `packages/engine/src/__tests__/batch.test.ts` | Tests for rebaseSegment, clip range, source file resolution, orchestration edge cases |
| `packages/compositor/src/clip.ts` | `extractClip()` with `-copyts` and I-frame probing, `probeActualStartSeconds()` |
| `packages/compositor/src/__tests__/clip.test.ts` | Tests for extractClip arg generation |
| `apps/desktop/src/renderer/src/components/export/RenderJobQueue.tsx` | Job queue list UI |
| `apps/renderer/src/hooks/useLapGate.ts` | Lap-gating hook for Remotion compositions |

### Modified files

| Path | Change |
|---|---|
| `packages/engine/src/types.ts` | Add `BatchRenderOpts`, `RenderJobOpts`, batch event types. Remove `selectedSegments`/`selectedLaps` from `RenderOptions`. |
| `packages/engine/src/index.ts` | Export `renderBatch` and new types, remove `renderSession` export |
| `packages/engine/src/operations.ts` | Remove `renderSession`, extract precompute logic into `buildPrecomputedContext` |
| `packages/core/src/index.ts` | Add `LapOverlayProps` |
| `packages/compositor/src/index.ts` | Add `signal: AbortSignal` to `compositeVideo`, `renderOverlay`, `joinVideos`. Export `extractClip`. |
| `packages/compositor/src/cuts.ts` | Add `signal: AbortSignal` to `trimVideo` |
| `apps/desktop/src/types/ipc.ts` | Replace single-render types with batch IPC types |
| `apps/desktop/src/main/ipc.ts` | Replace single-render handler with batch handler + AbortController |
| `apps/desktop/src/main/__tests__/ipc.register.test.ts` | Update to assert new batch channels instead of old single-render channels |
| `apps/desktop/src/preload/index.ts` | Replace single-render bridges with batch bridges |
| `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx` | Build job list from selections (entireProject independent, linkedPairs parsed), use batch IPC |
| `apps/desktop/src/renderer/src/components/export/RenderAssets.tsx` | Update `RenderAssetsSelection` comment: entireProject does NOT suppress selections |
| `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx` | Show job queue instead of single progress bar |
| `apps/renderer/src/useCardOverlayState.ts` | Integrate `useLapGate` |
| `apps/renderer/src/components/banners/LapTimerTrap.tsx` | Integrate `useLapGate` for banner + geometric-banner styles |
| `apps/renderer/src/styles/modern/index.tsx` | Integrate `useLapGate` |
| `apps/renderer/src/styles/minimal/index.tsx` | Integrate `useLapGate` |
| `apps/renderer/src/styles/esports/index.tsx` | Integrate `useLapGate` |

---

### Task 1: Batch Types, LapOverlayProps

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
  renderMode?: 'overlay+footage' | 'overlay-only'
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

Also remove `selectedSegments` and `selectedLaps` from `RenderOptions`.

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
git commit -m "feat: add batch render types and LapOverlayProps, remove selectedSegments/selectedLaps"
```

---

### Task 2: AbortSignal Support in Compositor

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Modify: `packages/compositor/src/cuts.ts`

- [ ] **Step 1: Add `signal: AbortSignal` parameter to compositor functions**

Add `signal: AbortSignal` as the last parameter to:
- `compositeVideo` in `packages/compositor/src/index.ts`
- `renderOverlay` in `packages/compositor/src/index.ts` — pass Remotion's `cancelSignal` to `renderMedia`
- `joinVideos` in `packages/compositor/src/index.ts`
- `trimVideo` in `packages/compositor/src/cuts.ts`

Each function:
1. Stores the `ChildProcess` ref from `spawn()`
2. Adds `signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true })`
3. Removes the listener on process close
4. For `renderOverlay`: passes `cancelSignal: signal` to Remotion's `renderMedia` options

- [ ] **Step 2: Update all callers to pass signal**

Existing callers in `packages/engine/src/operations.ts` must pass a signal. For now, create a never-aborting signal as a placeholder until `renderBatch` replaces them:

```ts
const neverAbort = new AbortController().signal
```

- [ ] **Step 3: Run existing tests to verify no regressions**

```bash
cd packages/compositor && pnpm test
cd packages/engine && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/compositor/src/index.ts packages/compositor/src/cuts.ts packages/engine/src/operations.ts
git commit -m "feat: add AbortSignal support to all compositor functions"
```

---

### Task 3: rebaseSegment, computeClipRange, resolveSourceFiles

**Files:**
- Create: `packages/engine/src/batch.ts`
- Create: `packages/engine/src/__tests__/batch.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for:
- `rebaseSegment`: rebases `session.timestamps.ytSeconds` (seconds), `leaderboardDrivers.timestamps.ytSeconds` (seconds), `raceLapSnapshots.videoTimestamp` (seconds), `positionOverrides.timestamp` (**seconds**, not frames). Snaps to nearest frame. Does NOT rebase `session.laps.cumulative`.
- `computeClipRange`: adds 5s pre/post-roll, clamps to 0 and total frames. Returns inclusive start, exclusive end.
- `resolveSourceFiles`: given a file frame map (inclusive start, exclusive end) and a required range, returns the minimal set of overlapping files.

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
  actualClipStartSeconds: number,
  fps: number,
): SessionSegment {
  const rebaseTime = (yt: number) => snapToFrame(yt - actualClipStartSeconds, fps)

  return {
    ...segment,
    session: {
      ...segment.session,
      laps: segment.session.laps,
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
      timestamp: snapToFrame(o.timestamp - actualClipStartSeconds, fps),
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
    startFrame: Math.round(startSec * fps),   // inclusive
    endFrame: Math.round(endSec * fps),        // exclusive
  }
}

export interface FileFrameRange {
  path: string
  startFrame: number  // inclusive
  endFrame: number    // exclusive
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
cd packages/engine && pnpm vitest run src/__tests__/batch.test.ts
git add packages/engine/src/batch.ts packages/engine/src/__tests__/batch.test.ts
git commit -m "feat: add rebaseSegment, computeClipRange, resolveSourceFiles with tests"
```

---

### Task 4: extractClip with `-copyts` and I-Frame Probing

**Files:**
- Create: `packages/compositor/src/clip.ts`
- Create: `packages/compositor/src/__tests__/clip.test.ts`
- Modify: `packages/compositor/src/index.ts`

- [ ] **Step 1: Write failing tests for buildExtractClipArgs**

Test that the function generates correct FFmpeg args:
- `-ss <startSec>` before `-i` (input seeking)
- `-t <duration>` (NOT `-to`, because `-ss` before `-i` makes `-to` relative)
- `-c copy -copyts -y`

```ts
it('uses -t duration, not -to absolute', () => {
  const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 5700, 12300, 60)
  expect(args).toContain('-t')
  expect(args).not.toContain('-to')
  const tIdx = args.indexOf('-t')
  expect(args[tIdx + 1]).toBe('110') // (12300 - 5700) / 60 = 110s duration
})

it('includes -copyts to preserve source PTS', () => {
  const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
  expect(args).toContain('-copyts')
})
```

- [ ] **Step 2: Implement extractClip and probeActualStartSeconds**

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
  const startSec = startFrame / fps
  const duration = (endFrame - startFrame) / fps
  return [
    '-ss', String(startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-c', 'copy',
    '-copyts',
    '-y', outputPath,
  ]
}

export async function probeActualStartSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'frame=pts_time',
    '-read_intervals', '%+#1',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const pts = parseFloat(stdout.trim())
  if (isNaN(pts)) {
    throw new Error(`Failed to probe start PTS from ${filePath}: ffprobe returned "${stdout.trim()}"`)
  }
  return pts
}

export async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<{ actualStartSeconds: number }> {
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

  const actualStartSeconds = await probeActualStartSeconds(outputPath)
  return { actualStartSeconds }
}
```

- [ ] **Step 3: Add audio fade-in for clean start**

Update `buildExtractClipArgs` to re-encode the first 0.5s of audio with a fade-in to avoid audio glitches at non-keyframe boundaries:

```ts
// Replace -c copy with selective codec handling:
'-c:v', 'copy',
'-c:a', 'aac',
'-af', 'afade=t=in:d=0.1',
```

This re-encodes only audio (minimal overhead) while keeping video as stream copy.

- [ ] **Step 4: Export from compositor index and commit**

```bash
git add packages/compositor/src/clip.ts packages/compositor/src/__tests__/clip.test.ts packages/compositor/src/index.ts
git commit -m "feat: add extractClip with -copyts, I-frame probing, audio fade-in"
```

---

### Task 5: Slugify & Output Path Utilities

**Files:**
- Create: `apps/desktop/src/main/utils/slugify.ts` (main process — has `node:path` and `node:fs`)
- Create: `apps/desktop/src/main/utils/__tests__/slugify.test.ts`

Note: these utilities run in the **main process** (not renderer) because they need `path.join()` for cross-platform paths and `fs.existsSync` for collision checks.

- [ ] **Step 1: Write tests**

Cover: spaces to hyphens, special chars removed, entire project path, segment path, lap path, linked segment path (two labels), overlay-only mode with `.mov` extension. Paths use `path.join`.

- [ ] **Step 2: Implement**

```ts
import path from 'node:path'

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function buildOutputPath(
  dir: string,
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap',
  options: {
    labels?: string[]
    lapNumber?: number
    timestamp?: string
    overlayOnly?: boolean
  } = {},
): string {
  const ts = options.timestamp ?? new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const ext = options.overlayOnly ? '.mov' : '.mp4'
  const overlaySuffix = options.overlayOnly ? '-overlay' : ''

  if (type === 'entireProject') {
    return path.join(dir, `output${overlaySuffix}-${ts}${ext}`)
  }

  const slug = (options.labels ?? []).map(slugify).join('-') || 'unknown'

  if (type === 'lap') {
    return path.join(dir, `output-${slug}-lap${options.lapNumber}${overlaySuffix}-${ts}${ext}`)
  }

  return path.join(dir, `output-${slug}${overlaySuffix}-${ts}${ext}`)
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd apps/desktop && pnpm vitest run src/main/utils/__tests__/slugify.test.ts
git add apps/desktop/src/main/utils/slugify.ts apps/desktop/src/main/utils/__tests__/slugify.test.ts
git commit -m "feat: add slugify and buildOutputPath with path.join for cross-platform"
```

---

### Task 6: renderBatch Orchestrator

**Files:**
- Modify: `packages/engine/src/batch.ts`
- Modify: `packages/engine/src/operations.ts`
- Modify: `packages/engine/src/index.ts`

This is the largest task. The implementer should read `operations.ts:90-240` for the existing pipeline patterns.

- [ ] **Step 1: Extract precompute logic from renderSession**

Create `buildPrecomputedContext(opts)` in `batch.ts`. This absorbs lines 95-170 of `renderSession`:
- Probe each source file for fps/resolution/duration
- Build file frame range map (inclusive start, exclusive end)
- Call `loadTimingConfig` to read config (this provides overlayY, boxPosition, qualifyingTablePosition, styling, overlayComponents — all config-sourced, not caller-provided)
- Resolve timing segments, build `SessionSegment[]`
- Ensure output directory exists (`mkdirSync(dir, { recursive: true })`)

Returns `PrecomputedContext`.

- [ ] **Step 2: Implement renderBatch**

`renderBatch` calls `buildPrecomputedContext` once, then iterates jobs:
- **entireProject**: absorbs existing `renderSession` logic (join → overlay → composite → trim with cuts/transitions). Passes `signal` to every compositor call.
- **segment/linkedSegment**:
  1. `resolveSourceFiles` → join if needed (passing `signal`) → `extractClip` with `-copyts`
  2. Probe `actualStartSeconds` (returned by `extractClip`)
  3. Clone + `rebaseSegment(seg, actualStartSeconds, fps)` for each target segment
  4. For linked segments: `segments: [rebasedSeg1, rebasedSeg2]` (no merge)
  5. Build `OverlayProps`, `durationInFrames` = clip frame count
  6. `renderOverlay` (passing `signal`) → `compositeVideo` (passing `signal`)
  7. For overlay-only mode: skip composite, keep overlay file as output
- **lap**: same as segment but also filters to target lap, builds `LapOverlayProps`

Each stage checks `signal.aborted` before proceeding.

- [ ] **Step 3: Remove renderSession**

Delete `renderSession` from `operations.ts`. Remove its export from `index.ts`. All callers (IPC handler, CLI) will be updated in subsequent tasks to use `renderBatch`.

- [ ] **Step 4: Export from engine index and commit**

```bash
git add packages/engine/src/batch.ts packages/engine/src/operations.ts packages/engine/src/index.ts
git commit -m "feat: add renderBatch orchestrator, remove renderSession"
```

---

### Task 7: Renderer Lap-Gating Hook + All Styles

**Files:**
- Create: `apps/renderer/src/hooks/useLapGate.ts`
- Modify: `apps/renderer/src/useCardOverlayState.ts`
- Modify: `apps/renderer/src/components/banners/LapTimerTrap.tsx`
- Modify: `apps/renderer/src/styles/modern/index.tsx`
- Modify: `apps/renderer/src/styles/minimal/index.tsx`
- Modify: `apps/renderer/src/styles/esports/index.tsx`

- [ ] **Step 1: Create useLapGate hook**

```ts
// apps/renderer/src/hooks/useLapGate.ts
import { useCurrentFrame } from 'remotion'
import type { LapOverlayProps, OverlayProps } from '@racedash/core'

interface LapGate {
  isLapRender: boolean
  isActive: boolean
  targetLapNumber: number | null
}

export function useLapGate(props: OverlayProps | LapOverlayProps): LapGate {
  const frame = useCurrentFrame()

  if (!('targetLapNumber' in props)) {
    return { isLapRender: false, isActive: true, targetLapNumber: null }
  }

  const lapProps = props as LapOverlayProps
  const active = frame >= lapProps.targetLapStartFrame && frame < lapProps.targetLapEndFrame
  return {
    isLapRender: true,
    isActive: active,
    targetLapNumber: lapProps.targetLapNumber,
  }
}
```

Note: `endFrame` is exclusive (consistent with frame range convention).

- [ ] **Step 2: Integrate into useCardOverlayState**

If `lapGate.isLapRender && !lapGate.isActive`, return inactive state (timer shows zero, position hidden).

- [ ] **Step 3: Integrate into LapTimerTrap** (banner + geometric-banner styles)

Call `useLapGate(props)` at the top. When `isLapRender && !isActive`, render zeroed timer. When `isLapRender` and frame is past `targetLapEndFrame`, freeze at final value.

- [ ] **Step 4: Integrate into modern style**

`apps/renderer/src/styles/modern/index.tsx` computes elapsed time inline. Wrap the computation: when `lapGate.isLapRender && !lapGate.isActive`, elapsed = 0.

- [ ] **Step 5: Integrate into minimal style**

Same pattern as modern.

- [ ] **Step 6: Integrate into esports style**

`apps/renderer/src/styles/esports/index.tsx` has its own timer path. Apply the same gate.

- [ ] **Step 7: Commit**

```bash
git add apps/renderer/src/hooks/useLapGate.ts \
  apps/renderer/src/useCardOverlayState.ts \
  apps/renderer/src/components/banners/LapTimerTrap.tsx \
  apps/renderer/src/styles/modern/index.tsx \
  apps/renderer/src/styles/minimal/index.tsx \
  apps/renderer/src/styles/esports/index.tsx
git commit -m "feat: add useLapGate hook integrated into all overlay styles"
```

---

### Task 8: IPC Batch Channels (Replace Old Channels)

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/__tests__/ipc.register.test.ts`

- [ ] **Step 1: Replace IPC types**

Remove old single-render types (`RenderStartEvent`, etc.) from `ipc.ts`. Add batch types:

```ts
interface RenderBatchOpts {
  configPath: string
  videoPaths: string[]
  outputDir: string
  style: string
  outputResolution: OutputResolution
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

Replace `startRender`/`cancelRender`/`onRenderProgress` with `startBatchRender`/`cancelBatchRender`/`retryBatchJobs`/`onBatchJobProgress`/`onBatchJobComplete`/`onBatchJobError`/`onBatchComplete` in `RacedashAPI`.

- [ ] **Step 2: Replace IPC handler**

Remove old `racedash:startRender` and `racedash:cancelRender` handlers. Add:
- `racedash:renderBatch:start` — creates `AbortController`, maps opts, calls `renderBatch()`, sends events via `webContents.send`
- `racedash:renderBatch:cancel` — calls `controller.abort()`
- `racedash:renderBatch:retry` — re-queues specified job IDs

- [ ] **Step 3: Replace preload bridges**

Remove old bridge functions. Add new ones following existing patterns.

- [ ] **Step 4: Update IPC registration tests**

Update `ipc.register.test.ts` to assert new batch channels instead of old single-render channels.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/types/ipc.ts apps/desktop/src/main/ipc.ts \
  apps/desktop/src/preload/index.ts apps/desktop/src/main/__tests__/ipc.register.test.ts
git commit -m "feat: replace single-render IPC with batch render channels"
```

---

### Task 9: Job Queue UI Component

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

### Task 10: Wire ExportTab to Batch Render

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`
- Modify: `apps/desktop/src/renderer/src/components/export/RenderAssets.tsx`
- Modify: `apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx`

- [ ] **Step 1: Update RenderAssetsSelection semantics**

In `RenderAssets.tsx`, update the `RenderAssetsSelection` interface comment: `entireProject` adds a job for the full project — it does NOT suppress segment/lap selections. Remove the `entireProject ? undefined : [...]` ternary from ExportTab.

- [ ] **Step 2: Add buildJobList function**

Converts `RenderAssetsSelection` + segment infos into `RenderJob[]`:
- `entireProject` checked → add one `entireProject` job
- For each checked segment: check if it has a linked pair in `linkedPairs` (parse `"min:max"` → `segmentIndices: [min, max]`). Produce `linkedSegment` or `segment` job. Pass both labels for linked segments.
- For each checked lap: produce `lap` job
- Generate output paths via `buildOutputPath` (called in main process via IPC, or precomputed)

- [ ] **Step 3: Replace handleRender with batch render**

Build job list → set queue state → call `startBatchRender` → listen to batch events → update job statuses.

- [ ] **Step 4: Replace single progress bar with RenderJobQueue**

Pass job queue state to `RenderJobQueue`. Wire retry/cancel handlers.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx \
  apps/desktop/src/renderer/src/components/export/RenderAssets.tsx \
  apps/desktop/src/renderer/src/components/export/LocalRenderControls.tsx
git commit -m "feat: wire ExportTab to batch render with job queue UI"
```

---

## Execution Order

```
Task 1 (types)  ─┐
Task 2 (abort)  ─┤
Task 3 (engine) ─├─→ Task 6 (renderBatch) ─→ Task 8 (IPC) ─→ Task 10 (wire ExportTab)
Task 4 (clip)   ─┤
Task 5 (slugify) ─┘
Task 7 (renderer lap gate) — independent, can run anytime after Task 1
Task 9 (job queue UI) — independent, can run anytime before Task 10
```

Tasks 1-5 can run in parallel. Tasks 7 and 9 can run in parallel with 6-8.

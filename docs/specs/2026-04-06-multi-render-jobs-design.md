# Multi-Render Jobs (Selective Segment & Lap Export)

**Date:** 2026-04-06
**Linear:** RD-280 (Selective Segment Export), RD-281 (Selective Lap Export)
**Branch:** `feat/video-editing-exporting`

## Problem

Users want to export individual segments or laps as standalone video clips alongside (or instead of) the full project render. The current pipeline produces a single output file. Users need multiple output files from a single render action — one per selected asset.

## Core Concept

Each checked item in Render Assets produces **one independent render job**. Jobs execute sequentially as a batch. The engine precomputes shared data once (timing resolution, video probing), then each job determines which source files it needs, extracts the relevant clip, renders its overlay, and composites.

### Job Types

| Type | Video source | Overlay | Output filename |
|---|---|---|---|
| **Entire Project** | All files joined, cut regions + transitions applied | All segments, all laps | `output-{timestamp}.mp4` |
| **Segment** | Only the source file(s) covering the segment's range + 5s buffer | Only that segment's data, all its laps | `output-{slug}-{timestamp}.mp4` |
| **Linked Segments** | Source file(s) covering the combined range + 5s buffer | Both segments' data (passed as 2-element array), all laps | `output-{slug1}-{slug2}-{timestamp}.mp4` |
| **Lap** | Only the source file(s) covering the lap's range + 5s buffer | Only that segment's data, only that lap | `output-{slug}-lap{N}-{timestamp}.mp4` |

### Smart Clip Selection

Each job determines the minimal set of source files it needs, avoiding an expensive join-all-files step for sub-renders:

1. The precomputed context maps each source file's global frame range: `file[0] = frames 0–36000, file[1] = frames 36001–72000, etc.`
2. For a segment/lap job, compute the required frame range (segment/lap + 5s pre/post-roll)
3. Find which source file(s) overlap that range (using inclusive start, exclusive end convention):
   - **One file**: extract directly from it (no join needed) — the common case for laps
   - **Two files**: join only those two files, then extract from the joined result
   - **Entire Project**: joins all files (existing behaviour)

This means a lap render on a 3-file project typically reads from one file, not all three.

### Pre-Roll / Post-Roll for Segment & Lap Renders

Fixed at **5 seconds** before and after the time range. Clamped to video boundaries (start ≥ 0, end ≤ video duration). This is independent of the component-derived pre/post-roll used for cut regions.

The 5s buffer ensures the video doesn't start/stop abruptly. Users can trim the output further if desired.

### Clip Extraction & I-Frame Alignment

Video clips are extracted using FFmpeg stream copy (`-c copy`) with `-copyts` for speed. Stream copy operates on the compressed bitstream and has one constraint:

- **Start**: must begin at a keyframe (I-frame). If the requested start frame is not an I-frame, FFmpeg rounds back to the preceding keyframe. This may add up to ~0.5-2s of extra pre-roll, which is invisible within the 5s buffer.
- **End**: can cut at any frame (P-frames at the end are fine since they depend only on preceding frames).

The `-copyts` flag preserves source-timeline PTS in the output container. After extraction, the actual clip start is probed (the real first frame's PTS from the output) and the overlay timestamps are rebased to this actual start — not the requested start. This ensures **the overlay is perfectly aligned with the video** despite the I-frame rounding.

```
Requested:  [------5s pre-roll------][===== segment =====][--5s post--]
Actual clip: [~0.5s extra][---5s pre-roll------][===== segment =====][--5s post--]
             ↑ I-frame                ↑ overlay starts here (rebased to actual clip start)
```

The user sees slightly more pre-roll than expected. The overlay is frame-accurate.

**FFmpeg argument ordering**: `-ss` is placed before `-i` (input-level seek for speed). Because this makes `-to` relative to the seek point, we use `-t` (duration) instead:

```
ffmpeg -ss <startSec> -i <source> -t <durationSec> -c copy -copyts -y <output>
```

### Audio at Clip Boundaries

Audio stream copy (`-c:a copy`) may produce a minor glitch at the clip start due to audio keyframe alignment differing from video keyframe alignment. To avoid audible artefacts, the first 0.5s of audio is re-encoded while the rest is stream-copied:

```
-c:a aac -af "afade=t=in:d=0.1" (for the first segment only)
```

This ensures a clean audio start with negligible re-encode overhead. The 5s pre-roll buffer means the fade is in dead content before the segment starts.

### Overlay Isolation

Each sub-render (segment or lap) must show **only** the data for that asset:

- **Segment render**: overlay shows all laps within that segment. No carry-over from adjacent segments. Fade-in at segment start, fade-out at segment end.
- **Linked segment render**: overlay shows all laps from both linked segments as one continuous overlay. Both segments passed as a 2-element `SessionSegment[]` array (not merged). Both are rebased to the same clip start. The gap between segments is preserved as real video content. Fade-in at first segment start, fade-out at last segment end.
- **Lap render**: overlay shows only that single lap. The timer is zeroed/hidden during pre-roll, starts at lap start, and stops at lap end. No data from previous or subsequent laps. Fade-in at lap start, fade-out at lap end.

The overlay receives a **single-element** `SessionSegment[]` array containing only the target segment (or 2-element array for linked pairs). Non-target segments are excluded entirely — they are not passed as empty objects (the renderer dereferences segment fields without null guards).

For lap renders, the target segment's data is further filtered to contain only the target lap's timing data.

### Overlay Props by Job Type

The overlay uses separate interfaces for different job types:

```ts
/** Standard overlay props — used for Entire Project and Segment renders. */
interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number
  fps: number
  durationInFrames: number
  // ...existing fields
}

/** Lap-specific overlay props — extends OverlayProps with lap isolation context. */
interface LapOverlayProps extends OverlayProps {
  /** The target lap number. Timer is zeroed outside this lap's range. */
  targetLapNumber: number
  /** Frame where the target lap starts (relative to clip start). */
  targetLapStartFrame: number
  /** Frame where the target lap ends (relative to clip start). */
  targetLapEndFrame: number
}
```

### Renderer Lap-Gating

Remotion compositions must react to `LapOverlayProps` to gate their output:

- A `useLapGate` hook reads typed `LapOverlayProps` fields from props (no unsafe cast — props are typed via the Remotion composition's `defaultProps`/`schema`)
- When present, it intercepts the frame-to-lap lookup and returns inactive state outside the target lap's frame range
- **Timer**: shows `0:00.000` during pre-roll, activates at `targetLapStartFrame`, freezes at final value after `targetLapEndFrame`
- **Position counter**: only updates during the target lap's frame range
- **Delta badge**: only shows during the target lap
- **Segment label**: shows during the target lap only

Components affected — **all** overlay styles must integrate lap-gating:
- `LapTimerTrap.tsx` — used by banner + geometric-banner styles
- `apps/renderer/src/styles/modern/index.tsx` — computes elapsed time inline
- `apps/renderer/src/styles/minimal/index.tsx` — computes elapsed time inline
- `apps/renderer/src/styles/esports/index.tsx` — uses its own timer path
- `useCardOverlayState.ts` — shared state hook

### Timestamp Rebasing

When rendering a clip, all temporal fields in the segment data must be rebased to the actual clip start (after I-frame probing via `-copyts`):

```ts
function rebaseSegment(segment: SessionSegment, actualClipStartSeconds: number, fps: number): SessionSegment
```

Fields rebased (all are in **seconds** unless noted):
- `session.timestamps[].ytSeconds` — subtract `actualClipStartSeconds`, snap to nearest frame
- `leaderboardDrivers[].timestamps[].ytSeconds` — same
- `raceLapSnapshots[].videoTimestamp` — subtract, snap
- `positionOverrides[].timestamp` — **also in seconds** (resolved from config by `resolveSegmentPositionOverrides`), subtract `actualClipStartSeconds`, snap

All rebased values are snapped to the nearest frame boundary: `Math.round(value * fps) / fps`.

`session.laps[].cumulative` is relative to segment start (not video start), so it does **not** need rebasing.

### Filename Convention

- Label is slugified: lowercase, spaces → hyphens, special characters removed.
- Timestamp appended: `HHMMSS` of when the render started (avoids collisions).
- Overlay-only mode: append `-overlay` suffix with overlay file extension (`.mov`/`.webm`).
- Paths constructed using `path.join()` for cross-platform safety.
- Examples:
  - `output-143022.mp4` (entire project)
  - `output-qualifying-143022.mp4` (segment)
  - `output-qualifying-race-1-143022.mp4` (linked segments)
  - `output-race-1-lap3-143022.mp4` (lap)
  - `output-qualifying-overlay-143022.mov` (overlay-only, segment)

All files written to the same directory as the configured output path (flat structure).

## Render Queue

### State Model

```ts
type RenderJobStatus = 'queued' | 'rendering' | 'completed' | 'error' | 'skipped'

interface RenderJob {
  id: string
  label: string
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap'
  segmentIndices: number[]
  lapNumber?: number
  outputPath: string
  status: RenderJobStatus
  progress: number
  phase: string
  error?: string
}
```

### Execution Flow

1. User clicks "Render" (local only for MVP).
2. ExportTab builds the job list from `RenderAssetsSelection`:
   - `entireProject` adds a job independently — it does **not** suppress segment/lap selections. Each checked item independently adds a job.
   - For each checked segment: if it has a linked pair in `linkedPairs`, parse the `"min:max"` key into `segmentIndices: [min, max]` and produce a `linkedSegment` job. Otherwise produce a `segment` job.
   - For each checked lap key: produce a `lap` job.
3. Jobs are queued with status `queued`.
4. IPC sends the full job list to the main process.
5. Engine's `renderBatch` precomputes shared data (resolve timing, probe fps/resolution, map file frame ranges).
6. Jobs execute sequentially:
   - Set status to `rendering`, report progress with `jobId`.
   - On completion: set status to `completed`.
   - On error: set status to `error`, **continue to next job**.
7. When all jobs complete, the batch is done.

### Cancellation & Retry

**Cancellation:**

Uses `AbortSignal` pattern throughout the entire pipeline:
- `renderBatch` receives an `AbortSignal` and passes it to every async operation
- **All** compositor functions accept `signal: AbortSignal`:
  - `extractClip` — kills FFmpeg child process on abort
  - `compositeVideo` — kills FFmpeg child process on abort
  - `renderOverlay` — passes Remotion's `cancelSignal` option to `renderMedia`
  - `trimVideo` — kills FFmpeg child process on abort
  - `joinVideos` — kills FFmpeg child process on abort
- Each function stores its `ChildProcess` ref and listens for `signal.abort` to call `proc.kill('SIGTERM')`
- IPC handler holds the `AbortController`; `cancelBatchRender` calls `controller.abort()`
- Current job gets `error` ("Cancelled by user"), remaining queued jobs get `skipped`

**Cancellation checkpoints** between pipeline stages:
- After clip extraction → check `signal.aborted`
- After overlay render → check, delete partial overlay file
- After composite → check, delete partial output

**Retry:**
- Each errored or skipped job shows a "Retry" button in the UI.
- "Retry All" button appears after batch with any errored/skipped jobs.
- Main process stores the `BatchRenderOpts` and job states. `retryBatchJobs(jobIds)` re-queues those specific jobs and calls `renderBatch` with only those jobs.

## Engine Architecture

### Removal of `renderSession`

The existing `renderSession` function is **removed**. All render invocations go through `renderBatch`, including single-render cases (which are a batch of one `entireProject` job). The old function's logic is absorbed into the batch orchestrator's `entireProject` job handler.

The `selectedSegments` and `selectedLaps` fields on `RenderOptions` are also removed — they were never used in the pipeline (the filtering was reverted). The batch job model replaces them entirely.

### `renderBatch` (new function)

The engine owns batch orchestration. This function is the single entry point for both local IPC and future cloud workers.

```ts
async function renderBatch(
  opts: BatchRenderOpts,
  onJobProgress: (jobId: string, event: RenderProgressEvent) => void,
  onJobComplete: (jobId: string, result: RenderResult) => void,
  onJobError: (jobId: string, error: Error) => void,
  signal: AbortSignal,
): Promise<void>
```

**Internal flow:**

1. **Precompute** (once):
   - Probe each source file: fps, resolution, duration, frame count
   - Build file frame range map: `[{ path, startFrame, endFrame, durationFrames }]` (startFrame inclusive, endFrame exclusive)
   - Resolve timing config (via `loadTimingConfig`), build `SessionSegment[]`, compute offsets
   - Read overlay positioning, styling, and component config from timing config (config-sourced, not caller-provided)
   - Ensure output directory exists (`mkdir -p`)

2. **Per job**:
   - Check `signal.aborted`
   - **Determine source files**: using the file frame range map, find which files overlap the job's required frame range
   - **Entire Project**: join all files → render overlay (full duration) → composite → trim with cuts/transitions
   - **Segment/Linked Segment**:
     1. Identify required source files (usually 1, at most 2)
     2. If 1 file: use directly. If 2+: join just those files → temp file
     3. Extract clip via `-c copy -copyts` (rounds start to preceding I-frame)
     4. Probe actual clip start (PTS of first frame, preserved by `-copyts`)
     5. Clone + rebase target segment(s) to actual clip start (in seconds)
     6. For linked segments: pass both rebased segments as `segments: [seg1, seg2]` (no merge)
     7. Build `OverlayProps`, `durationInFrames` = clip frame count
     8. Render overlay → composite
     9. For overlay-only mode: skip composite, output overlay file directly
   - **Lap**: same as Segment but also:
     1. Filter segment to only target lap's data (laps, timestamps)
     2. Build `LapOverlayProps` with `targetLapNumber`, `targetLapStartFrame`, `targetLapEndFrame`

3. **Cleanup**: delete any temp joined/clip files

### Precomputed Context

All overlay positioning fields are **config-sourced** — read from `loadTimingConfig()` during precompute. The caller (`BatchRenderOpts`) does not pass these; they come from the project's config file.

```ts
interface PrecomputedContext {
  files: Array<{
    path: string
    startFrame: number    // inclusive, global frame offset (0 for first file)
    endFrame: number      // exclusive
    durationSeconds: number
  }>
  fps: number
  totalDurationSeconds: number
  totalFrames: number
  videoResolution: { width: number; height: number }
  outputResolution: { width: number; height: number }
  segments: SessionSegment[]
  segmentConfigs: SegmentConfig[]   // needed by resolveSegmentPositionOverrides
  startingGridPosition?: number
  styling: OverlayStyling
  overlayComponents: OverlayComponentsConfig
  overlayY: number
  boxPosition: BoxPosition
  qualifyingTablePosition?: CornerPosition
  rendererEntry: string
  style: string
}
```

All jobs share this context. No job re-probes video or re-resolves timing.

### `BatchRenderOpts`

The caller provides only what cannot be derived from config:

```ts
interface BatchRenderOpts {
  configPath: string
  videoPaths: string[]
  rendererEntry: string
  style: string
  outputResolution?: { width: number; height: number }
  renderMode?: 'overlay+footage' | 'overlay-only'
  jobs: RenderJobOpts[]
  cutRegions?: CutRegion[]       // applied to entireProject only
  transitions?: Transition[]     // applied to entireProject only
}
```

Overlay positioning (`overlayX`, `overlayY`, `boxPosition`, `qualifyingTablePosition`, `labelWindowSeconds`) is read from config during precompute — not passed by the caller.

### Clip Extraction

```ts
async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<{ actualStartSeconds: number }>
```

1. Computes `startSec = startFrame / fps`, `duration = (endFrame - startFrame) / fps`
2. Runs FFmpeg: `-ss <startSec> -i <source> -t <duration> -c copy -copyts -y <output>`
3. Probes actual start PTS from the output (preserved by `-copyts`)
4. Returns `actualStartSeconds` — used by `rebaseSegment` for precise overlay alignment
5. Respects `AbortSignal` — kills FFmpeg process on abort

### Frame Range Conventions

All frame ranges use **inclusive start, exclusive end**:
- `startFrame`: first frame included
- `endFrame`: first frame NOT included
- Duration in frames = `endFrame - startFrame`

This matches the existing `CutRegion` convention used elsewhere in the codebase.

## IPC Changes

### Batch Channels

```
racedash:renderBatch:start       → start batch render
racedash:renderBatch:cancel      → cancel current batch
racedash:renderBatch:retry       → retry specific job IDs
racedash:renderBatch:progress    ← per-job progress (jobId, phase, progress)
racedash:renderBatch:jobComplete ← per-job completion (jobId, outputPath)
racedash:renderBatch:jobError    ← per-job error (jobId, message)
racedash:renderBatch:complete    ← batch complete (completedJobs, erroredJobs, skippedJobs)
```

The old single-render channels (`racedash:startRender`, `racedash:render-progress`, etc.) are **removed** entirely. All renders go through the batch channels (a single-render is a batch of one job). Existing IPC registration tests are updated to assert the new channels.

## UI Changes

### RenderAssetsSelection Semantics

Update the `RenderAssetsSelection` interface: `entireProject` adds a render job for the full project. It does **not** suppress or ignore segment/lap selections. Each checked item independently adds a job. Remove the old comment "segment/lap selections are ignored when entireProject is true".

### Export Tab — Job Queue

The "Local Render Controls" section shows a **job list** during and after rendering:

```
┌──────────────────────────────────────────────────┐
│ ✓ Entire Project          completed              │
│ ● Qualifying              rendering 45%  Overlay  │
│ ○ Race Lap 3              queued                  │
│ ✕ Race Lap 8              error    [Retry]        │
│ − Race Lap 12             skipped  [Retry]        │
└──────────────────────────────────────────────────┘
         [Cancel]              [Retry All]
```

- `✓` = completed
- `●` = rendering (with progress percentage and current phase)
- `○` = queued
- `✕` = error (with "Retry" button, error message on hover)
- `−` = skipped (with "Retry" button)

### Render Button Behavior

- "Render" button disabled when no assets are checked.
- During batch: button changes to "Cancel".
- After batch with errors/skipped: "Retry All" button appears.
- After batch fully complete: "Show in Finder" opens the output directory.

## Edge Cases

| Case | Behaviour |
|---|---|
| No assets checked | Render button disabled |
| Only "Entire Project" checked | Single render via batch of one job |
| Segment spans file boundary | Join only the overlapping files, extract from joined result |
| Segment extends beyond video | Clamp: startFrame = max(0, segStart − 5s × fps), endFrame = min(totalFrames, segEnd + 5s × fps) |
| Lap is first in segment | Pre-roll may extend before segment start — allowed (timer shows zero) |
| I-frame rounding adds extra pre-roll | Acceptable (< 2s within 5s buffer). Overlay rebased to actual clip start via `-copyts` + probe. |
| Single job fails | Job gets `error` status, remaining jobs continue |
| User cancels mid-batch | Current job's process killed via AbortSignal → `error`, remaining → `skipped`, completed retained |
| Filename collision | Render timestamp (HHMMSS) is the uniqueness key |
| Invalid lap key (doesn't exist) | Silently skip — don't queue a job |
| Overlay-only render mode | Uses `-overlay` suffix + overlay file extension |
| Output directory doesn't exist | Create it before first job (`mkdir -p`) |

## Cloud Rendering (Future)

Cloud rendering will use this same batch job flow via the engine's `renderBatch` interface. The engine is designed to be callable from both local IPC and a future cloud worker. However, cloud batch execution is **not implemented in this iteration** — cloud continues using the existing single-job flow until batch support is added.

## Out of Scope

- Cloud batch render execution (interface designed for it, implementation deferred)
- Parallel job execution (sequential only for MVP)
- Per-job render settings (resolution, frame rate) — all jobs use the same settings
- Preview of individual segment/lap clips in the editor
- Handling segments with no timing data (upstream responsibility — wizard prevents this)

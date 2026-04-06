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
| **Linked Segments** | Source file(s) covering the combined range + 5s buffer | Both segments' data, all laps | `output-{slug1}-{slug2}-{timestamp}.mp4` |
| **Lap** | Only the source file(s) covering the lap's range + 5s buffer | Only that segment's data, only that lap | `output-{slug}-lap{N}-{timestamp}.mp4` |

### Smart Clip Selection

Each job determines the minimal set of source files it needs, avoiding an expensive join-all-files step for sub-renders:

1. The precomputed context maps each source file's global frame range: `file[0] = frames 0-36000, file[1] = frames 36001-72000, etc.`
2. For a segment/lap job, compute the required frame range (segment/lap + 5s pre/post-roll)
3. Find which source file(s) overlap that range:
   - **One file**: extract directly from it (no join needed) — the common case for laps
   - **Two files**: join only those two files, then extract from the joined result
   - **Entire Project**: joins all files (existing behaviour)

This means a lap render on a 3-file project typically reads from one file, not all three.

### Pre-Roll / Post-Roll for Segment & Lap Renders

Fixed at **5 seconds** before and after the time range. Clamped to video boundaries (start ≥ 0, end ≤ video duration). This is independent of the component-derived pre/post-roll used for cut regions.

The 5s buffer ensures the video doesn't start/stop abruptly. Users can trim the output further if desired.

### Clip Extraction & I-Frame Alignment

Video clips are extracted using FFmpeg stream copy (`-c copy`) for speed. Stream copy operates on the compressed bitstream and has one constraint:

- **Start**: must begin at a keyframe (I-frame). If the requested start frame is not an I-frame, FFmpeg rounds back to the preceding keyframe. This may add up to ~0.5-2s of extra pre-roll, which is invisible within the 5s buffer.
- **End**: can cut at any frame (P-frames at the end are fine since they depend only on preceding frames).

After extraction, the actual clip start is probed (the real first frame's PTS) and the overlay timestamps are rebased to this actual start — not the requested start. This ensures **the overlay is perfectly aligned with the video** despite the I-frame rounding.

```
Requested:  [------5s pre-roll------][===== segment =====][--5s post--]
Actual clip: [~0.5s extra][---5s pre-roll------][===== segment =====][--5s post--]
             ↑ I-frame                ↑ overlay starts here (rebased to actual clip start)
```

The user sees slightly more pre-roll than expected. The overlay is frame-accurate.

### Overlay Isolation

Each sub-render (segment or lap) must show **only** the data for that asset:

- **Segment render**: overlay shows all laps within that segment. No carry-over from adjacent segments. Fade-in at segment start, fade-out at segment end.
- **Linked segment render**: overlay shows all laps from both linked segments as one continuous overlay. Fade-in at first segment start, fade-out at last segment end.
- **Lap render**: overlay shows only that single lap. The timer is zeroed/hidden during pre-roll, starts at lap start, and stops at lap end. No data from previous or subsequent laps. Fade-in at lap start, fade-out at lap end.

The overlay receives a **single-element** `SessionSegment[]` array containing only the target segment (or merged segments for linked pairs). Non-target segments are excluded entirely — they are not passed as empty objects (the renderer dereferences segment fields without null guards).

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

- A `useLapGate` hook checks if `targetLapNumber` exists in props
- When present, it intercepts the frame-to-lap lookup and returns inactive state outside the target lap's frame range
- **Timer**: shows `0:00.000` during pre-roll, activates at `targetLapStartFrame`, freezes at final value after `targetLapEndFrame`
- **Position counter**: only updates during the target lap's frame range
- **Delta badge**: only shows during the target lap
- **Segment label**: shows during the target lap only

Components affected: `LapTimer`, `PositionCounter`, `DeltaBadge`, `useCardOverlayState`, and any component that reads per-lap data.

### Timestamp Rebasing

When rendering a clip, all temporal fields in the segment data must be rebased to the actual clip start frame (after I-frame probing):

```ts
function rebaseSegment(segment: SessionSegment, actualClipStartFrame: number, fps: number): SessionSegment
```

Fields rebased:
- `session.timestamps[].ytSeconds` — subtract `actualClipStartFrame / fps`, snap to nearest frame
- `leaderboardDrivers[].timestamps[].ytSeconds` — same
- `raceLapSnapshots[].videoTimestamp` — subtract, snap
- `positionOverrides[].timestamp` — subtract `actualClipStartFrame` (already in frames)

All rebased values are snapped to the nearest frame boundary: `Math.round(value * fps) / fps`.

`session.laps[].cumulative` is relative to segment start (not video start), so it does **not** need rebasing.

### Filename Convention

- Label is slugified: lowercase, spaces → hyphens, special characters removed.
- Timestamp appended: `HHMMSS` of when the render started (avoids collisions).
- Overlay-only mode: append `-overlay` suffix with overlay file extension (`.mov`/`.webm`).
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
2. ExportTab builds the job list from `RenderAssetsSelection`.
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

Uses `AbortSignal` pattern:
- `renderBatch` creates an `AbortController`, passes `signal` to every async operation
- `extractClip`, `compositeVideo`, `trimVideo`, `renderOverlay` each check `signal.aborted` before starting and kill their FFmpeg/Remotion process if the signal fires mid-operation
- For FFmpeg: store `ChildProcess` ref, call `proc.kill('SIGTERM')` on abort
- For Remotion: use `cancelSignal` option in `renderMedia`
- IPC handler holds the `AbortController`; `cancelBatchRender` calls `controller.abort()`
- Current job gets `error` ("Cancelled by user"), remaining queued jobs get `skipped`

**Retry:**
- Each errored or skipped job shows a "Retry" button in the UI.
- "Retry All" button appears after batch with any errored/skipped jobs.
- Main process stores the `BatchRenderOpts` and job states. `retryBatchJobs(jobIds)` re-queues those specific jobs and calls `renderBatch` with only those jobs.

## Engine Architecture

### Deprecation of `renderSession`

The existing `renderSession` function is **deprecated** in favour of `renderBatch`. All render invocations go through `renderBatch`, including single-render cases (which are a batch of one `entireProject` job). The old function is removed; its logic is absorbed into the batch orchestrator's `entireProject` job handler.

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
   - Build file frame range map: `[{ path, startFrame, endFrame, durationFrames }]`
   - Resolve timing config, build `SessionSegment[]`, compute offsets
   - Compute output resolution, overlay position, style settings

2. **Per job**:
   - Check `signal.aborted`
   - **Determine source files**: using the file frame range map, find which files overlap the job's required frame range
   - **Entire Project**: join all files → render overlay (full duration) → composite → trim with cuts/transitions
   - **Segment/Linked Segment**:
     1. Identify required source files (usually 1, at most 2)
     2. If 1 file: use directly. If 2+: join just those files → temp file
     3. Extract clip via `-c copy` (rounds start to preceding I-frame)
     4. Probe actual clip start frame
     5. Clone + rebase target segment(s) to actual clip start
     6. Build `OverlayProps` with `segments: [rebasedSegment]`, `durationInFrames` = clip frame count
     7. Render overlay → composite
   - **Lap**: same as Segment but also:
     1. Filter segment to only target lap's data (laps, timestamps)
     2. Build `LapOverlayProps` with `targetLapNumber`, `targetLapStartFrame`, `targetLapEndFrame`

3. **Cleanup**: delete any temp joined/clip files

### Precomputed Context

```ts
interface PrecomputedContext {
  files: Array<{
    path: string
    startFrame: number    // global frame offset (0 for first file)
    endFrame: number
    durationSeconds: number
  }>
  fps: number
  totalDurationSeconds: number
  totalFrames: number
  videoResolution: { width: number; height: number }
  outputResolution: { width: number; height: number }
  segments: SessionSegment[]
  segmentConfigs: SegmentConfig[]
  startingGridPosition?: number
  styling: OverlayStyling
  overlayComponents: OverlayComponentsConfig
  overlayY: number
  boxPosition: BoxPosition
  qualifyingTablePosition?: CornerPosition
}
```

All jobs share this context. No job re-probes video or re-resolves timing.

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
): Promise<{ actualStartFrame: number }>
```

1. Converts `startFrame`/`endFrame` to seconds for FFmpeg `-ss`/`-to`
2. Uses `-c copy` for fast stream copy
3. After extraction, probes the output file to determine the actual start time (PTS of first frame)
4. Returns `actualStartFrame` — used by `rebaseSegment` for precise overlay alignment
5. Respects `AbortSignal` — kills FFmpeg process on abort

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

The old single-render channels (`racedash:startRender`, `racedash:render-progress`, etc.) are deprecated. All renders go through the batch channels (a single-render is a batch of one job).

## UI Changes

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
| I-frame rounding adds extra pre-roll | Acceptable (< 2s within 5s buffer). Overlay rebased to actual clip start. |
| Single job fails | Job gets `error` status, remaining jobs continue |
| User cancels mid-batch | Current job's process killed → `error`, remaining → `skipped`, completed retained |
| Filename collision | Render timestamp (HHMMSS) is the uniqueness key |
| Invalid lap key (doesn't exist) | Silently skip — don't queue a job |
| Overlay-only render mode | Uses `-overlay` suffix + overlay file extension |
| Output directory doesn't exist | Create it before first job |

## Cloud Rendering (Future)

Cloud rendering will use this same batch job flow via the engine's `renderBatch` interface. The engine is designed to be callable from both local IPC and a future cloud worker. However, cloud batch execution is **not implemented in this iteration** — cloud continues using the existing single-job flow until batch support is added.

## Out of Scope

- Cloud batch render execution (interface designed for it, implementation deferred)
- Parallel job execution (sequential only for MVP)
- Per-job render settings (resolution, frame rate) — all jobs use the same settings
- Preview of individual segment/lap clips in the editor
- Handling segments with no timing data (upstream responsibility — wizard prevents this)

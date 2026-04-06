# Multi-Render Jobs (Selective Segment & Lap Export)

**Date:** 2026-04-06
**Linear:** RD-280 (Selective Segment Export), RD-281 (Selective Lap Export)
**Branch:** `feat/video-editing-exporting`

## Problem

Users want to export individual segments or laps as standalone video clips alongside (or instead of) the full project render. The current pipeline produces a single output file. Users need multiple output files from a single render action — one per selected asset.

## Core Concept

Each checked item in Render Assets produces **one independent render job**. Jobs execute sequentially as a batch. The engine precomputes shared data once (video join, timing resolution), then executes each job with its own clip range, overlay configuration, and output file.

### Job Types

| Type | Video range | Overlay | Output filename |
|---|---|---|---|
| **Entire Project** | Full video (with cut regions + transitions) | All segments, all laps | `output-{timestamp}.mp4` |
| **Segment** | Segment start − 5s → segment end + 5s | Only that segment's data, all its laps | `output-{slug}-{timestamp}.mp4` |
| **Linked Segments** | First segment start − 5s → last segment end + 5s | Both segments' data, all laps | `output-{slug1}-{slug2}-{timestamp}.mp4` |
| **Lap** | Lap start − 5s → lap end + 5s | Only that segment's data, only that lap | `output-{slug}-lap{N}-{timestamp}.mp4` |

### Pre-Roll / Post-Roll for Segment & Lap Renders

Fixed at **5 seconds** before and after the time range. Clamped to video boundaries (start ≥ 0, end ≤ video duration). This is independent of the component-derived pre/post-roll used for cut regions.

The 5s buffer ensures the video doesn't start/stop abruptly. Users can trim the output further if desired.

### Overlay Isolation

Each sub-render (segment or lap) must show **only** the data for that asset:

- **Segment render**: overlay shows all laps within that segment. No carry-over from adjacent segments. Fade-in at segment start, fade-out at segment end.
- **Linked segment render**: overlay shows all laps from both linked segments as one continuous overlay. Fade-in at first segment start, fade-out at last segment end.
- **Lap render**: overlay shows only that single lap. The timer is zeroed/hidden during pre-roll, starts at lap start, and stops at lap end. No data from previous or subsequent laps. Fade-in at lap start, fade-out at lap end.

The overlay receives a **single-element** `SessionSegment[]` array containing only the target segment (or merged segments for linked pairs). Non-target segments are excluded entirely — they are not passed as empty objects (the renderer dereferences segment fields without null guards).

For lap renders, the target segment's data is further filtered to contain only the target lap's timing data.

### Overlay Props by Job Type

The overlay uses separate interfaces for different job types to avoid cluttering `OverlayProps` with optionals:

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

Remotion compositions check for `targetLapNumber` to determine rendering behaviour:
- Timer shows `0:00.000` during pre-roll, activates at `targetLapStartFrame`, freezes at `targetLapEndFrame`
- Position counter, delta badge, etc. only update during the target lap's frame range

### Timestamp Rebasing

When rendering a clip starting at source frame `clipStartFrame`, all temporal fields in the segment data must be rebased (snapped to nearest frame):

```ts
function rebaseSegment(segment: SessionSegment, clipStartFrame: number, fps: number): SessionSegment
```

Fields rebased:
- `session.timestamps[].ytSeconds` — subtract `clipStartFrame / fps`, snap to nearest frame
- `leaderboardDrivers[].timestamps[].ytSeconds` — same
- `raceLapSnapshots[].videoTimestamp` — subtract `clipStartFrame / fps`, snap
- `positionOverrides[].timestamp` — subtract `clipStartFrame` (already in frames)

All rebased values are snapped to the nearest frame boundary: `Math.round(value * fps) / fps`. This prevents sub-frame drift between video and overlay.

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
  label: string           // "Entire Project", "Qualifying", "Race Lap 3"
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap'
  segmentIndices: number[] // for segment/linkedSegment/lap jobs
  lapNumber?: number       // for lap jobs
  outputPath: string
  status: RenderJobStatus
  progress: number         // 0-1
  phase: string            // "Rendering overlay", "Compositing", etc.
  error?: string
}
```

### Execution Flow

1. User clicks "Render" (local only for MVP).
2. ExportTab builds the job list from `RenderAssetsSelection`:
   - If `entireProject` is checked → one job of type `entireProject`
   - For each checked segment index (or linked pair) → one job of type `segment` or `linkedSegment`
   - For each checked lap key → one job of type `lap`
3. Jobs are queued with status `queued`.
4. IPC sends the full job list to the main process.
5. Engine's `renderBatch` precomputes shared data (join videos, resolve timing, probe fps/resolution).
6. Jobs execute sequentially:
   - Set status to `rendering`, report progress with `jobId`.
   - On completion: set status to `completed`.
   - On error: set status to `error`, **continue to next job** (don't skip batch on single failure).
7. When all jobs complete, the batch is done.

### Cancellation & Retry

**Cancellation:**
- User clicks "Cancel" → current job's FFmpeg process is killed.
- Current job gets status `error` with message "Cancelled by user".
- Remaining queued jobs get status `skipped`.
- Completed jobs retain their output files.

**Cancellation checkpoints** (between pipeline stages):
- After clip extraction → check cancelled
- After overlay render → check cancelled, delete partial overlay file
- After composite → check cancelled, delete partial output

**Retry:**
- Each errored or skipped job shows a "Retry" button in the UI.
- "Retry All" button appears after batch with any errored/skipped jobs.
- Retry re-queues the selected job(s) and runs them using the same precomputed data (if still valid) or re-precomputes if needed.

## Engine Architecture

### `renderBatch` (new function)

The engine owns batch orchestration. This function is the single entry point for both local IPC and future cloud workers.

```ts
interface BatchRenderOpts {
  configPath: string
  videoPaths: string[]
  rendererEntry: string
  style: string
  outputResolution?: { width: number; height: number }
  outputFrameRate?: string
  jobs: RenderJobOpts[]
  cutRegions?: CutRegion[]     // applied to entireProject only
  transitions?: Transition[]   // applied to entireProject only
}

interface RenderJobOpts {
  id: string
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap'
  segmentIndices: number[]
  lapNumber?: number
  outputPath: string
}

async function renderBatch(
  opts: BatchRenderOpts,
  onJobProgress: (jobId: string, event: RenderProgressEvent) => void,
  onJobComplete: (jobId: string, result: RenderResult) => void,
  onJobError: (jobId: string, error: Error) => void,
  isCancelled: () => boolean,
): Promise<void>
```

**Internal flow:**

1. **Precompute** (once):
   - Join videos if multiple → temp joined file
   - Probe fps, resolution, duration
   - Resolve timing segments, build `SessionSegment[]`, compute offsets

2. **Per job**:
   - Check `isCancelled()`
   - **Entire Project**: run existing `renderSession` logic (overlay → composite → trim with cuts/transitions)
   - **Segment/Linked Segment**: extract clip → build isolated segment overlay props → render overlay → composite
   - **Lap**: extract clip → build `LapOverlayProps` → render overlay → composite

3. **Cleanup**: delete temp joined video

### Clip Extraction

For segment and lap jobs, extract the video clip before overlay rendering:

```ts
async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  onProgress?: (progress: number) => void,
): Promise<void>
```

Uses FFmpeg `-ss` (seek) and `-to` (end time) with stream copy (`-c copy`) for fast extraction without re-encoding.

### Segment/Lap Overlay Building

For each sub-render job, the engine:

1. Identifies the target segment(s) from `segmentIndices`
2. Deep-clones the target `SessionSegment` data
3. Calls `rebaseSegment()` to adjust all timestamps to clip-relative
4. For lap jobs: filters the segment to only the target lap's data
5. Builds overlay props:
   - **Segment jobs**: standard `OverlayProps` with `segments: [rebasedSegment]`
   - **Lap jobs**: `LapOverlayProps` with `targetLapNumber`, `targetLapStartFrame`, `targetLapEndFrame`
6. Sets `durationInFrames` to match the extracted clip duration

## IPC Changes

### Progress Events

Add `jobId` to all render events so ExportTab can match them to jobs:

```ts
interface RenderBatchProgressEvent {
  jobId: string
  phase: string
  progress: number
  renderedFrames?: number
  totalFrames?: number
}

interface RenderBatchJobCompleteEvent {
  jobId: string
  outputPath: string
}

interface RenderBatchJobErrorEvent {
  jobId: string
  message: string
}

interface RenderBatchCompleteEvent {
  completedJobs: number
  erroredJobs: number
  skippedJobs: number
}
```

### IPC Channels

```
racedash:renderBatch:start     → start batch render
racedash:renderBatch:cancel    → cancel current batch
racedash:renderBatch:retry     → retry specific job IDs
racedash:renderBatch:progress  ← per-job progress
racedash:renderBatch:jobComplete ← per-job completion
racedash:renderBatch:jobError  ← per-job error
racedash:renderBatch:complete  ← batch complete
```

## UI Changes

### Export Tab — Job Queue

The "Local Render Controls" section changes from a single progress bar to a **job list**:

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
| Only "Entire Project" checked | Single render, same as legacy pipeline |
| Segment extends beyond video | Clamp: start = max(0, segStart − 5s), end = min(videoDuration, segEnd + 5s) |
| Lap is first in segment | Pre-roll may extend before segment start — allowed (shows dead content with zeroed timer) |
| Single job fails | Job gets `error` status, remaining jobs continue |
| User cancels mid-batch | Current job killed → `error`, remaining → `skipped`, completed retained |
| Output directory doesn't exist | Create it |
| Filename collision (same slug + same second) | Append `-2`, `-3` etc. |
| Invalid lap key (doesn't exist in timing data) | Silently skip — don't queue a job |
| Overlay-only render mode | Uses `-overlay` suffix + overlay file extension (`.mov`/`.webm`) |

## Cloud Rendering (Future)

Cloud rendering will use this same batch job flow via the engine's `renderBatch` interface. The engine is designed to be callable from both local IPC and a future cloud worker. However, cloud batch execution is **not implemented in this iteration** — cloud continues using the existing single-job flow until batch support is added.

## Out of Scope

- Cloud batch render execution (interface designed for it, implementation deferred)
- Parallel job execution (sequential only for MVP)
- Per-job render settings (resolution, frame rate) — all jobs use the same settings
- Preview of individual segment/lap clips in the editor
- Handling segments with no timing data (upstream responsibility — wizard prevents this)
- Handling no-lap segments (upstream responsibility)

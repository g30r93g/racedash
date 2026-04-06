# Multi-Render Jobs (Selective Segment & Lap Export)

**Date:** 2026-04-06
**Linear:** RD-280 (Selective Segment Export), RD-281 (Selective Lap Export)
**Branch:** `feat/video-editing-exporting`

## Problem

Users want to export individual segments or laps as standalone video clips alongside (or instead of) the full project render. The current pipeline produces a single output file. Users need multiple output files from a single render action — one per selected asset.

## Core Concept

Each checked item in Render Assets produces **one independent render job**. Jobs execute sequentially as a batch. Each job is a complete render pipeline invocation (join → overlay → composite → trim) with different time ranges and overlay configurations.

### Job Types

| Type | Video range | Overlay | Output filename |
|---|---|---|---|
| **Entire Project** | Full video (with cut regions + transitions) | All segments, all laps | `output.mp4` |
| **Segment** | Segment start − 5s pre-roll → segment end + 5s post-roll | Only that segment's data, all its laps | `output-{slug}-{timestamp}.mp4` |
| **Lap** | Lap start − 5s pre-roll → lap end + 5s post-roll | Only that segment's data, only that lap | `output-{slug}-lap{N}-{timestamp}.mp4` |

### Pre-Roll / Post-Roll for Segment & Lap Renders

Fixed at **5 seconds** before and after the time range. This is independent of the component-derived pre/post-roll used for cut regions.

The 5s buffer ensures the video doesn't start/stop abruptly. Users can trim the output further if desired.

### Overlay Isolation

Each sub-render (segment or lap) must show **only** the data for that asset:

- **Segment render**: overlay shows all laps within that segment. No carry-over from adjacent segments. Fade-in at segment start, fade-out at segment end.
- **Lap render**: overlay shows only that single lap. The timer starts at lap start and stops at lap end. No data from previous or subsequent laps. Fade-in at lap start, fade-out at lap end.

This means the overlay composition receives a modified `SessionSegment[]` array where:
- For segment renders: only the target segment is populated; all others are emptied.
- For lap renders: only the target segment is populated, and within it only the target lap's data exists.

### Filename Convention

- Label is slugified: lowercase, spaces → hyphens, special characters removed.
- Timestamp appended: `HHMMSS` of when the render started (avoids collisions).
- Examples:
  - `output-qualifying-143022.mp4`
  - `output-race-1-lap3-143022.mp4`
  - `output-143022.mp4` (entire project)

All files written to the same directory as the configured output path (flat structure).

## Render Queue

### State Model

```ts
type RenderJobStatus = 'queued' | 'rendering' | 'completed' | 'error'

interface RenderJob {
  id: string
  label: string           // "Entire Project", "Qualifying", "Race Lap 3"
  type: 'entireProject' | 'segment' | 'lap'
  segmentIndex?: number   // for segment/lap jobs
  lapNumber?: number      // for lap jobs
  outputPath: string
  status: RenderJobStatus
  progress: number        // 0-1
  phase: string           // "Rendering overlay", "Compositing", etc.
  error?: string
}
```

### Execution Flow

1. User clicks "Render" (local) or "Cloud Render".
2. ExportTab builds the job list from `RenderAssetsSelection`:
   - If `entireProject` is checked → one job of type `entireProject`
   - For each checked segment index → one job of type `segment`
   - For each checked lap key → one job of type `lap`
3. Jobs are queued with status `queued`.
4. Jobs execute sequentially:
   - Set status to `rendering`, report progress.
   - On completion: set status to `completed`.
   - On error: set status to `error`, continue to next job.
5. When all jobs complete, the batch is done.

### Cancellation

Cancelling stops the current job and skips remaining queued jobs. All completed jobs retain their output files.

## Pipeline Changes

### `RenderStartOpts` Changes

Replace the single render call with a batch:

```ts
interface RenderJobOpts {
  type: 'entireProject' | 'segment' | 'lap'
  segmentIndex?: number
  lapNumber?: number
  outputPath: string
}

interface RenderStartOpts {
  // ...existing fields (configPath, videoPaths, style, resolution, etc.)
  jobs: RenderJobOpts[]
  cutRegions: CutRegion[]      // applied to entireProject only
  transitions: Transition[]     // applied to entireProject only
}
```

### Engine Changes

For segment/lap jobs, `renderSession` needs:

1. **Video trimming**: FFmpeg `-ss` and `-to` flags to extract just the time range (with 5s pre/post-roll), applied before overlay render.
2. **Overlay isolation**: modify `overlayProps.segments` to only include the target segment/lap data.
3. **Duration adjustment**: the overlay `durationInFrames` must match the trimmed video duration, not the full project.
4. **Offset adjustment**: segment/lap timestamps need to be re-based relative to the trimmed clip start (offset = 0 for the trimmed clip).

### What Does NOT Change

- The existing `renderSession` pipeline for `entireProject` jobs stays as-is (including cut regions + transitions).
- Cloud render flow is out of scope for now.

## UI Changes

### Export Tab

The "Local Render Controls" section changes from a single progress bar to a **job list**:

```
┌──────────────────────────────────────────┐
│ ● Entire Project          completed  ✓   │
│ ● Qualifying              rendering 45%  │
│ ○ Race Lap 3              queued         │
│ ○ Race Lap 8              queued         │
└──────────────────────────────────────────┘
         [Cancel]
```

- Filled circle (●) = completed or in progress
- Empty circle (○) = queued
- Each row shows job label + status + progress percentage (when rendering)
- Completed jobs show a checkmark
- Errored jobs show an error icon + message on hover

The existing single-render progress bar, phase text, and ETA are replaced by this list.

### Render Button Behavior

- "Render" button disabled when no assets are checked.
- During batch: button changes to "Cancel" which stops the current job and skips remaining.
- After batch completes: "Show in Finder" opens the output directory.

## Edge Cases

| Case | Behaviour |
|---|---|
| No assets checked | Render button disabled |
| Only "Entire Project" checked | Single render, same as legacy pipeline |
| Segment extends beyond video | Clamp pre-roll to video start (0), post-roll to video end |
| Lap is the first in segment | Pre-roll may extend before segment start — allowed (shows dead content) |
| Render cancelled mid-batch | Current job stops, remaining skipped, completed jobs keep their files |
| Output directory doesn't exist | Create it |
| Filename collision (same slug + same second) | Append `-2`, `-3` etc. |

## Out of Scope

- Cloud render batch jobs
- Parallel job execution (sequential only for MVP)
- Per-job render settings (resolution, frame rate) — all jobs use the same settings
- Preview of individual segment/lap clips in the editor

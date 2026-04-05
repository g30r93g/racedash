# Video Cut Regions & Transitions

**Date:** 2026-04-06
**Linear:** RD-282 (Segment Trimming), RD-283 (Segment Transitions), RD-284 (Segment Pre-Roll — folded in)
**Branch:** `feat/video-editing-exporting`

## Problem

Race day footage contains dead time between segments (walking to paddock, waiting for grid, post-session cooldown). Users need to trim this dead content from exports while preserving graceful pre-roll / post-roll around segments defined by overlay component configurations. Additionally, users want transition effects (crossfade, fade through black, etc.) at the seams where content is cut.

## Core Concepts

### Cut Regions

A cut region is a range of frames in the joined source video to **remove** from the exported output. Cut regions are stored in project data and defined by global frame boundaries.

- Cut regions must not overlap segments (rejected in UI).
- Overlapping cut regions are auto-merged.
- Cut regions respect derived pre-roll / post-roll buffers around segments (auto-inferred on creation), but users can override boundaries via popover.

### Boundaries

A boundary is a seam in the output video where a transition can be placed. Boundaries are **derived at runtime** (never stored) from:

- **Project start**: frame 0 of the output.
- **Project end**: last frame of the output.
- **Cut seams**: each cut region produces a boundary where the two kept blocks meet.
- **Segment seams**: where one segment's post-roll zone ends and the next segment's pre-roll zone begins, provided no cut region separates them.

### Transitions

A transition is a visual effect applied at a boundary. Transitions are stored in project data, each referencing a boundary by ID.

- Default behaviour at all boundaries is a hard cut (no transition entity needed).
- Transitions are opt-in: user drags a transition pill onto a boundary to create one.
- One transition per boundary (duplicates rejected with toast + "Edit" button to jump to existing).

### Pre-Roll / Post-Roll (Derived)

Pre-roll and post-roll are **not** stored per-segment. They are derived from the active overlay component configurations:

- `preRollFrames = max(component.preRoll + component.fadeIn)` across all registered components with time-based configuration for that segment.
- `postRollFrames = max(component.postRoll + component.fadeOut)` across all registered components with time-based configuration for that segment.

Components are discovered via the overlay component registry. Any registered component that exposes time-based values (pre-roll, post-roll, fade-in, fade-out) is included in the derivation, along with any overlay-level timing configuration. Exact field mapping is deferred to the implementation plan.

These derived values determine:
- How much video before/after a segment must be preserved.
- The auto-inferred bounds when a user adds a cut region.

If component config changes cause a cut region to encroach on a segment's derived buffer zone, a non-blocking **warning badge** appears on the cut in the drawer list. The cut remains valid — user decides whether to adjust.

### Sessions (Emergent, Not Explicit)

There is no "Session" data model. Sessions emerge visually as continuous kept blocks between cut regions. If Practice and Qualifying segments have no cut between them, they appear as one continuous block in the output. Users control grouping entirely through where they place cuts.

## Data Model

### Stored (in `project.json`)

```ts
interface CutRegion {
  id: string          // UUID
  startFrame: number  // inclusive, global frame in joined source video
  endFrame: number    // exclusive
}

interface Transition {
  id: string          // UUID
  boundaryId: string  // "start" | "end" | "cut:<cutId>" | "segment:<segmentIdA>:<segmentIdB>"
  type: 'fadeFromBlack' | 'fadeToBlack' | 'fadeThroughBlack' | 'crossfade'
  durationMs: number  // default 500, snapped to whole frames at render time
}

// Added to ProjectData (default to [] when absent for backward compat)
interface ProjectData {
  // ...existing fields
  cutRegions: CutRegion[]   // defaults to [] when absent in project.json
  transitions: Transition[] // defaults to [] when absent in project.json
}
```

### Derived (computed at runtime)

```ts
interface DerivedSegmentBuffers {
  segmentLabel: string
  preRollFrames: number
  postRollFrames: number
}

interface KeptRange {
  startFrame: number  // inclusive, source frames
  endFrame: number    // exclusive, source frames
}

interface Boundary {
  id: string              // matches Transition.boundaryId format
  kind: 'projectStart' | 'projectEnd' | 'cut' | 'segment'
  frameInSource: number
  oneSided: boolean       // true for project start/end
  label: string           // human-readable label for UI
  allowedTypes: Transition['type'][]  // compatible transition types for this boundary
}
```

### Helper Functions

```ts
// Cut regions -> kept ranges
function computeKeptRanges(totalFrames: number, cuts: CutRegion[]): KeptRange[]

// Source frame <-> output frame mapping (accounts for cuts AND transition durations)
function toOutputFrame(sourceFrame: number, cuts: CutRegion[], transitions: Transition[], fps: number): number
function toSourceFrame(outputFrame: number, cuts: CutRegion[], transitions: Transition[], fps: number): number

// Derive pre/post-roll from component configs
function deriveSegmentBuffers(components: ComponentConfig[]): DerivedSegmentBuffers[]

// Infer cut bounds for "add cut at playhead"
function inferCutBounds(
  playheadFrame: number,
  segments: SegmentConfig[],
  buffers: DerivedSegmentBuffers[],
  totalFrames: number
): CutRegion | null  // null = no dead space at playhead
```

## UI Surfaces

### Left Drawer (Toggleable)

Toggle button in the **editor header**. Drawer appears as a left column in the editor layout: `[left drawer] [video preview + timeline] [tabs panel]`.

```
+-- VIDEO EDITING ----------------+
|  > Cuts                    [+]  |
|     * Cut 1 (19:05-22:07)  [!]  |
|     * Cut 2 (42:48-45:30)       |
|                                 |
|  > Transitions                  |
|     [Fade From Black]           |
|     [Fade To Black]             |
|     [Fade Through Black]        |
|     [Crossfade]                 |
+---------------------------------+
```

- **Cuts section**: list of cut regions with timestamps. `+` adds a cut at playhead (auto-sized to surrounding dead space). Draggable "Cut" pill for drag-and-drop creation on the timeline. Click a row to open popover for editing in/out timestamps. `[!]` warning badge when component config changes encroach on derived buffers.
- **Transitions section**: DaVinci Resolve-style draggable pills, one per transition type. Drag onto a timeline boundary to create.

### Timeline Header (Updated)

```
+--------------------------------------------------------------+
| TIMELINE    [Source] [Project]              1x  [-] [+]      |
+--------------------------------------------------------------+
```

- shadcn `Tabs` component for Source / Project view, placed left of zoom controls.
- Source view: full joined video, cut regions shown as greyed/diagonal-striped spans.
- Project view: cut regions hidden, kept blocks contiguous, scrubbing skips cut regions.

### Timeline Tracks

- **VIDEO track**: renders cut regions visually (Source view only). Segment pre/post-roll zones shown as faint "wing" shading extending from segment edges.
- **Boundary markers**: small targets at each boundary that highlight during transition drag-over. Drop zones for transition pills.
- **Transition bars**: placed transitions render as bars spanning their boundary (Resolve-style). Click to open popover for type/duration editing.
- **SEGMENTS track**: unchanged structurally.

## Interaction Flows

### Adding a Cut Region

**Via `+` button:**

1. User opens left drawer via toggle in editor header.
2. User positions playhead in dead space between/around segments.
3. User clicks `+` in the Cuts section.
4. System auto-infers cut bounds from playhead position (same inference logic as drag-drop below).
5. Cut region appears on timeline + in drawer list. Popover opens for refinement.
6. If playhead is inside a segment or its pre/post-roll zone: toast "No dead space at playhead position", action rejected.

**Via drag-and-drop:**

1. User drags a "Cut" pill from the drawer onto the timeline's VIDEO track.
2. Dead-space zones highlight as valid drop targets.
3. User drops into dead space between/around segments.
4. System auto-infers cut bounds based on surrounding segments:
   - Finds nearest segment before/after drop position.
   - Computes pre/post-roll from component configs.
   - Cut spans: `(preceding segment end + postRoll)` to `(following segment start - preRoll)`.
   - Before first segment: `0` to `(first segment start - preRoll)`.
   - After last segment: `(last segment end + postRoll)` to `video end`.
5. Cut region appears on timeline + in drawer list. Popover opens for refinement.
6. If dropped inside a segment or its pre/post-roll zone: toast "No dead space here", drop rejected.

### Adding a Transition

1. User drags a transition pill from the drawer onto the timeline.
2. Boundary markers glow as the pill approaches valid drop zones.
3. User drops onto a boundary:
   - Transition bar appears on timeline.
   - Popover opens automatically, focused, with type pre-filled from the dragged pill and duration input (default 500ms).
4. If dropped on a one-sided boundary with an incompatible type (e.g. crossfade on project start): drop rejected with toast explaining why. Allowed types per boundary:
   - **Project start**: fadeFromBlack, fadeThroughBlack only.
   - **Project end**: fadeToBlack, fadeThroughBlack only.
   - **Two-sided boundaries** (cut seams, segment seams): all types allowed.
5. If dropped on non-boundary area: toast "Transitions can only be placed at boundaries."
6. If boundary already has a transition: toast "This boundary already has a transition" with "Edit" button that opens the existing transition's popover and jumps the timeline to it.

### Editing a Cut Region

1. Click cut row in drawer list, or click cut region on timeline.
2. Popover opens with in/out timestamp inputs (editable).
3. Changes reflected in real-time on timeline.

### Editing a Transition

1. Click transition bar on timeline.
2. Popover opens with type dropdown + duration input.
3. Type dropdown filters to compatible types based on boundary sidedness.

### Deleting

- **Cut region**: click cut row in drawer, popover has "Delete" action. If cut had a transition, transition is also deleted. Toast: "Transition removed - cut region deleted."
- **Transition**: click transition bar, popover has "Delete" action. Boundary reverts to hard cut.

### Scrubbing

- **Source view**: playhead uses source frames. Full video plays including cut regions. Cut regions visible as greyed spans.
- **Project view**: playhead uses output frames (via `toOutputFrame()`, which accounts for both cuts and transition durations). Scrubbing past a seam jumps to next kept block. Video preview skips cut content. Cut creation in Project view converts playhead position back to source frames via `toSourceFrame()` before running inference.

## Export Pipeline

### Current

`startRender()` receives `configPath + videoPaths + outputPath + style + resolution + frameRate + renderMode` and renders the entire joined video sequentially.

### Updated

`startRender()` gains two new fields:

```ts
interface RenderOpts {
  // ...existing fields
  cutRegions: CutRegion[]
  transitions: Transition[]
}
```

**Render steps:**

1. Compute `KeptRange[]` from `cutRegions` via `computeKeptRanges()`.
2. Derive per-segment buffers from component configs via `deriveSegmentBuffers()`.
3. Snap all transition durations to whole frames: `frames = Math.round(durationMs / 1000 * fps)`, minimum 2 frames.
4. Build the output frame sequence by processing kept ranges and transitions in order:

**Per boundary kind:**

| Boundary | Render behaviour |
|---|---|
| **Project start** (one-sided) | If transition exists: render first `frames` of first kept range with opacity ramp 0→1 over black (fadeFromBlack) or fade-out-then-in (fadeThroughBlack). Output length unchanged — transition replaces opening frames. |
| **Project end** (one-sided) | If transition exists: render last `frames` of last kept range with opacity ramp 1→0 to black (fadeToBlack) or fade-out-then-in (fadeThroughBlack). Output length unchanged — transition replaces closing frames. |
| **Cut seam** (two-sided) | If no transition: concatenate kept ranges directly (hard cut). If crossfade: overlap last `frames` of outgoing range with first `frames` of incoming range (output shorter by `frames`). If fadeThroughBlack: `Math.floor(frames / 2)` fade-out + `Math.ceil(frames / 2)` fade-in, inserted between ranges (output longer by `frames`). If fadeFromBlack/fadeToBlack: applied to incoming/outgoing side respectively. |
| **Segment seam** (two-sided, within a kept range) | Same composite rules as cut seam, but applied mid-range at the segment boundary frame position. Crossfade overlaps frames across the seam; fadeThroughBlack inserts frames. |

5. Output single MP4 with all ranges and transitions composed.

Cloud rendering is out of scope for now; the config shape will accommodate it when needed.

**Boundary lifecycle:** When boundaries are recomputed (due to cut edits, cut merges, segment changes), any `Transition` referencing a `boundaryId` that no longer exists is automatically deleted. A toast notifies the user: "Transition removed — boundary no longer exists."

## Edge Cases

| Case | Behaviour |
|---|---|
| Overlapping cut regions | Auto-merge into one region. Toast: "Cut regions merged." |
| Cut region overlapping a segment | Rejected in popover: "Cut region overlaps segment X." |
| Component config change encroaches on cut's buffer zone | Non-blocking warning badge on cut in drawer list. Cut remains valid. |
| No segments defined | Cuts section disabled with hint: "Add segments to enable video editing." |
| Cut deleted that had a transition | Transition also deleted. Toast: "Transition removed - cut region deleted." |
| Multiple transitions on same boundary | Drop rejected. Toast with "Edit" button that opens existing transition's popover and jumps timeline to it. |
| All video content cut | Empty timeline with message: "All video content has been cut." Export button disabled with tooltip: "Nothing to export." |
| Transition duration exceeds available frames | Clamp duration to available frames. Inline note in popover. |
| Pre/post-roll exceeds gap between segments | Allowed (not invalid). User configured component values intentionally. |

## Implementation Notes

### Boundary Identity

Segment-seam boundary IDs use segment UUIDs (not labels) to ensure stability across renames: `"segment:<segmentIdA>:<segmentIdB>"`. If segments do not currently have UUIDs, add an `id: string` field to `SegmentConfig` (generated on creation, preserved across edits).

### React Hooks

Derived state (kept ranges, boundaries, segment buffers, frame mapping) should be computed via dedicated React hooks with `useMemo` for performance:

- `useKeptRanges(cutRegions, totalFrames)` — memoized kept range computation.
- `useBoundaries(cutRegions, segments, buffers, transitions)` — memoized boundary list with allowed types.
- `useSegmentBuffers(componentConfigs)` — memoized pre/post-roll derivation.
- `useFrameMapping(cutRegions, transitions, fps)` — memoized `toOutputFrame` / `toSourceFrame` closures.

These hooks ensure the timeline and drawer re-render efficiently when cut regions, transitions, or component configs change.

### Backward Compatibility

Existing `project.json` files without `cutRegions` or `transitions` fields default to `[]` on load. No migration needed — projects behave as before (full video exported, no cuts or transitions).

## Out of Scope

- Drag-and-drop for cut region resizing on the timeline (MVP uses popover-only editing).
- Duration handles on transition bars (MVP uses popover-only editing).
- I/O keyboard shortcuts for trim (deferred to Keyboard Commands project, RD-320).
- Cloud render pipeline changes.
- Wipe / slide / custom transition types.

# Editor Video Preview + Timeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the left pane of the Editor screen — a static video preview placeholder and a fully-rendered timeline showing video duration, segments, laps, and position data — plus implement the `getVideoInfo` IPC handler that reads metadata from a video file via ffprobe.

**Architecture:** `Editor.tsx` receives a `ProjectData` prop and owns the top-level two-pane layout, calling `getVideoInfo` on mount and distributing the result to child components. `VideoPane` and `TimelinePane` are pure display components that receive all data as props, keeping IPC logic confined to `Editor.tsx`. The IPC handler in `ipc.ts` uses `child_process.execFileSync` (not `exec`/`execSync` with a shell-interpolated string) to avoid shell injection, passing the video path as a discrete argument array.

**Tech Stack:** Electron 33, React 18, shadcn/ui, Tailwind CSS v4, TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/desktop/src/renderer/src/types/project.ts` | Create | `ProjectData` and `Segment` types used across the Editor |
| `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | Create | Two-pane layout; calls `getVideoInfo` on mount; passes props down |
| `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx` | Create | Video placeholder area: "NO VIDEO LOADED" text, play icon, timecode overlay |
| `apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx` | Create | 180px-tall timeline with header, time ruler, track rows, and static playhead |
| `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` | Create | Placeholder stub for the right-pane tabs (filled by sub-plan 5) |
| `apps/desktop/src/renderer/src/App.tsx` | Modify | Wire `<Editor project={project} onClose={...} />` into the app shell |
| `apps/desktop/src/main/ipc.ts` | Modify | Implement `racedash:getVideoInfo` handler using `execFileSync` |
| `apps/desktop/src/main/__tests__/ipc.getVideoInfo.test.ts` | Create | Unit tests for the `getVideoInfo` exported function |

---

## Chunk 1: Types and IPC handler

### Task 1: Define `ProjectData` types

**Files:**
- Create: `apps/desktop/src/renderer/src/types/project.ts`

- [ ] **Step 1: Create the project types file**

```typescript
// apps/desktop/src/renderer/src/types/project.ts

export interface Segment {
  /** Human-readable label, e.g. "Race 1" */
  label: string
  /** Start time offset in seconds from the beginning of the video */
  startSeconds: number
  /** End time offset in seconds from the beginning of the video */
  endSeconds: number
}

export interface ProjectData {
  /** Absolute paths to the source video files */
  videoPaths: string[]
  /** Timing segments derived from race data */
  segments: Segment[]
  /** The selected driver identifier, e.g. kart number */
  selectedDriver: string | null
}
```

No command needed at this point; TypeScript errors will surface in subsequent tasks when the types are imported.

---

### Task 2: Extract `getVideoInfo` logic into a testable function

The `ipcMain.handle` callback receives an `IpcMainInvokeEvent` as its first argument, making it difficult to unit-test directly. Extract the real work into a named exported function in the same file so tests can call it without mocking Electron internals.

Use `execFileSync` rather than `execSync` with a shell-interpolated string. `execFileSync` takes the binary name and an argument array separately — the video path never touches a shell, so there is no injection risk.

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/__tests__/ipc.getVideoInfo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the directory `apps/desktop/src/main/__tests__/` and create the test file:

```typescript
// apps/desktop/src/main/__tests__/ipc.getVideoInfo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'child_process'

// Import the function we are about to implement — this will error until Step 3.
import { getVideoInfo } from '../ipc'

vi.mock('child_process')

const MOCK_FFPROBE_OUTPUT = JSON.stringify({
  streams: [
    {
      codec_type: 'audio',
      r_frame_rate: '0/0',
      duration: '0',
    },
    {
      codec_type: 'video',
      width: 1920,
      height: 1080,
      r_frame_rate: '60000/1001',
      duration: '300.5',
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getVideoInfo', () => {
  it('parses width and height from the video stream', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      Buffer.from(MOCK_FFPROBE_OUTPUT)
    )
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
  })

  it('parses duration as a float', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      Buffer.from(MOCK_FFPROBE_OUTPUT)
    )
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.durationSeconds).toBeCloseTo(300.5)
  })

  it('parses fps from a fractional r_frame_rate field (60000/1001 → ~59.94)', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      Buffer.from(MOCK_FFPROBE_OUTPUT)
    )
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.fps).toBeCloseTo(59.94, 1)
  })

  it('parses fps from a whole-number r_frame_rate field (30/1 → 30)', () => {
    const output = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          width: 1280,
          height: 720,
          r_frame_rate: '30/1',
          duration: '60',
        },
      ],
    })
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(output))
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.fps).toBeCloseTo(30, 1)
  })

  it('passes the video path as a discrete argument (not shell-interpolated)', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      Buffer.from(MOCK_FFPROBE_OUTPUT)
    )
    getVideoInfo('/my/video.mp4')
    // Second argument to execFileSync must be an array containing the video path
    const callArgs = vi.mocked(childProcess.execFileSync).mock.calls[0]
    expect(callArgs[0]).toBe('ffprobe')
    expect(callArgs[1]).toEqual(expect.arrayContaining(['/my/video.mp4']))
  })

  it('throws a descriptive error when ffprobe is not found', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      const err = new Error('ffprobe: not found') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    expect(() => getVideoInfo('/path/to/video.mp4')).toThrow(
      /ffprobe not found/i
    )
  })

  it('skips non-video streams and picks the first video stream', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      Buffer.from(MOCK_FFPROBE_OUTPUT)
    )
    // Width/height must come from the video stream (index 1), not the audio stream (index 0)
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.width).toBe(1920)
  })

  it('throws when no video stream is found in ffprobe output', () => {
    const output = JSON.stringify({
      streams: [
        { codec_type: 'audio', r_frame_rate: '0/0', duration: '0' },
      ],
    })
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(output))
    expect(() => getVideoInfo('/path/to/video.mp4')).toThrow(
      /no video stream/i
    )
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail (function not yet exported)**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: FAIL — errors including `getVideoInfo is not a function` or similar import error.

- [ ] **Step 3: Implement `getVideoInfo` as an exported function and wire it into the IPC handler**

Replace the entire contents of `apps/desktop/src/main/ipc.ts`:

```typescript
// apps/desktop/src/main/ipc.ts
import { execFileSync } from 'child_process'
import { ipcMain } from 'electron'
import type { VideoInfo } from '../types/ipc'

/**
 * Reads basic video metadata from `videoPath` using ffprobe.
 *
 * Uses `execFileSync` with a discrete argument array so the video path is
 * never interpolated into a shell string — no shell injection risk.
 *
 * Exported separately from the IPC handler so it can be unit-tested without
 * any Electron machinery.
 */
export function getVideoInfo(videoPath: string): VideoInfo {
  let stdout: Buffer
  try {
    stdout = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      videoPath,
    ]) as Buffer
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || message.toLowerCase().includes('not found')) {
      throw new Error(
        'ffprobe not found. Install ffmpeg (which bundles ffprobe) and ensure it is on your PATH.'
      )
    }
    throw err
  }

  const parsed = JSON.parse(stdout.toString()) as {
    streams: Array<{
      codec_type: string
      width?: number
      height?: number
      r_frame_rate: string
      duration: string
    }>
  }

  const videoStream = parsed.streams.find((s) => s.codec_type === 'video')
  if (!videoStream) {
    throw new Error(`No video stream found in ffprobe output for: ${videoPath}`)
  }

  // r_frame_rate is a fraction string like "60000/1001" or "30/1"
  const [numerator, denominator] = videoStream.r_frame_rate
    .split('/')
    .map(Number)
  const fps = denominator !== 0 ? numerator / denominator : 0

  return {
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps,
    durationSeconds: parseFloat(videoStream.duration),
  }
}

const stub = (channel: string) => () => {
  throw new Error(`IPC handler not implemented: ${channel}`)
}

export function registerIpcHandlers(): void {
  ipcMain.handle('racedash:checkFfmpeg',        stub('checkFfmpeg'))
  ipcMain.handle('racedash:openFile',           stub('openFile'))
  ipcMain.handle('racedash:openFiles',          stub('openFiles'))
  ipcMain.handle('racedash:openDirectory',      stub('openDirectory'))
  ipcMain.handle('racedash:revealInFinder',     stub('revealInFinder'))
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))
  ipcMain.handle('racedash:getVideoInfo',       (_event, videoPath: string) =>
    getVideoInfo(videoPath)
  )
  ipcMain.handle('racedash:startRender',        stub('startRender'))
  ipcMain.handle('racedash:cancelRender',       stub('cancelRender'))
}
```

- [ ] **Step 4: Run the tests and confirm they all pass**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All `getVideoInfo` tests PASS, suite exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/renderer/src/types/project.ts \
  apps/desktop/src/main/ipc.ts \
  apps/desktop/src/main/__tests__/ipc.getVideoInfo.test.ts
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): implement getVideoInfo IPC handler with ffprobe"
```

> Dispatch plan-document-reviewer for Chunk 1 before proceeding.

---

## Chunk 2: Editor scaffold and VideoPane

### Task 3: Create `EditorTabsPane` stub

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx`

- [ ] **Step 1: Create the directory and stub file**

First create the directory `apps/desktop/src/renderer/src/screens/editor/` (create any parent directories as needed), then create the file:

```tsx
// apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx
import React from 'react'
import type { ProjectData } from '../../types/project'

interface EditorTabsPaneProps {
  project: ProjectData
}

export function EditorTabsPane({ project: _project }: EditorTabsPaneProps): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-xs text-muted-foreground">Editor Tabs — coming soon</p>
    </div>
  )
}
```

---

### Task 4: Create `VideoPane`

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx`

- [ ] **Step 1: Create VideoPane.tsx**

```tsx
// apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx
import React from 'react'

/**
 * Static video placeholder area.
 * Shows a centred play icon with "NO VIDEO LOADED" label and a bottom-right
 * timecode overlay. Actual video playback is a follow-on task.
 */
export function VideoPane(): React.ReactElement {
  return (
    <div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
      {/* Centre content: play icon + label */}
      <div className="flex flex-col items-center gap-3">
        {/* Grey triangle play icon */}
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <polygon points="14,10 38,24 14,38" fill="#3a3a3a" />
        </svg>
        <span className="text-xs tracking-widest text-muted-foreground">
          NO VIDEO LOADED
        </span>
      </div>

      {/* Bottom-right timecode overlay */}
      <div className="absolute bottom-3 right-4">
        <span className="font-mono text-xs text-muted-foreground">
          00:00:00.000
        </span>
      </div>
    </div>
  )
}
```

---

### Task 5: Create `Editor.tsx` with two-pane layout

`Editor.tsx` calls `getVideoInfo` on mount using the first video path from `project.videoPaths`, stores the result in local state, and passes it down to `TimelinePane`. If `videoPaths` is empty the IPC call is skipped and `videoInfo` stays `null` (the timeline renders with a fallback duration).

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`

- [ ] **Step 1: Create Editor.tsx**

```tsx
// apps/desktop/src/renderer/src/screens/editor/Editor.tsx
import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { VideoPane } from './VideoPane'
import { TimelinePane } from './TimelinePane'
import { EditorTabsPane } from './EditorTabsPane'

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor({ project, onClose: _onClose }: EditorProps): React.ReactElement {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)

  useEffect(() => {
    if (project.videoPaths.length === 0) return

    window.racedash
      .getVideoInfo(project.videoPaths[0])
      .then(setVideoInfo)
      .catch((err: unknown) => {
        // Non-fatal: timeline renders with a fallback duration.
        console.warn('[Editor] getVideoInfo failed:', err)
      })
  }, [project.videoPaths])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left pane — video + timeline */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <VideoPane />
        <TimelinePane project={project} videoInfo={videoInfo} />
      </div>

      {/* Right pane — tabbed panel (built by sub-plan 5) */}
      <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane project={project} />
      </div>
    </div>
  )
}
```

---

### Task 6: Wire Editor into App.tsx

The existing `App.tsx` renders the two-pane layout inline. Replace it with a shell that holds `ProjectData` state and delegates to `Editor` when a project is open.

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

Replace the entire contents of `apps/desktop/src/renderer/src/App.tsx`:

```tsx
// apps/desktop/src/renderer/src/App.tsx
import React, { useState } from 'react'
import type { ProjectData } from './types/project'
import { Editor } from './screens/editor/Editor'

/**
 * App shell. Renders the Editor full-screen when a project is loaded.
 * Project-loading UI is added by a later sub-plan; the button below is a
 * development stub that opens the Editor with an empty project.
 */
export function App(): React.ReactElement {
  const [project, setProject] = useState<ProjectData | null>(null)

  if (project !== null) {
    return <Editor project={project} onClose={() => setProject(null)} />
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <button
        className="rounded bg-primary px-4 py-2 text-xs text-primary-foreground"
        onClick={() =>
          setProject({
            videoPaths: [],
            segments: [],
            selectedDriver: null,
          })
        }
      >
        Open Editor (dev stub)
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run the tests to confirm nothing regressed**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All tests PASS, suite exits 0.

- [ ] **Step 3: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx \
  apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx \
  apps/desktop/src/renderer/src/screens/editor/Editor.tsx \
  apps/desktop/src/renderer/src/App.tsx
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): add Editor scaffold with VideoPane and EditorTabsPane stub"
```

> Dispatch plan-document-reviewer for Chunk 2 before proceeding.

---

## Chunk 3: TimelinePane

### Task 7: Create `TimelinePane`

The timeline is a pure display component. It receives `project` and `videoInfo` as props and computes all layout values from them. If `videoInfo` is `null` (still loading), it falls back to a 30-second duration so the UI is never blank.

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx`

**Design notes:**
- The label column is `w-20` (80px).
- The track area fills the remaining width via `flex-1`.
- All bar/dot positions are expressed as CSS percentage values of the track width — no `ResizeObserver` or JS pixel measurement is needed.
- The playhead is static at 30% across the track area. Its `left` value accounts for the 80px label column by composing `calc(5rem + 30%)` relative to the pane container.
- Placeholder laps L1/L2/L3 span the full video duration evenly. A follow-on plan will replace these once `ProjectData` grows a `laps` field.

- [ ] **Step 1: Create TimelinePane.tsx**

```tsx
// apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx
import React from 'react'
import type { ProjectData } from '../../types/project'
import type { VideoInfo } from '../../../../types/ipc'

interface TimelinePaneProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}

/** Segment bar colours — cycles by index. */
const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']

/** All lap bars share this colour; the label text distinguishes them. */
const LAP_COLOUR = '#3b82f6'

/** Four placeholder position dots in distinct colours. */
const POSITION_DOT_COLOURS = ['#f97316', '#ef4444', '#22c55e', '#eab308']

/**
 * Converts seconds to a "M:SS" ruler label, e.g. 75 → "1:15".
 */
function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Returns tick positions in seconds at 5-second intervals from 0 to duration.
 */
function rulerTicks(duration: number): number[] {
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += 5) {
    ticks.push(t)
  }
  return ticks
}

export function TimelinePane({ project, videoInfo }: TimelinePaneProps): React.ReactElement {
  const duration = videoInfo?.durationSeconds ?? 30

  /** Convert a time offset (seconds) to a CSS left-percentage inside the track area. */
  const pct = (seconds: number): string =>
    `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`

  /** Convert a span (seconds) to a CSS width-percentage inside the track area. */
  const widthPct = (seconds: number): string =>
    `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`

  // Placeholder laps — follow-on work will populate from real lap data.
  // Note: ProjectData does not yet include a laps field; deferred to a later plan.
  const placeholderLaps = [
    { label: 'L1', startSeconds: 0,              endSeconds: duration * 0.32 },
    { label: 'L2', startSeconds: duration * 0.32, endSeconds: duration * 0.65 },
    { label: 'L3', startSeconds: duration * 0.65, endSeconds: duration },
  ]

  const ticks = rulerTicks(duration)

  return (
    <div
      className="flex h-[180px] shrink-0 flex-col border-t border-border bg-background"
      style={{ fontSize: 11 }}
    >
      {/* ── Header row ── */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium tracking-widest text-muted-foreground">
          TIMELINE
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <button
            aria-label="Zoom out"
            className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary hover:text-foreground"
          >
            −
          </button>
          <button
            aria-label="Zoom in"
            className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary hover:text-foreground"
          >
            +
          </button>
        </div>
      </div>

      {/* ── Track area ── */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Time ruler */}
        <div className="flex h-5 shrink-0 items-end">
          <div className="w-20 shrink-0" aria-hidden="true" />
          <div className="relative flex-1">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute bottom-0 flex flex-col items-center"
                style={{ left: pct(t) }}
              >
                <span className="text-[10px] text-muted-foreground">
                  {formatRulerLabel(t)}
                </span>
                <div className="h-1.5 w-px bg-border" />
              </div>
            ))}
          </div>
        </div>

        {/* Track rows */}
        <div className="relative flex flex-1 flex-col gap-px overflow-hidden">

          {/* ── VIDEO track ── */}
          <TrackRow label="VIDEO">
            <div
              className="absolute inset-y-1 rounded-sm bg-[#3a3a3a]"
              style={{ left: '0%', width: '100%' }}
            />
          </TrackRow>

          {/* ── SEGMENTS track ── */}
          <TrackRow label="SEGMENTS">
            {project.segments.length === 0 ? (
              <div className="absolute inset-y-2 left-0 right-0 rounded-sm border border-dashed border-border" />
            ) : (
              project.segments.map((seg, i) => (
                <div
                  key={i}
                  className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm px-1"
                  style={{
                    left: pct(seg.startSeconds),
                    width: widthPct(seg.endSeconds - seg.startSeconds),
                    backgroundColor: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
                  }}
                >
                  <span className="truncate text-[10px] font-medium text-white">
                    {seg.label}
                  </span>
                </div>
              ))
            )}
          </TrackRow>

          {/* ── LAPS track ── */}
          <TrackRow label="LAPS">
            {placeholderLaps.map((lap, i) => (
              <div
                key={i}
                className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-full px-1"
                style={{
                  left: pct(lap.startSeconds),
                  width: widthPct(lap.endSeconds - lap.startSeconds),
                  backgroundColor: LAP_COLOUR,
                }}
              >
                <span className="text-[10px] font-medium text-white">
                  {lap.label}
                </span>
              </div>
            ))}
          </TrackRow>

          {/* ── POSITION track ── */}
          <TrackRow label="POSITION">
            {POSITION_DOT_COLOURS.map((colour, i) => (
              <div
                key={i}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={{
                  left: pct((duration / (POSITION_DOT_COLOURS.length + 1)) * (i + 1)),
                  backgroundColor: colour,
                }}
              />
            ))}
          </TrackRow>

          {/* ── Playhead — static at 30% across the track area ── */}
          {/*
            left = label-column width (5rem = w-20) + 30% of the track area.
            Uses `calc` to combine the fixed column offset with the percentage.
          */}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center"
            style={{ left: 'calc(5rem + 30%)' }}
          >
            <div className="rounded bg-primary px-1 py-px">
              <span className="font-mono text-[10px] text-primary-foreground">
                {formatRulerLabel(duration * 0.3)}
              </span>
            </div>
            <div className="w-px flex-1 bg-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal helper component
// ---------------------------------------------------------------------------

interface TrackRowProps {
  label: string
  children: React.ReactNode
}

function TrackRow({ label, children }: TrackRowProps): React.ReactElement {
  return (
    <div className="flex flex-1 items-stretch">
      {/* Fixed-width label column */}
      <div className="flex w-20 shrink-0 items-center border-r border-border px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {/* Track area */}
      <div className="relative flex-1">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the tests to confirm nothing regressed**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All tests PASS, suite exits 0.

- [ ] **Step 3: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): add TimelinePane with video/segments/laps/position tracks"
```

> Dispatch plan-document-reviewer for Chunk 3 before proceeding.

---

## Chunk 4: Integration verification

### Task 8: Type-check and final test run

Verify TypeScript is satisfied across both the renderer and main process, and that all tests still pass after every file has been written.

**Files:** No new files created in this task.

- [ ] **Step 1: Type-check the renderer (web) TypeScript project**

Run:
```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app/apps/desktop && npx tsc --project tsconfig.web.json --noEmit
```

Expected: No errors, exit code 0.

If errors appear, the most likely cause is a wrong relative import depth for `../../../../types/ipc` in `Editor.tsx`. Count the directories: `screens/editor/` → `renderer/src/` → `renderer/` → `src/` → `types/ipc`. The correct relative path from `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` to `apps/desktop/src/types/ipc.ts` is `../../../../types/ipc`. Fix and re-run until clean.

- [ ] **Step 2: Type-check the main process TypeScript project**

Run:
```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app/apps/desktop && npx tsc --project tsconfig.node.json --noEmit
```

Expected: No errors, exit code 0.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All tests PASS, suite exits 0.

- [ ] **Step 4: Commit any fixes from Steps 1–2**

Only needed if type-check fixes were required. If no changes were made, skip this step.

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add -u
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "fix(desktop): resolve type errors from editor video timeline integration"
```

> Dispatch plan-document-reviewer for Chunk 4 before proceeding.

---

## Follow-on work (out of scope for this plan)

The following items are intentionally deferred:

1. **Real lap data** — `ProjectData` does not include lap timing. `TimelinePane` renders placeholder laps L1/L2/L3. A future plan should add a `laps` field to `ProjectData` and replace the hardcoded array.
2. **Video playback** — `VideoPane` shows a static play icon. Clicking does nothing. Actual `<video>` element playback, seeking, and timecode synchronisation are deferred to a playback sub-plan.
3. **Draggable playhead** — The playhead is static at 30%. Dragging requires pointer-event handlers and shared playback state; deferred to the playback sub-plan.
4. **Zoom** — The "−" and "+" zoom buttons are rendered but have no handlers. Timeline zoom (pixels-per-second scaling) is deferred.
5. **Timeline horizontal scroll** — When video duration is long the track area will need horizontal scrolling; deferred until zoom is implemented.
6. **Right pane tabs** — `EditorTabsPane` is a stub. It is filled by sub-plan 5.

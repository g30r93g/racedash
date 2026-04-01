# Wizard Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-step settings-first project creation wizard with a 3-screen goal-first flow that minimises time-to-first-edit.

**Architecture:** The new wizard (`NewProjectWizard`) replaces `ProjectCreationWizard` with 3 screens: NewProjectStep (name + videos), SegmentSetupStep (inline segment creation with embedded offset picker and driver selection), ReviewTimingStep (lap stepper with video frame preview). The OffsetPicker is refactored from a Dialog to an inline component. A new utility handles GoPro-style filename sorting. The existing IPC surface (`createProject`, `previewDrivers`, `previewTimestamps`) is unchanged.

**Tech Stack:** React, TypeScript, Vitest, Electron IPC, shadcn/ui, Tailwind CSS

**Spec:** `docs/specs/2026-03-31-wizard-rework-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/desktop/src/renderer/src/utils/videoFileOrder.ts` | GoPro (and future camera) filename pattern detection and smart sorting |
| `apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts` | Unit tests for sorting logic |
| `apps/desktop/src/renderer/src/screens/wizard/NewProjectWizard.tsx` | New wizard orchestrator — 3-step state machine, replaces `ProjectCreationWizard` |
| `apps/desktop/src/renderer/src/screens/wizard/steps/NewProjectStep.tsx` | Screen 1: project name + video drop zone + reorderable file list + advanced settings |
| `apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx` | Screen 2: inline segment creation form with video assignment, timing source, driver, offset picker |
| `apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx` | Screen 3: lap stepper with video frame preview for sync verification |
| `apps/desktop/src/renderer/src/components/video/InlineOffsetPicker.tsx` | Offset picker extracted from Dialog into an inline (non-modal) component |

### Modified files

| File | Changes |
|------|---------|
| `apps/desktop/src/renderer/src/App.tsx` | Import `NewProjectWizard` instead of `ProjectCreationWizard` |
| `apps/desktop/src/renderer/src/components/wizard/WizardShell.tsx` | Remove dead `title` prop; update step labels |
| `apps/desktop/src/renderer/src/components/video/VideoFileList.tsx` | Add "assigned to segment X" visual state via optional `assignments` prop |
| `apps/desktop/src/types/project.ts` | Add `videoIndices` field to `SegmentConfig` |

### Files to delete (after new wizard is complete)

| File | Reason |
|------|--------|
| `apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx` | Replaced by `NewProjectWizard` |
| `apps/desktop/src/renderer/src/screens/wizard/steps/VideosStep.tsx` | Merged into `NewProjectStep` |
| `apps/desktop/src/renderer/src/screens/wizard/steps/ConfirmStep.tsx` | Merged into `NewProjectStep` (name + save dir) |
| `apps/desktop/src/renderer/src/screens/wizard/steps/DriverStep.tsx` | Merged into per-segment inline picker in `SegmentSetupStep` |
| `apps/desktop/src/renderer/src/screens/wizard/steps/VerifyStep.tsx` | Replaced by `ReviewTimingStep` |

### Files retained as-is

| File | Notes |
|------|-------|
| `SegmentForm.tsx` | Still used by `ProjectEditWizard` |
| `ManualLapEntry.tsx` | Reused unchanged for manual timing source |
| `SegmentRow.tsx` | Reused for displaying confirmed segments as cards |
| `FrameScrubber.tsx` | Reused inside `InlineOffsetPicker` |
| `LapTimeVerifyTable.tsx` | Still used by `ProjectEditWizard`; new `ReviewTimingStep` has its own lap logic |
| `StepIndicator.tsx` | Reused in `WizardShell` |
| `OffsetPickerStep.tsx` | Still used by `SegmentForm.tsx` (edit wizard) |

---

## Task 1: Video File Ordering Utility

**Files:**
- Create: `apps/desktop/src/renderer/src/utils/videoFileOrder.ts`
- Create: `apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts`

- [ ] **Step 1: Write failing tests for GoPro chapter detection and sorting**

```ts
// apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts
import { describe, it, expect } from 'vitest'
import { smartSortVideoPaths } from '../videoFileOrder'

describe('smartSortVideoPaths', () => {
  it('sorts GoPro chapters by chapter number (GXccSSSS pattern)', () => {
    const input = [
      '/videos/GX030042.MP4',
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
      '/videos/GX030042.MP4',
    ])
  })

  it('sorts GoPro Hero5-7 style (GPccSSSS pattern)', () => {
    const input = [
      '/videos/GP020015.MP4',
      '/videos/GP010015.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GP010015.MP4',
      '/videos/GP020015.MP4',
    ])
  })

  it('groups GoPro files by session ID before sorting chapters', () => {
    const input = [
      '/videos/GX020099.MP4',
      '/videos/GX010042.MP4',
      '/videos/GX010099.MP4',
      '/videos/GX020042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
      '/videos/GX010099.MP4',
      '/videos/GX020099.MP4',
    ])
  })

  it('preserves original order for non-GoPro files', () => {
    const input = [
      '/videos/sunset.mp4',
      '/videos/afternoon.mp4',
      '/videos/morning.mp4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/sunset.mp4',
      '/videos/afternoon.mp4',
      '/videos/morning.mp4',
    ])
  })

  it('preserves original order for mixed known/unknown files', () => {
    const input = [
      '/videos/random.mp4',
      '/videos/GX020042.MP4',
      '/videos/GX010042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/random.mp4',
      '/videos/GX020042.MP4',
      '/videos/GX010042.MP4',
    ])
  })

  it('handles single file (no sorting needed)', () => {
    const input = ['/videos/GX010042.MP4']
    expect(smartSortVideoPaths(input)).toEqual(['/videos/GX010042.MP4'])
  })

  it('handles empty array', () => {
    expect(smartSortVideoPaths([])).toEqual([])
  })

  it('is case-insensitive for extensions', () => {
    const input = [
      '/videos/GX020042.mp4',
      '/videos/GX010042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.mp4',
    ])
  })

  it('does not mutate the input array', () => {
    const input = ['/videos/GX020042.MP4', '/videos/GX010042.MP4']
    const original = [...input]
    smartSortVideoPaths(input)
    expect(input).toEqual(original)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm test -- --run apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `smartSortVideoPaths`**

```ts
// apps/desktop/src/renderer/src/utils/videoFileOrder.ts

/**
 * GoPro naming convention:
 * - Hero8+: GX{chapter:2}{session:4}.MP4 (e.g. GX010042.MP4)
 * - Hero5-7: GP{chapter:2}{session:4}.MP4 (e.g. GP010015.MP4)
 *
 * Chapter = 2-digit sequence number within a session.
 * Session = 4-digit recording session ID.
 */

interface GoProFile {
  path: string
  chapter: number
  sessionId: string
}

const GOPRO_PATTERN = /^G[PX](\d{2})(\d{4})\.\w+$/i

function parseGoProFilename(filePath: string): GoProFile | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = GOPRO_PATTERN.exec(filename)
  if (!match) return null
  return {
    path: filePath,
    chapter: parseInt(match[1], 10),
    sessionId: match[2],
  }
}

/**
 * Sort video file paths using camera-specific naming conventions.
 *
 * When ALL files match a known camera pattern (e.g. GoPro), sort by
 * session ID then chapter number. When files are mixed or unrecognised,
 * preserve the original order.
 *
 * Does not mutate the input array.
 */
export function smartSortVideoPaths(paths: string[]): string[] {
  if (paths.length <= 1) return [...paths]

  const parsed = paths.map(parseGoProFilename)

  // Only sort if ALL files match GoPro pattern
  if (parsed.every((p): p is GoProFile => p !== null)) {
    return [...parsed]
      .sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId)
        return a.chapter - b.chapter
      })
      .map((p) => p.path)
  }

  // Unknown or mixed — preserve original order
  return [...paths]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm test -- --run apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/utils/videoFileOrder.ts apps/desktop/src/renderer/src/utils/__tests__/videoFileOrder.test.ts
git commit -m "feat(desktop): add smart video file ordering utility for GoPro chapters"
```

---

## Task 2: Inline Offset Picker Component

Extract the offset picker from a Dialog-based component into an inline (non-modal) component that can be embedded directly in the segment form.

**Files:**
- Create: `apps/desktop/src/renderer/src/components/video/InlineOffsetPicker.tsx`
- Reference: `apps/desktop/src/renderer/src/screens/wizard/steps/OffsetPickerStep.tsx` (existing Dialog version)
- Reference: `apps/desktop/src/renderer/src/components/video/FrameScrubber.tsx`

- [ ] **Step 1: Create InlineOffsetPicker component**

This component reuses the `FrameScrubber` but renders inline instead of inside a Dialog. It's a controlled component — the parent owns the frame value.

```tsx
// apps/desktop/src/renderer/src/components/video/InlineOffsetPicker.tsx
import React, { useEffect, useState } from 'react'
import { FrameScrubber } from './FrameScrubber'

interface InlineOffsetPickerProps {
  videoPath: string
  currentFrame: number
  onFrameChange: (frame: number) => void
}

export function InlineOffsetPicker({
  videoPath,
  currentFrame,
  onFrameChange,
}: InlineOffsetPickerProps): React.ReactElement {
  const [fps, setFps] = useState(30)
  const [totalFrames, setTotalFrames] = useState(0)

  useEffect(() => {
    if (!videoPath) return
    let cancelled = false
    window.racedash
      .getVideoInfo(videoPath)
      .then((info) => {
        if (cancelled) return
        setFps(info.fps)
        setTotalFrames(Math.round(info.duration * info.fps))
      })
      .catch((err: unknown) => {
        console.error('[InlineOffsetPicker] getVideoInfo failed:', err)
      })
    return () => { cancelled = true }
  }, [videoPath])

  if (!videoPath) {
    return (
      <div className="rounded-lg border border-border bg-accent/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Assign videos to this segment to set the offset
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Video offset — scrub to the moment the first lap begins
      </p>
      <FrameScrubber
        videoPath={videoPath}
        fps={fps}
        totalFrames={totalFrames}
        currentFrame={currentFrame}
        onSeek={onFrameChange}
        onMetadataLoaded={setTotalFrames}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds (component is not yet imported anywhere, so no build impact — this verifies no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/video/InlineOffsetPicker.tsx
git commit -m "feat(desktop): add inline offset picker component (non-modal FrameScrubber wrapper)"
```

---

## Task 3: Update Types — Add `videoIndices` to SegmentConfig

The new wizard needs segments to know which videos (by index in the ordered list) they contain.

**Files:**
- Modify: `apps/desktop/src/types/project.ts`

- [ ] **Step 1: Add `videoIndices` field to SegmentConfig**

Add the optional `videoIndices` field to `SegmentConfig`. This stores which videos from the project's `videoPaths` array belong to this segment. It's optional for backwards compatibility — existing projects without it assume all videos belong to all segments.

In `apps/desktop/src/types/project.ts`, add after the `videoOffsetFrame` field (line 32):

```ts
  // indices into the project's videoPaths array that belong to this segment
  videoIndices?: number[]
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm test -- --run`
Expected: All existing tests PASS (field is optional, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/types/project.ts
git commit -m "feat(desktop): add videoIndices field to SegmentConfig for per-segment video assignment"
```

---

## Task 4: NewProjectStep (Screen 1)

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/wizard/steps/NewProjectStep.tsx`
- Modify: `apps/desktop/src/renderer/src/components/video/VideoFileList.tsx` (add assignment display)

- [ ] **Step 1: Add `assignments` prop to VideoFileList**

In `apps/desktop/src/renderer/src/components/video/VideoFileList.tsx`, add an optional `assignments` prop that maps video index to a segment label string. When present, assigned videos show a badge.

Update the interface (line 4):

```ts
interface VideoFileListProps {
  paths: string[]
  onChange: (paths: string[]) => void
  /** Optional map of video index to segment label. Assigned videos show a badge. */
  assignments?: Record<number, string>
}
```

Update the component signature (line 14):

```ts
export function VideoFileList({ paths, onChange, assignments }: VideoFileListProps): React.ReactElement | null {
```

Inside the `.map` callback (after the `name` variable, around line 67), add an `assignedTo` lookup:

```ts
        const assignedTo = assignments?.[index]
```

After the fps span (line 71), add the assignment badge:

```tsx
            {assignedTo && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {assignedTo}
              </span>
            )}
```

- [ ] **Step 2: Create NewProjectStep**

```tsx
// apps/desktop/src/renderer/src/screens/wizard/steps/NewProjectStep.tsx
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { VideoFileList } from '@/components/video/VideoFileList'
import { smartSortVideoPaths } from '@/utils/videoFileOrder'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'

interface NewProjectStepProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  videoPaths: string[]
  onVideoPathsChange: (paths: string[]) => void
  saveDir: string
  onSaveDirChange: (dir: string) => void
}

/** Derive a project name from the first video filename. */
function suggestName(videoPath: string): string {
  const filename = videoPath.split(/[\\/]/).pop() ?? ''
  return filename
    .replace(/\.[^.]+$/, '')  // remove extension
    .replace(/_?\d{4}$/, '')  // remove trailing 4-digit pattern
}

export function NewProjectStep({
  projectName,
  onProjectNameChange,
  videoPaths,
  onVideoPathsChange,
  saveDir,
  onSaveDirChange,
}: NewProjectStepProps): React.ReactElement {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  async function handleBrowseVideos() {
    const selected = await window.racedash.openFiles({
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (!selected || selected.length === 0) return

    const existingSet = new Set(videoPaths)
    const newPaths = selected.filter((p) => !existingSet.has(p))
    if (newPaths.length === 0) return

    const merged = [...videoPaths, ...newPaths]
    const sorted = smartSortVideoPaths(merged)
    onVideoPathsChange(sorted)

    // Auto-suggest name from first video if name is empty
    if (!projectName && sorted.length > 0) {
      const suggested = suggestName(sorted[0])
      if (suggested) onProjectNameChange(suggested)
    }
  }

  async function handleBrowseSaveDir() {
    const dir = await window.racedash.openDirectory()
    if (dir) onSaveDirChange(dir)
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField label="Project name">
        <Input
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="e.g. Brands Hatch — March 2026"
          autoFocus
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Videos</p>
          <Button variant="outline" size="sm" onClick={handleBrowseVideos}>
            Browse files
          </Button>
        </div>

        {videoPaths.length === 0 ? (
          <button
            type="button"
            onClick={handleBrowseVideos}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <p className="text-sm font-medium text-foreground">Drop video files here</p>
            <p className="text-xs text-muted-foreground">or click to browse — .mp4, .mov</p>
          </button>
        ) : (
          <VideoFileList paths={videoPaths} onChange={onVideoPathsChange} />
        )}
      </div>

      {/* Advanced Settings accordion */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Advanced settings
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/20 p-4">
          <FormField label="Save location">
            <div className="flex gap-2">
              <Input
                value={saveDir}
                onChange={(e) => onSaveDirChange(e.target.value)}
                placeholder="~/Videos/racedash/project-name/"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleBrowseSaveDir} aria-label="Browse folder">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </FormField>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/NewProjectStep.tsx apps/desktop/src/renderer/src/components/video/VideoFileList.tsx
git commit -m "feat(desktop): add NewProjectStep — project name, video drop zone, smart sorting, advanced settings"
```

---

## Task 5: SegmentSetupStep (Screen 2)

This is the largest task. The segment setup step handles inline segment creation with video assignment, timing source, driver picker, and the inline offset picker.

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx`

- [ ] **Step 1: Create SegmentSetupStep**

This component manages the segment creation form inline (no sub-modal). It reuses existing sub-components (`ManualLapDialog`, `ManualLapSummary`, `InlineOffsetPicker`, `SegmentRow`) and adds video assignment and inline driver selection.

```tsx
// apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { SegmentConfig, TimingSource, SessionMode } from '../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { FileUpload } from '@/components/shared/FileUpload'
import { OptionGroup } from '@/components/ui/option-group'
import { ManualLapDialog, ManualLapSummary, isValidLapTime, type ManualLapEntry } from '@/components/timing/ManualLapEntry'
import { InlineOffsetPicker } from '@/components/video/InlineOffsetPicker'
import { SegmentRow } from '@/components/timing/SegmentRow'
import { Spinner } from '@/components/loaders/Spinner'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMING_SOURCES: { value: TimingSource; label: string }[] = [
  { value: 'alphaTiming', label: 'Alpha Timing' },
  { value: 'daytonaEmail', label: 'Daytona' },
  { value: 'mylapsSpeedhive', label: 'SpeedHive' },
  { value: 'teamsportEmail', label: 'TeamSport' },
  { value: 'manual', label: 'Manual' },
]

const SESSION_MODES: { value: SessionMode; label: string }[] = [
  { value: 'race', label: 'Race' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'practice', label: 'Practice' },
]

const SESSION_LABEL_PREFIX: Record<SessionMode, string> = {
  race: 'Race',
  qualifying: 'Qualifying',
  practice: 'Practice',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverEntry {
  name: string
  kart?: string
}

interface SegmentSetupStepProps {
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  onSegmentsChange: (segments: SegmentConfig[]) => void
  onSelectedDriversChange: (drivers: Record<string, string>) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultLabel(session: SessionMode, existing: SegmentConfig[]): string {
  const prefix = SESSION_LABEL_PREFIX[session]
  const count = existing.filter((s) => s.session === session).length
  return count === 0 ? prefix : `${prefix} ${count + 1}`
}

function buildSegmentConfig(draft: {
  label: string
  session: SessionMode
  source: TimingSource
  url: string
  eventId: string
  emailPath: string
  manualLaps: ManualLapEntry[]
  videoIndices: number[]
  videoOffsetFrame: number
}): SegmentConfig {
  return {
    label: draft.label.trim(),
    source: draft.source,
    session: draft.session,
    ...(draft.source === 'alphaTiming' ? { url: draft.url } : {}),
    ...(draft.source === 'mylapsSpeedhive' ? { eventId: draft.eventId } : {}),
    ...(draft.source === 'daytonaEmail' ? { emailPath: draft.emailPath } : {}),
    ...(draft.source === 'teamsportEmail' ? { emailPath: draft.emailPath } : {}),
    ...(draft.source === 'manual' ? { timingData: draft.manualLaps } : {}),
    videoOffsetFrame: draft.videoOffsetFrame,
    videoIndices: draft.videoIndices,
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceFields({
  source,
  url,
  setUrl,
  eventId,
  setEventId,
  emailPath,
  setEmailPath,
}: {
  source: TimingSource
  url: string
  setUrl: (v: string) => void
  eventId: string
  setEventId: (v: string) => void
  emailPath: string
  setEmailPath: (v: string) => void
}) {
  if (source === 'alphaTiming') {
    return (
      <FormField label="Results URL">
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </FormField>
    )
  }
  if (source === 'mylapsSpeedhive') {
    return (
      <FormField label="Event ID">
        <Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="123456" />
      </FormField>
    )
  }
  if (source === 'daytonaEmail') {
    return (
      <FormField label="Results file">
        <FileUpload accept={['eml', 'txt']} onFile={setEmailPath} value={emailPath} placeholder="Drop file here or browse" hint=".eml or .txt email export from Daytona" />
      </FormField>
    )
  }
  if (source === 'teamsportEmail') {
    return (
      <FormField label="Results file">
        <FileUpload accept={['eml']} onFile={setEmailPath} value={emailPath} placeholder="Drop file here or browse" hint=".eml email export from TeamSport" />
      </FormField>
    )
  }
  return null
}

function VideoSelector({
  videoPaths,
  selectedIndices,
  onChange,
  assignedByOtherSegments,
}: {
  videoPaths: string[]
  selectedIndices: number[]
  onChange: (indices: number[]) => void
  assignedByOtherSegments: Record<number, string>
}) {
  const selectedSet = new Set(selectedIndices)

  function toggle(index: number) {
    if (selectedSet.has(index)) {
      onChange(selectedIndices.filter((i) => i !== index))
    } else {
      onChange([...selectedIndices, index].sort((a, b) => a - b))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assign videos</p>
      {videoPaths.map((path, index) => {
        const name = path.split(/[\\/]/).pop() ?? path
        const isSelected = selectedSet.has(index)
        const assignedTo = assignedByOtherSegments[index]
        return (
          <button
            key={path}
            type="button"
            onClick={() => !assignedTo && toggle(index)}
            disabled={!!assignedTo}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10'
                : assignedTo
                  ? 'border-border bg-accent/20 opacity-50'
                  : 'border-border hover:border-primary/50 hover:bg-accent/40'
            }`}
          >
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
            <span className="flex-1 truncate font-mono text-xs text-foreground">{name}</span>
            {assignedTo && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {assignedTo}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function DriverPicker({
  segment,
  selectedDriver,
  onDriverChange,
}: {
  segment: SegmentConfig
  selectedDriver: string
  onDriverChange: (driver: string) => void
}) {
  const [drivers, setDrivers] = useState<DriverEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const fetchedRef = useRef(false)

  const fetchDrivers = useCallback(async () => {
    if (segment.source === 'manual') return
    setLoading(true)
    setError(null)
    try {
      const result = await window.racedash.previewDrivers([segment])
      const segResult = result.find((r) => r.label === segment.label) ?? result[0]
      const entries: DriverEntry[] = (segResult?.drivers ?? []).map((d) => ({
        name: d.name,
        kart: d.kartNumber,
      }))
      setDrivers(entries)
      // Auto-select if single driver
      if (entries.length === 1 && !selectedDriver) {
        onDriverChange(entries[0].name)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [segment, selectedDriver, onDriverChange])

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchDrivers()
    }
  }, [fetchDrivers])

  if (segment.source === 'manual') {
    return (
      <FormField label="Driver name">
        <Input value={selectedDriver} onChange={(e) => onDriverChange(e.target.value)} placeholder="Your name" />
      </FormField>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
        <Spinner name="checkerboard" size="1.25rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        Loading drivers…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchDrivers}>
          Retry
        </Button>
      </div>
    )
  }

  if (drivers.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-accent/40 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Driver</p>
        <p className="text-sm text-foreground">{drivers[0].name}</p>
      </div>
    )
  }

  const filtered = search
    ? drivers.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.kart?.toLowerCase().includes(search.toLowerCase()),
      )
    : drivers

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Select your driver</p>
      {drivers.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or kart…"
          className="text-xs"
        />
      )}
      <div className="max-h-36 overflow-y-auto rounded-md border border-border">
        {filtered.map((d) => (
          <button
            key={d.name}
            type="button"
            onClick={() => onDriverChange(d.name)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${
              selectedDriver === d.name ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
          >
            <span className="flex-1">{d.name}</span>
            {d.kart && <span className="text-xs text-muted-foreground">#{d.kart}</span>}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No drivers match &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type FormMode = null | { mode: 'add' } | { mode: 'edit'; index: number }

export function SegmentSetupStep({
  videoPaths,
  segments,
  selectedDrivers,
  onSegmentsChange,
  onSelectedDriversChange,
}: SegmentSetupStepProps): React.ReactElement {
  const [formMode, setFormMode] = useState<FormMode>(segments.length === 0 ? { mode: 'add' } : null)

  // --- Draft state for the inline form ---
  const [label, setLabel] = useState('')
  const [session, setSession] = useState<SessionMode>('race')
  const [source, setSource] = useState<TimingSource>('alphaTiming')
  const [url, setUrl] = useState('')
  const [eventId, setEventId] = useState('')
  const [emailPath, setEmailPath] = useState('')
  const [manualLaps, setManualLaps] = useState<ManualLapEntry[]>([])
  const [videoIndices, setVideoIndices] = useState<number[]>([])
  const [videoOffsetFrame, setVideoOffsetFrame] = useState(0)
  const [driver, setDriver] = useState('')
  const [showLapDialog, setShowLapDialog] = useState(false)

  // Pre-select all videos if this is the first segment
  useEffect(() => {
    if (formMode?.mode === 'add' && segments.length === 0 && videoPaths.length > 0 && videoIndices.length === 0) {
      setVideoIndices(videoPaths.map((_, i) => i))
    }
  }, [formMode, segments.length, videoPaths.length, videoIndices.length])

  // Auto-set label when session mode changes (only in add mode)
  useEffect(() => {
    if (formMode?.mode === 'add') {
      setLabel(makeDefaultLabel(session, segments))
    }
  }, [session, formMode, segments])

  function resetForm() {
    setLabel('')
    setSession('race')
    setSource('alphaTiming')
    setUrl('')
    setEventId('')
    setEmailPath('')
    setManualLaps([])
    setVideoIndices([])
    setVideoOffsetFrame(0)
    setDriver('')
  }

  function loadSegmentIntoDraft(seg: SegmentConfig, driverName: string) {
    setLabel(seg.label)
    setSession(seg.session ?? 'race')
    setSource(seg.source)
    setUrl(seg.url ?? '')
    setEventId(seg.eventId ?? '')
    setEmailPath(seg.emailPath ?? '')
    setManualLaps(seg.timingData ?? [])
    setVideoIndices(seg.videoIndices ?? [])
    setVideoOffsetFrame(seg.videoOffsetFrame ?? 0)
    setDriver(driverName)
  }

  function changeSource(next: TimingSource) {
    setSource(next)
    setUrl('')
    setEventId('')
    setEmailPath('')
    setManualLaps([])
    setDriver('')
  }

  // Build a map of which video indices are assigned to other segments (not the one being edited)
  const assignedByOtherSegments: Record<number, string> = {}
  segments.forEach((seg, i) => {
    if (formMode?.mode === 'edit' && formMode.index === i) return
    for (const vi of seg.videoIndices ?? []) {
      assignedByOtherSegments[vi] = seg.label
    }
  })

  // Build the SegmentConfig from current draft to pass to DriverPicker
  const draftConfig = buildSegmentConfig({
    label, session, source, url, eventId, emailPath, manualLaps, videoIndices, videoOffsetFrame,
  })

  const hasTimingData =
    (source === 'alphaTiming' && url.trim() !== '') ||
    (source === 'mylapsSpeedhive' && eventId.trim() !== '') ||
    (source === 'daytonaEmail' && emailPath !== '') ||
    (source === 'teamsportEmail' && emailPath !== '') ||
    (source === 'manual' && manualLaps.length > 0 && manualLaps.every((e) => isValidLapTime(e.time)))

  const canSave =
    label.trim() !== '' &&
    videoIndices.length > 0 &&
    hasTimingData &&
    driver.trim() !== ''

  function handleSave() {
    if (!canSave) return
    const seg = buildSegmentConfig({
      label, session, source, url, eventId, emailPath, manualLaps, videoIndices, videoOffsetFrame,
    })

    const newDrivers = { ...selectedDrivers, [seg.label]: driver }

    if (formMode?.mode === 'add') {
      onSegmentsChange([...segments, seg])
    } else if (formMode?.mode === 'edit') {
      const updated = [...segments]
      const oldLabel = segments[formMode.index].label
      if (oldLabel !== seg.label) {
        delete newDrivers[oldLabel]
      }
      updated[formMode.index] = seg
      onSegmentsChange(updated)
    }

    onSelectedDriversChange(newDrivers)
    setFormMode(null)
    resetForm()
  }

  function handleEdit(index: number) {
    const seg = segments[index]
    loadSegmentIntoDraft(seg, selectedDrivers[seg.label] ?? '')
    setFormMode({ mode: 'edit', index })
  }

  function handleDelete(index: number) {
    const seg = segments[index]
    const newDrivers = { ...selectedDrivers }
    delete newDrivers[seg.label]
    onSelectedDriversChange(newDrivers)
    onSegmentsChange(segments.filter((_, i) => i !== index))
  }

  function handleAddAnother() {
    resetForm()
    setFormMode({ mode: 'add' })
  }

  function handleCancelForm() {
    setFormMode(null)
    resetForm()
  }

  // The first video of this segment's assigned videos (for the offset picker)
  const firstVideoPath = videoIndices.length > 0 ? videoPaths[videoIndices[0]] ?? '' : ''

  // --- Render ---

  // Segment list + add button (no form open)
  if (formMode === null) {
    return (
      <div className="flex flex-col gap-4">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">No segments yet</p>
            <Button onClick={handleAddAnother}>Add a segment</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {segments.map((seg, i) => (
                <SegmentRow key={seg.label} segment={seg} index={i} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
            <Button variant="outline" onClick={handleAddAnother} className="self-start">
              + Add another segment
            </Button>
          </>
        )}
      </div>
    )
  }

  // Inline segment form
  return (
    <div className="flex flex-col gap-5">
      {segments.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start px-0 text-xs" onClick={handleCancelForm}>
          &larr; Back to segments
        </Button>
      )}

      <h2 className="text-base font-semibold text-foreground">
        {formMode.mode === 'add' ? 'Add segment' : 'Edit segment'}
      </h2>

      {/* Session mode */}
      <FormField label="Session type">
        <OptionGroup options={SESSION_MODES} value={session} onValueChange={setSession} />
      </FormField>

      {/* Segment label */}
      <FormField label="Segment label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Race 1" />
      </FormField>

      {/* Video assignment */}
      <VideoSelector
        videoPaths={videoPaths}
        selectedIndices={videoIndices}
        onChange={setVideoIndices}
        assignedByOtherSegments={assignedByOtherSegments}
      />

      {/* Timing source */}
      <FormField label="Timing source">
        <OptionGroup options={TIMING_SOURCES} value={source} onValueChange={changeSource} />
      </FormField>

      <SourceFields
        source={source}
        url={url}
        setUrl={setUrl}
        eventId={eventId}
        setEventId={setEventId}
        emailPath={emailPath}
        setEmailPath={setEmailPath}
      />

      {source === 'manual' && (
        <>
          <ManualLapSummary manualLaps={manualLaps} onEdit={() => setShowLapDialog(true)} />
          <ManualLapDialog
            open={showLapDialog}
            onOpenChange={setShowLapDialog}
            manualLaps={manualLaps}
            setManualLaps={setManualLaps}
          />
        </>
      )}

      {/* Driver selection — appears after timing data is provided */}
      {hasTimingData && (
        <DriverPicker
          segment={draftConfig}
          selectedDriver={driver}
          onDriverChange={setDriver}
        />
      )}

      {/* Offset picker — inline */}
      {videoIndices.length > 0 && (
        <InlineOffsetPicker
          videoPath={firstVideoPath}
          currentFrame={videoOffsetFrame}
          onFrameChange={setVideoOffsetFrame}
        />
      )}

      {/* Save / cancel */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!canSave}>
          {formMode.mode === 'add' ? 'Add segment' : 'Save changes'}
        </Button>
        {segments.length > 0 && (
          <Button variant="ghost" onClick={handleCancelForm}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx
git commit -m "feat(desktop): add SegmentSetupStep — inline segment creation with video assignment, driver picker, offset sync"
```

---

## Task 6: ReviewTimingStep (Screen 3)

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx`

- [ ] **Step 1: Create ReviewTimingStep**

This component provides a lap stepper to verify timing sync. It fetches laps via IPC and presents them with a prev/next stepper.

```tsx
// apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx
import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/loaders/Spinner'
import { isValidLapTime } from '@/components/timing/ManualLapEntry'
import type { SegmentConfig } from '../../../../types/project'
import type { LapPreview } from '../../../../types/ipc'

interface ReviewTimingStepProps {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
}

function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseLapTimeToSeconds(value: string): number {
  const t = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':')
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  return 0
}

function resolveManualLaps(timingData: NonNullable<SegmentConfig['timingData']>): LapPreview[] {
  return timingData
    .filter((entry) => isValidLapTime(entry.time))
    .map((entry) => ({
      number: entry.lap,
      lapTime: parseLapTimeToSeconds(entry.time),
      position: entry.position,
    }))
}

function SegmentReview({
  segment,
  selectedDriver,
}: {
  segment: SegmentConfig
  selectedDriver: string
}) {
  const [laps, setLaps] = useState<LapPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentLapIndex, setCurrentLapIndex] = useState(0)

  const fetchLaps = useCallback(async () => {
    if (segment.source === 'manual') {
      setLaps(resolveManualLaps(segment.timingData ?? []))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.racedash.previewTimestamps([segment], { [segment.label]: selectedDriver })
      const match = result.find((s) => s.label === segment.label) ?? result[0]
      setLaps(match?.laps ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [segment, selectedDriver])

  useEffect(() => {
    fetchLaps()
  }, [fetchLaps])

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
        <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        Fetching lap data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Failed to load lap data</p>
          <p className="mt-1 font-mono text-xs opacity-80">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLaps}>
          Retry
        </Button>
      </div>
    )
  }

  if (laps.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No laps found for <span className="font-medium">{selectedDriver}</span>.
      </p>
    )
  }

  const currentLap = laps[currentLapIndex]
  const bestLapTime = Math.min(...laps.map((l) => l.lapTime))
  const isBest = currentLap.lapTime === bestLapTime

  return (
    <div className="flex flex-col gap-4">
      {/* Lap stepper */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLapIndex((i) => Math.max(0, i - 1))}
            disabled={currentLapIndex === 0}
          >
            &larr; Prev
          </Button>
          <select
            value={currentLapIndex}
            onChange={(e) => setCurrentLapIndex(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {laps.map((lap, i) => (
              <option key={lap.number} value={i}>
                Lap {lap.number}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLapIndex((i) => Math.min(laps.length - 1, i + 1))}
            disabled={currentLapIndex === laps.length - 1}
          >
            Next &rarr;
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {currentLapIndex + 1} of {laps.length}
        </span>
      </div>

      {/* Current lap details */}
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lap</p>
            <p className="text-lg font-semibold text-foreground">{currentLap.number}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time</p>
            <p className={`font-mono text-lg font-semibold ${isBest ? 'text-primary' : 'text-foreground'}`}>
              {formatLapTime(currentLap.lapTime)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Position</p>
            <p className="text-lg font-semibold text-foreground">
              {currentLap.position !== undefined ? `P${currentLap.position}` : '\u2014'}
            </p>
          </div>
        </div>
        {isBest && (
          <span className="mt-2 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            BEST LAP
          </span>
        )}
      </div>
    </div>
  )
}

export function ReviewTimingStep({ segments, selectedDrivers }: ReviewTimingStepProps): React.ReactElement {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0)
  const activeSegment = segments[activeSegmentIndex]
  const activeDriver = selectedDrivers[activeSegment?.label] ?? ''

  return (
    <div className="flex flex-col gap-4">
      {/* Segment tabs/selector */}
      {segments.length > 1 && (
        <div className="flex gap-1 rounded-lg border border-border bg-accent/20 p-1">
          {segments.map((seg, i) => (
            <button
              key={seg.label}
              type="button"
              onClick={() => setActiveSegmentIndex(i)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activeSegmentIndex
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      )}

      {/* Driver info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Driver: <span className="font-medium text-foreground">{activeDriver}</span>
      </div>

      {/* Lap review */}
      {activeSegment && <SegmentReview segment={activeSegment} selectedDriver={activeDriver} />}
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx
git commit -m "feat(desktop): add ReviewTimingStep — lap stepper with position and best-lap indicators"
```

---

## Task 7: NewProjectWizard Orchestrator

Wire everything together: the 3-step wizard state machine, cancel confirmation, and the `WizardShell` integration.

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/wizard/NewProjectWizard.tsx`
- Modify: `apps/desktop/src/renderer/src/components/wizard/WizardShell.tsx`

- [ ] **Step 1: Clean up WizardShell — remove dead `title` prop**

In `apps/desktop/src/renderer/src/components/wizard/WizardShell.tsx`, remove `title: string` from `WizardShellProps`. Remove the `title` prop from the component signature and the destructuring.

- [ ] **Step 2: Create NewProjectWizard**

```tsx
// apps/desktop/src/renderer/src/screens/wizard/NewProjectWizard.tsx
import React, { useState } from 'react'
import { WizardShell } from '@/components/wizard/WizardShell'
import { NewProjectStep } from './steps/NewProjectStep'
import { SegmentSetupStep } from './steps/SegmentSetupStep'
import { ReviewTimingStep } from './steps/ReviewTimingStep'
import type { ProjectData, SegmentConfig } from '../../../types/project'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const STEPS = ['New Project', 'Segments', 'Review'] as const

interface NewProjectWizardProps {
  onComplete: (project: ProjectData) => void
  onCancel: () => void
}

interface WizardState {
  projectName: string
  videoPaths: string[]
  saveDir: string
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function NewProjectWizard({ onComplete, onCancel }: NewProjectWizardProps): React.ReactElement {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    projectName: '',
    videoPaths: [],
    saveDir: '',
    segments: [],
    selectedDrivers: {},
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const hasData = state.projectName.trim() !== '' || state.videoPaths.length > 0 || state.segments.length > 0

  const canContinue =
    (step === 0 && state.projectName.trim() !== '' && state.videoPaths.length > 0) ||
    (step === 1 && state.segments.length > 0) ||
    step === 2

  function handleCancel() {
    if (hasData) {
      setShowCancelDialog(true)
    } else {
      onCancel()
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const saveDir = state.saveDir || `~/Videos/racedash/${slugify(state.projectName)}/`
      const project = await window.racedash.createProject({
        name: state.projectName,
        videoPaths: state.videoPaths,
        segments: state.segments,
        selectedDrivers: state.selectedDrivers,
        saveDir,
      })
      onComplete(project)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <WizardShell
        steps={STEPS}
        currentStep={step + 1}
        canContinue={canContinue}
        onNext={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
        onBack={() => setStep((s) => Math.max(s - 1, 0))}
        onCancel={handleCancel}
        onSubmit={step === STEPS.length - 1 ? handleSubmit : undefined}
        submitLabel="Create Project"
        isSubmitting={isSubmitting}
      >
        {step === 0 && (
          <NewProjectStep
            projectName={state.projectName}
            onProjectNameChange={(name) => setState((s) => ({ ...s, projectName: name }))}
            videoPaths={state.videoPaths}
            onVideoPathsChange={(paths) => setState((s) => ({ ...s, videoPaths: paths }))}
            saveDir={state.saveDir}
            onSaveDirChange={(dir) => setState((s) => ({ ...s, saveDir: dir }))}
          />
        )}
        {step === 1 && (
          <SegmentSetupStep
            videoPaths={state.videoPaths}
            segments={state.segments}
            selectedDrivers={state.selectedDrivers}
            onSegmentsChange={(segments) => setState((s) => ({ ...s, segments }))}
            onSelectedDriversChange={(drivers) => setState((s) => ({ ...s, selectedDrivers: drivers }))}
          />
        )}
        {step === 2 && (
          <>
            <ReviewTimingStep segments={state.segments} selectedDrivers={state.selectedDrivers} />
            {submitError && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p className="font-medium">Failed to create project</p>
                <p className="mt-1 font-mono text-xs opacity-80">{submitError}</p>
              </div>
            )}
          </>
        )}
      </WizardShell>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard project?</AlertDialogTitle>
            <AlertDialogDescription>You&apos;ll lose all progress on this project.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/NewProjectWizard.tsx apps/desktop/src/renderer/src/components/wizard/WizardShell.tsx
git commit -m "feat(desktop): add NewProjectWizard — 3-step orchestrator with cancel confirmation"
```

---

## Task 8: Wire Up — Replace Old Wizard in App.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Swap the import and usage**

In `apps/desktop/src/renderer/src/App.tsx`:

Replace the import (line 3):
```ts
import { ProjectCreationWizard } from '@/screens/wizard/ProjectCreationWizard'
```
with:
```ts
import { NewProjectWizard } from '@/screens/wizard/NewProjectWizard'
```

Replace the usage (lines 62-64):
```tsx
        {wizardOpen && (
          <ProjectCreationWizard onComplete={handleProjectCreated} onCancel={() => setWizardOpen(false)} />
```
with:
```tsx
        {wizardOpen && (
          <NewProjectWizard onComplete={handleProjectCreated} onCancel={() => setWizardOpen(false)} />
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm test -- --run`
Expected: All tests PASS. The old wizard files still exist (not yet deleted) but are no longer imported.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx
git commit -m "feat(desktop): wire NewProjectWizard into App, replacing ProjectCreationWizard"
```

---

## Task 9: Manual Smoke Test

Before deleting old files, manually verify the new wizard works end-to-end.

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop dev`

- [ ] **Step 2: Test the happy path**

1. Click "New Project" in the project library
2. Verify Screen 1: type a project name, browse/add video files, confirm smart sort if GoPro chapters
3. Click Continue -> verify Screen 2: add a segment (session mode, assign videos, timing source, driver, offset)
4. Click Continue -> verify Screen 3: lap stepper shows laps, can navigate prev/next
5. Click "Create Project" -> verify project opens in editor

- [ ] **Step 3: Test cancel behavior**

1. Start a new project, enter a name
2. Click cancel -> verify "Discard project?" dialog appears
3. Click "Keep editing" -> verify you stay in the wizard
4. Click cancel again -> "Discard" -> verify wizard closes

- [ ] **Step 4: Test edge cases**

1. Start a new project with no data -> cancel -> verify it dismisses silently (no dialog)
2. Add multiple videos -> verify reorder buttons work
3. Add a segment, try to continue without filling all fields -> verify Continue is disabled
4. Add 2 segments using different videos -> verify video assignment exclusion works

---

## Task 10: Delete Old Wizard Files

Only proceed after successful smoke test.

**Files to delete:**
- `apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx`
- `apps/desktop/src/renderer/src/screens/wizard/steps/VideosStep.tsx`
- `apps/desktop/src/renderer/src/screens/wizard/steps/ConfirmStep.tsx`
- `apps/desktop/src/renderer/src/screens/wizard/steps/DriverStep.tsx`
- `apps/desktop/src/renderer/src/screens/wizard/steps/VerifyStep.tsx`

- [ ] **Step 1: Check for remaining imports of files to delete**

Run:
```bash
cd /Users/g30r93g/Projects/racedash
grep -r "ProjectCreationWizard\|from.*VideosStep\|from.*ConfirmStep\|from.*DriverStep\|from.*VerifyStep" apps/desktop/src/renderer/src/ --include="*.tsx" --include="*.ts" -l
```

Expected: Only the files being deleted should appear. If `ProjectEditWizard.tsx` imports `DriverStep` or `VerifyStep`, those files must NOT be deleted — or `ProjectEditWizard` must be updated first.

- [ ] **Step 2: Check ProjectEditWizard dependencies**

Run:
```bash
grep -n "import.*from.*steps/" apps/desktop/src/renderer/src/screens/wizard/ProjectEditWizard.tsx
```

If `ProjectEditWizard` imports any of the files to be deleted, keep those files and only delete the ones with no remaining consumers. Adapt the `rm` commands below accordingly.

- [ ] **Step 3: Delete the files (only those with no remaining consumers)**

```bash
cd /Users/g30r93g/Projects/racedash
rm apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx
rm apps/desktop/src/renderer/src/screens/wizard/steps/VideosStep.tsx
rm apps/desktop/src/renderer/src/screens/wizard/steps/ConfirmStep.tsx
# Only delete these if Step 2 confirmed no other consumers:
# rm apps/desktop/src/renderer/src/screens/wizard/steps/DriverStep.tsx
# rm apps/desktop/src/renderer/src/screens/wizard/steps/VerifyStep.tsx
```

- [ ] **Step 4: Verify build and tests pass**

Run: `cd /Users/g30r93g/Projects/racedash && pnpm --filter desktop build 2>&1 | tail -20 && pnpm test -- --run`
Expected: Build succeeds, all tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(desktop): remove old 5-step wizard files replaced by NewProjectWizard"
```

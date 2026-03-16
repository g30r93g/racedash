# App Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the top-level routing skeleton, macOS drag region, `ProjectData` type, project IPC stubs, and implemented file-dialog IPC handlers that all subsequent desktop sub-plans depend on.

**Architecture:** `App.tsx` holds a single piece of state (`ProjectData | null`) and renders either `<ProjectLibrary>` or `<Editor>` — both are placeholder components filled by later sub-plans. All IPC channels are registered in the main process and exposed through the contextBridge preload; file-dialog and `checkFfmpeg` channels are fully implemented here because every subsequent sub-plan calls them.

**Tech Stack:** Electron 33, React 18, shadcn/ui, Tailwind CSS v4, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/types/project.ts` | `ProjectData`, `SegmentConfig`, `TimingSource`, `CreateProjectOpts` types |
| Modify | `apps/desktop/src/types/ipc.ts` | Add `CreateProjectOpts`; extend `RacedashAPI` with `listProjects`, `openProject`, `createProject` |
| Modify | `apps/desktop/src/main/ipc.ts` | Implement `checkFfmpeg`, `openFile`, `openFiles`, `openDirectory`, `revealInFinder`; add stubs for `listProjects`, `openProject`, `createProject` |
| Modify | `apps/desktop/src/preload/index.ts` | Wire `listProjects`, `openProject`, `createProject` channels |
| Modify | `apps/desktop/src/renderer/src/App.tsx` | Top-level routing skeleton + macOS drag region |
| Create | `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx` | Placeholder screen component |
| Create | `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` | Placeholder screen component |
| Create | `apps/desktop/src/main/__tests__/ipc.checkFfmpeg.test.ts` | Unit tests for `checkFfmpeg` |

---

## Chunk 1: ProjectData Types

**Files:**
- Create: `apps/desktop/src/types/project.ts`
- Modify: `apps/desktop/src/types/ipc.ts`

### Task 1: Create `project.ts` with domain types

- [ ] **Step 1: Create the file**

Create `apps/desktop/src/types/project.ts` with the following content:

```ts
export type TimingSource =
  | 'alpha-timing'
  | 'speedhive'
  | 'daytona'
  | 'teamsport'
  | 'manual'

export interface SegmentConfig {
  label: string
  source: TimingSource
  resultsUrl?: string        // alpha-timing
  eventId?: string           // speedhive
  session?: string           // speedhive
  resultsFilePath?: string   // daytona, teamsport
  sessionName?: string       // speedhive, daytona, teamsport
  videoOffsetFrame?: number  // all sources
}

export interface ProjectData {
  name: string
  projectPath: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}

export interface CreateProjectOpts {
  name: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}
```

- [ ] **Step 2: Extend `ipc.ts` with project API types**

In `apps/desktop/src/types/ipc.ts`:

1. Add the import at the top of the file (before the existing content):

```ts
import type { ProjectData, CreateProjectOpts } from './project'
```

2. Add a new `// Projects` section to `RacedashAPI`, inserting it after the `revealInFinder` line and before the `// Engine — Timing tab` comment:

```ts
  // Projects
  listProjects(): Promise<ProjectData[]>
  openProject(projectPath: string): Promise<ProjectData>
  createProject(opts: CreateProjectOpts): Promise<ProjectData>
```

The resulting `RacedashAPI` interface section ordering should be:
- `// System` → `checkFfmpeg`
- `// File dialogs` → `openFile`, `openFiles`, `openDirectory`, `revealInFinder`
- `// Projects` → `listProjects`, `openProject`, `createProject`
- `// Engine — Timing tab` (existing, unchanged)
- `// Engine — Export tab` (existing, unchanged)
- `// Render progress events` (existing, unchanged)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit`

Expected: No errors. If there are errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/types/project.ts apps/desktop/src/types/ipc.ts
git commit -m "feat(desktop): add ProjectData types and project IPC API surface"
```

---

> Dispatch plan-document-reviewer for Chunk 1 before proceeding to Chunk 2.
> Spec: `/Users/g30r93g/Projects/racedash/.worktrees/desktop-app/docs/superpowers/plans/2026-03-16-desktop-app-shell.md`

---

## Chunk 2: IPC Handler Implementations and Stubs

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/main/__tests__/ipc.checkFfmpeg.test.ts`

### Task 2: Implement file-dialog and system IPC handlers

The current `ipc.ts` uses a single `stub` helper for all channels. This task replaces the five file-dialog/system channels with real implementations and adds three new project stubs.

**Note on `execSync` usage:** `checkFfmpegImpl` calls `execSync('which ffmpeg')` with a hardcoded string — no user input is involved, so there is no shell injection risk. The desktop package does not have an `execFileNoThrow` utility; using `execSync` directly is correct here.

- [ ] **Step 1: Write the failing test for `checkFfmpeg`**

Create `apps/desktop/src/main/__tests__/ipc.checkFfmpeg.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'node:child_process'

// We test the handler logic in isolation by importing the exported helper.
import { checkFfmpegImpl } from '../ipc'

vi.mock('node:child_process')

describe('checkFfmpegImpl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns found=true with path when ffmpeg is on PATH', () => {
    vi.spyOn(childProcess, 'execSync').mockReturnValue(
      Buffer.from('/usr/local/bin/ffmpeg\n')
    )
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/usr/local/bin/ffmpeg' })
    expect(childProcess.execSync).toHaveBeenCalledWith('which ffmpeg')
  })

  it('returns found=false when ffmpeg is not on PATH', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('not found')
    })
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: false })
  })

  it('trims whitespace from the path', () => {
    vi.spyOn(childProcess, 'execSync').mockReturnValue(
      Buffer.from('  /opt/homebrew/bin/ffmpeg  \n')
    )
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/opt/homebrew/bin/ffmpeg' })
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: FAIL — `checkFfmpegImpl` is not exported from `../ipc`.

- [ ] **Step 3: Rewrite `ipc.ts` with implementations**

Replace the entire contents of `apps/desktop/src/main/ipc.ts` with:

```ts
import { ipcMain, dialog, shell } from 'electron'
import { execSync } from 'node:child_process'
import type { FfmpegStatus, OpenFileOptions, OpenDirectoryOptions } from '../types/ipc'

// ---------------------------------------------------------------------------
// Exported implementation helpers (used by tests)
// ---------------------------------------------------------------------------

/**
 * Checks whether ffmpeg is available on PATH.
 * Uses execSync with a hardcoded string — no user input, no injection risk.
 */
export function checkFfmpegImpl(): FfmpegStatus {
  try {
    const raw = execSync('which ffmpeg').toString().trim()
    return { found: true, path: raw }
  } catch {
    return { found: false }
  }
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const stub = (channel: string) => () => {
  throw new Error(`IPC handler not implemented: ${channel}`)
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerIpcHandlers(): void {
  // System
  ipcMain.handle('racedash:checkFfmpeg', () => checkFfmpegImpl())

  // File dialogs
  ipcMain.handle('racedash:openFile', async (_event, opts: OpenFileOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: ['openFile'],
    })
    return canceled ? undefined : filePaths[0]
  })

  ipcMain.handle('racedash:openFiles', async (_event, opts: OpenFileOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: ['openFile', 'multiSelections'],
    })
    return canceled ? undefined : filePaths
  })

  ipcMain.handle('racedash:openDirectory', async (_event, opts: OpenDirectoryOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      properties: ['openDirectory'],
    })
    return canceled ? undefined : filePaths[0]
  })

  ipcMain.handle('racedash:revealInFinder', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  // Projects (stubs — implemented in Project Library sub-plan)
  ipcMain.handle('racedash:listProjects',  stub('listProjects'))
  ipcMain.handle('racedash:openProject',   stub('openProject'))
  ipcMain.handle('racedash:createProject', stub('createProject'))

  // Timing (stub — implemented in Timing tab sub-plan)
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))

  // Export (stub — implemented in Export tab sub-plan)
  ipcMain.handle('racedash:getVideoInfo',  stub('getVideoInfo'))
  ipcMain.handle('racedash:startRender',   stub('startRender'))
  ipcMain.handle('racedash:cancelRender',  stub('cancelRender'))
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All 3 `checkFfmpegImpl` tests PASS.

- [ ] **Step 5: Wire the three new project channels in the preload**

In `apps/desktop/src/preload/index.ts`, update the existing import line from:

```ts
import type { RacedashAPI, RenderCompleteResult } from '../types/ipc'
```

to:

```ts
import type { RacedashAPI, RenderCompleteResult } from '../types/ipc'
import type { ProjectData, CreateProjectOpts } from '../types/project'
```

Then add three entries to the `api` object. Insert them after the `revealInFinder` entry and before `listDrivers`:

```ts
  listProjects: () =>
    ipcRenderer.invoke('racedash:listProjects'),
  openProject: (projectPath: ProjectData['projectPath']) =>
    ipcRenderer.invoke('racedash:openProject', projectPath),
  createProject: (opts: CreateProjectOpts) =>
    ipcRenderer.invoke('racedash:createProject', opts),
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/main/ipc.ts \
        apps/desktop/src/main/__tests__/ipc.checkFfmpeg.test.ts \
        apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): implement file-dialog IPC handlers and add project channel stubs"
```

---

> Dispatch plan-document-reviewer for Chunk 2 before proceeding to Chunk 3.
> Spec: `/Users/g30r93g/Projects/racedash/.worktrees/desktop-app/docs/superpowers/plans/2026-03-16-desktop-app-shell.md`

---

## Chunk 3: Renderer — Routing Skeleton and macOS Drag Region

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`
- Create: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`

**Import convention for shared types:** `src/types/` is included in `tsconfig.web.json` directly. Renderer files import shared types using plain relative paths, not the `@/` alias. The alias `@/` only covers `src/renderer/src/*`. Use:
- From `src/renderer/src/screens/*.tsx`: `../../../types/project`
- From `src/renderer/src/screens/editor/*.tsx`: `../../../../types/project`
- From `src/renderer/src/App.tsx`: `../../types/project`

### Task 3: Create placeholder screen components

- [ ] **Step 1: Create `ProjectLibrary.tsx`**

Create `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`:

```tsx
import React from 'react'
import type { ProjectData } from '../../../types/project'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
}

export function ProjectLibrary(_props: ProjectLibraryProps): React.ReactElement {
  return <div>Project Library</div>
}
```

- [ ] **Step 2: Create `Editor.tsx`**

Create `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`:

```tsx
import React from 'react'
import type { ProjectData } from '../../../../types/project'

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor(_props: EditorProps): React.ReactElement {
  return <div>Editor</div>
}
```

### Task 4: Replace `App.tsx` with the routing skeleton and drag region

The current `App.tsx` renders a hardcoded two-pane editor layout. Replace it with top-level state-based routing and a drag region wrapper that gives macOS traffic lights clearance.

The drag region is a fixed 36px-tall `<div>` at the top of the window with `-webkit-app-region: drag`. It must live in `App.tsx` — not inside any individual screen — so it persists across screen transitions. All interactive elements inside any screen that need to overlay this region must override with `-webkit-app-region: no-drag` (not needed for the placeholders, but noted here for subsequent sub-plans).

- [ ] **Step 3: Replace `App.tsx`**

Replace the entire contents of `apps/desktop/src/renderer/src/App.tsx` with:

```tsx
import React, { useState } from 'react'
import type { ProjectData } from '../../types/project'
import { ProjectLibrary } from '@/screens/ProjectLibrary'
import { Editor } from '@/screens/editor/Editor'

export function App(): React.ReactElement {
  const [project, setProject] = useState<ProjectData | null>(null)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* macOS traffic light clearance + window drag region.
          36px matches the hiddenInset inset on macOS. */}
      <div
        className="h-9 w-full shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Screen content — fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {project ? (
          <Editor project={project} onClose={() => setProject(null)} />
        ) : (
          <ProjectLibrary onOpen={setProject} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop exec tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Run the tests**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All 3 `checkFfmpegImpl` tests PASS, no new failures.

- [ ] **Step 6: Commit**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/desktop-app
git add apps/desktop/src/renderer/src/App.tsx \
        apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx \
        apps/desktop/src/renderer/src/screens/editor/Editor.tsx
git commit -m "feat(desktop): add routing skeleton, drag region, and placeholder screens"
```

---

> Dispatch plan-document-reviewer for Chunk 3 before proceeding.
> Spec: `/Users/g30r93g/Projects/racedash/.worktrees/desktop-app/docs/superpowers/plans/2026-03-16-desktop-app-shell.md`

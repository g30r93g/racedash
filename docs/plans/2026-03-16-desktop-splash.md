# Splash / Project Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Project Library screen — the first screen the user sees on launch — including a project card grid, sidebar nav, and the two IPC handlers that back it (`listProjects`, `openProject`).

**Architecture:** The renderer screen (`ProjectLibrary.tsx`) calls `window.racedash.listProjects()` on mount via a `useEffect`, renders results as a 3-column card grid, and calls `onOpen(projectData)` when a card is clicked (which triggers top-level routing in `App.tsx` to switch to the Editor). The main-process IPC handlers scan `~/Videos/racedash/` for subdirectories containing `project.json` and parse them into `ProjectData` objects.

**Tech Stack:** Electron 33, React 18, shadcn/ui, Tailwind CSS v4, TypeScript

**Prerequisite:** Sub-plan 1 (App Shell) must be complete. The following must already exist:
- `App.tsx` routes between `<ProjectLibrary onOpen={setProject} />` and `<Editor>`
- `src/screens/ProjectLibrary.tsx` placeholder (`<div>Project Library</div>`)
- `src/types/project.ts` with `ProjectData` and `SegmentConfig`
- IPC stubs for `racedash:listProjects`, `racedash:openProject`, `racedash:createProject`
- `window.racedash` API surface including `listProjects` and `openProject`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/desktop/src/main/ipc.ts` | Modify | Implement `listProjects` and `openProject` handlers |
| `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx` | Modify | Full Project Library UI: sidebar + project grid |
| `apps/desktop/src/renderer/src/App.tsx` | Modify | Wire `onNew` prop — log to console for now |
| `apps/desktop/src/main/ipc.test.ts` | Create | Unit tests for `listProjects` and `openProject` handlers |

---

## Chunk 1: IPC Handlers

### Task 1: Implement `listProjects` and `openProject` in `ipc.ts`

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/ipc.test.ts`

The two handlers:

**`racedash:listProjects`**: Uses `app.getPath('home')` to find `~/Videos/racedash/`. Reads subdirectory names with `fs.readdirSync`. For each subdirectory, checks whether `<subdir>/project.json` exists. If it does, reads and parses it (wrapping in try/catch — skip entries that fail to parse) and pushes the result onto a result array. Returns the array (possibly empty).

**`racedash:openProject`**: Receives a single argument `projectPath: string` (absolute path to a `project.json` file). Reads the file synchronously, parses JSON, and returns the result as `ProjectData`. Throws if the file is missing or malformed — the renderer handles the error.

- [ ] **Step 1: Write the failing tests for `listProjects` — empty directory returns `[]`**

Create `apps/desktop/src/main/ipc.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn() },
}))

// We test the handler functions directly, not via ipcMain.
// Import handlers after mocking.
import { listProjectsHandler, openProjectHandler } from './ipc'

describe('listProjectsHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when the racedash directory does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test — verify it fails (function not exported yet)**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: FAIL — `listProjectsHandler` is not a named export from `./ipc`

- [ ] **Step 3: Write all remaining failing tests**

Extend `apps/desktop/src/main/ipc.test.ts` to the full test suite:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
}))

import { listProjectsHandler, openProjectHandler } from './ipc'

const FAKE_HOME = '/Users/testuser'
const FAKE_RACEDASH_DIR = `${FAKE_HOME}/Videos/racedash`

const SAMPLE_PROJECT = {
  name: 'Test Race',
  projectPath: `${FAKE_RACEDASH_DIR}/test-race/project.json`,
  videoPaths: ['/path/to/video.mp4'],
  segments: [],
  selectedDriver: 'G. Gorzynski',
}

describe('listProjectsHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when the racedash directory does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('returns [] when the racedash directory exists but has no subdirectories', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readdirSync').mockReturnValue([] as unknown as fs.Dirent[])

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('returns a parsed ProjectData when a valid project.json is found', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // The racedash dir itself and the project.json file both exist
      return p === FAKE_RACEDASH_DIR || p === `${FAKE_RACEDASH_DIR}/test-race/project.json`
    })
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['test-race'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAMPLE_PROJECT))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(SAMPLE_PROJECT)
  })

  it('skips entries that fail to parse as JSON', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p === FAKE_RACEDASH_DIR || p === `${FAKE_RACEDASH_DIR}/bad-project/project.json`
    })
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['bad-project'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('NOT VALID JSON')

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('skips entries that are files (not directories)', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['some-file.txt'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })
})

describe('openProjectHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads and returns parsed ProjectData from the given path', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAMPLE_PROJECT))

    const result = await openProjectHandler(SAMPLE_PROJECT.projectPath)

    expect(result).toEqual(SAMPLE_PROJECT)
  })

  it('throws when the file does not exist', async () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    await expect(openProjectHandler('/nonexistent/project.json')).rejects.toThrow('ENOENT')
  })

  it('throws when the file contains invalid JSON', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not json')

    await expect(openProjectHandler('/some/project.json')).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run the tests — verify they all fail**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: FAIL — `listProjectsHandler` and `openProjectHandler` are not exported

- [ ] **Step 5: Implement the handlers in `ipc.ts`**

Replace the contents of `apps/desktop/src/main/ipc.ts`:

```typescript
import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ProjectData } from '../types/project'

// ---------------------------------------------------------------------------
// Exported handler functions — tested in isolation
// ---------------------------------------------------------------------------

export async function listProjectsHandler(): Promise<ProjectData[]> {
  const racedashDir = path.join(app.getPath('home'), 'Videos', 'racedash')

  if (!fs.existsSync(racedashDir)) {
    return []
  }

  const entries = fs.readdirSync(racedashDir) as string[]
  const projects: ProjectData[] = []

  for (const entry of entries) {
    const entryPath = path.join(racedashDir, entry)

    try {
      const stat = fs.statSync(entryPath)
      if (!stat.isDirectory()) continue

      const projectJsonPath = path.join(entryPath, 'project.json')
      if (!fs.existsSync(projectJsonPath)) continue

      const raw = fs.readFileSync(projectJsonPath, 'utf-8') as string
      const data = JSON.parse(raw) as ProjectData
      projects.push(data)
    } catch {
      // Skip entries that can't be read or parsed
    }
  }

  return projects
}

export async function openProjectHandler(projectPath: string): Promise<ProjectData> {
  const raw = fs.readFileSync(projectPath, 'utf-8') as string
  return JSON.parse(raw) as ProjectData
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

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
  ipcMain.handle('racedash:getVideoInfo',       stub('getVideoInfo'))
  ipcMain.handle('racedash:startRender',        stub('startRender'))
  ipcMain.handle('racedash:cancelRender',       stub('cancelRender'))

  ipcMain.handle('racedash:listProjects', () => listProjectsHandler())
  ipcMain.handle('racedash:createProject', stub('createProject'))
  ipcMain.handle('racedash:openProject',  (_event, projectPath: string) =>
    openProjectHandler(projectPath)
  )
}
```

- [ ] **Step 6: Run the tests — verify they all pass**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/main/ipc.ts \
  apps/desktop/src/main/ipc.test.ts
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): implement listProjects and openProject IPC handlers"
```

> Dispatch plan-document-reviewer for this chunk before proceeding.

---

## Chunk 2: App.tsx — Add `onNew` Wiring

### Task 2: Update `App.tsx` to handle the New Project button

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

The App Shell sub-plan created routing between `<ProjectLibrary onOpen={setProject} />` and `<Editor>`. This task wires up the `onNew` prop so that `ProjectLibrary` can signal that the user wants to create a new project. For now, `onNew` simply logs to console — the wizard is wired up in sub-plan 3.

At this stage `App.tsx` from the App Shell should already hold something like:

```tsx
const [project, setProject] = useState<ProjectData | null>(null)

return project
  ? <Editor project={project} onClose={() => setProject(null)} />
  : <ProjectLibrary onOpen={setProject} />
```

We need to add `onNew` to the `ProjectLibrary` call:

- [ ] **Step 1: Update `App.tsx` to pass `onNew` to `ProjectLibrary`**

In `apps/desktop/src/renderer/src/App.tsx`, locate the `<ProjectLibrary onOpen={setProject} />` call and replace it:

```tsx
<ProjectLibrary
  onOpen={setProject}
  onNew={() => {
    // Wizard not yet implemented — sub-plan 3 will replace this
    console.log('[racedash] new project requested')
  }}
/>
```

**IMPORTANT — read App.tsx before editing.** The App Shell sub-plan already rewrote `App.tsx`. Do not paste a full replacement blindly. Instead:

1. Open `apps/desktop/src/renderer/src/App.tsx` and read its current contents.
2. Find the existing `<ProjectLibrary onOpen={setProject} />` JSX expression (it may be a single line or multi-line).
3. Replace only that expression with the multi-prop version shown below.
4. Leave all other code in the file untouched.

The updated `<ProjectLibrary>` call:

```tsx
<ProjectLibrary
  onOpen={setProject}
  onNew={() => {
    // Wizard not yet implemented — sub-plan 3 will replace this
    console.log('[racedash] new project requested')
  }}
/>
```

If `App.tsx` already has an `onNew` prop on `<ProjectLibrary>`, skip this step entirely.

- [ ] **Step 2: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/renderer/src/App.tsx
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): wire onNew prop in App.tsx for future wizard"
```

> Dispatch plan-document-reviewer for this chunk before proceeding.

---

## Chunk 3: ProjectLibrary Screen

### Task 3: Implement the full Project Library UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`

This is a presentational component with one side-effect: calling `window.racedash.listProjects()` on mount. It receives two props:

```ts
interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}
```

The component layout:

```
┌─────────────────────────────────────────────────────────┐  ← dark full-window backdrop
│                                                         │
│   ┌───────────────────────────────────────────────────┐ │  ← centred card ~1050×650
│   │ sidebar (190px) │ main content area               │ │
│   │                 │                                 │ │
│   │ Logo            │ "Projects"  [+ New RaceDash...] │ │
│   │                 │                                 │ │
│   │ • Projects ←    │  [card] [card] [card]           │ │
│   │   active        │  [card] [card] ...              │ │
│   │ • Cloud Renders │                                 │ │
│   │ • Account       │  (empty state if no projects)   │ │
│   │                 │                                 │ │
│   │ ─────────────── │                                 │ │
│   │ GG  G. Gorz...  │                                 │ │
│   │     PRO badge   │                                 │ │
│   └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Opening a project: calls `window.racedash.openProject(project.projectPath)` then `onOpen(projectData)`.

Error handling: if `openProject` throws, log the error and show nothing (the library stays visible). Loading state: show a subtle spinner or skeleton in the grid while `listProjects` is in flight.

- [ ] **Step 1: Implement `ProjectLibrary.tsx`**

Replace the placeholder at `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx` with the full implementation:

```tsx
import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../types/project'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <div className="flex w-[190px] shrink-0 flex-col bg-[#161616] px-3 py-4">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-2 px-2">
        {/* Placeholder logo mark: blue checkmark circle */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2.5 7L5.5 10L11.5 4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-sm font-bold text-white">Racedash</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {/* Projects — active */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md bg-white/10 px-2.5 py-2 text-left text-sm font-medium text-white"
          disabled
        >
          <FolderIcon />
          Projects
        </button>

        {/* Cloud Renders — disabled stub */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-white/40"
          disabled
          title="Coming soon"
        >
          <CloudIcon />
          <span className="flex-1">Cloud Renders</span>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/30">
            0
          </span>
        </button>

        {/* Account — disabled stub */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-white/40"
          disabled
          title="Coming soon"
        >
          <AccountIcon />
          Account
        </button>
      </nav>

      {/* User profile — static placeholder */}
      <div className="mt-4 flex items-center gap-2.5 rounded-md px-2.5 py-2">
        {/* Avatar */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[11px] font-bold text-white">
          GG
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">G. Gorzynski</p>
          <p className="truncate text-[10px] text-blue-400">Racedash Cloud PRO</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: ProjectData
  onOpen: (project: ProjectData) => void
}

function ProjectCard({ project, onOpen }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (loading) return
    setLoading(true)
    try {
      const loaded = await window.racedash.openProject(project.projectPath)
      onOpen(loaded)
    } catch (err) {
      console.error('[racedash] failed to open project', err)
      setLoading(false)
    }
  }

  // Extract an approximate "last opened" date from the projectPath directory mtime
  // (we don't store a timestamp in ProjectData yet; use a placeholder)
  const dateLabel = `Opened ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`

  return (
    <button
      className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#1f1f1f] text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
      onClick={handleClick}
      disabled={loading}
    >
      {/* Thumbnail */}
      <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin text-white/50"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="white" fillOpacity="0.7" />
            </svg>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-white">{project.name}</p>
        <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-white/40">No projects yet. Create your first project.</p>
      <button
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        onClick={onNew}
      >
        + New RaceDash Project
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[158px] animate-pulse rounded-lg bg-white/5"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function ProjectLibrary({ onOpen, onNew }: ProjectLibraryProps): React.ReactElement {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.racedash
      .listProjects()
      .then((result) => {
        setProjects(result)
      })
      .catch((err) => {
        console.error('[racedash] failed to list projects', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    /* Full-window dark backdrop */
    <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
      {/* Centred card */}
      <div className="flex h-[650px] w-[1050px] overflow-hidden rounded-xl bg-[#1c1c1c] shadow-2xl">
        <Sidebar onNew={onNew} />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
          {/* Header row */}
          <div className="mb-6 flex shrink-0 items-center justify-between">
            <h1 className="text-lg font-semibold text-white">Projects</h1>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              onClick={onNew}
            >
              + New RaceDash Project
            </button>
          </div>

          {/* Content area */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {loading ? (
              <LoadingSkeleton />
            ) : projects.length === 0 ? (
              <EmptyState onNew={onNew} />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.projectPath}
                    project={project}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icon components (inline SVG — no external icon lib required)
// ---------------------------------------------------------------------------

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.879C6.144 2.5 6.398 2.605 6.586 2.793L7.207 3.414C7.395 3.602 7.649 3.707 7.914 3.707H12.5C13.052 3.707 13.5 4.155 13.5 4.707V11.5C13.5 12.052 13.052 12.5 12.5 12.5H2.5C1.948 12.5 1.5 12.052 1.5 11.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function CloudIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4.5 10.5C3.119 10.5 2 9.381 2 8C2 6.753 2.887 5.713 4.07 5.53C4.285 3.83 5.737 2.5 7.5 2.5C9.157 2.5 10.539 3.679 10.893 5.235C12.1 5.416 13 6.454 13 7.5C13 8.881 11.881 10.5 10.5 10.5H4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function AccountIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M2 13C2 10.791 4.462 9 7.5 9C10.538 9 13 10.791 13 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All tests PASS, no TypeScript errors from the new file

- [ ] **Step 3: Confirm `window.racedash` has `listProjects` and `openProject` in the type**

Open `apps/desktop/src/types/ipc.ts`. The `RacedashAPI` interface must include:

```ts
listProjects(): Promise<ProjectData[]>
openProject(projectPath: string): Promise<ProjectData>
```

If these are missing (they should have been added in the App Shell sub-plan), add them now. Also confirm `apps/desktop/src/renderer/src/env.d.ts` augments `Window` with `racedash: RacedashAPI`.

If `RacedashAPI` is missing `listProjects` / `openProject`, add them to `apps/desktop/src/types/ipc.ts`:

```ts
// In the RacedashAPI interface, add:
listProjects(): Promise<ProjectData[]>
openProject(projectPath: string): Promise<ProjectData>
```

And add the import for `ProjectData` at the top of `ipc.ts` if not already present:

```ts
import type { ProjectData } from '../types/project'
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx \
  apps/desktop/src/types/ipc.ts
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): implement Project Library screen"
```

> Dispatch plan-document-reviewer for this chunk before proceeding.

---

## Chunk 4: Preload Wiring + Final Smoke Test

### Task 4: Ensure preload exposes `listProjects` and `openProject`

**Files:**
- Modify: `apps/desktop/src/preload/index.ts` (if stubs are missing)

The App Shell sub-plan should have added `listProjects` and `openProject` to the preload. Verify and add if missing.

- [ ] **Step 1: Check preload for `listProjects` and `openProject`**

Open `apps/desktop/src/preload/index.ts`. Confirm these two entries exist in the `api` object:

```ts
listProjects: () =>
  ipcRenderer.invoke('racedash:listProjects'),
openProject: (projectPath: string) =>
  ipcRenderer.invoke('racedash:openProject', projectPath),
```

If either is missing, add them inside the `api` object alongside the other entries. The `api` object must match the `RacedashAPI` interface.

- [ ] **Step 2: Run tests one final time**

Run: `pnpm --dir /Users/g30r93g/Projects/racedash/.worktrees/desktop-app --filter @racedash/desktop test`

Expected: All tests PASS

- [ ] **Step 3: Commit (only if preload was changed)**

```bash
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app add \
  apps/desktop/src/preload/index.ts
git -C /Users/g30r93g/Projects/racedash/.worktrees/desktop-app commit -m "feat(desktop): add listProjects and openProject to preload API"
```

> Dispatch plan-document-reviewer for this chunk before proceeding.

---

## Summary

After all chunks are complete:

| File | Change |
|------|--------|
| `apps/desktop/src/main/ipc.ts` | `listProjectsHandler` and `openProjectHandler` implemented and registered |
| `apps/desktop/src/main/ipc.test.ts` | 8 unit tests covering both handlers |
| `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx` | Full Project Library UI |
| `apps/desktop/src/renderer/src/App.tsx` | `onNew` prop wired (console.log stub) |
| `apps/desktop/src/preload/index.ts` | `listProjects` and `openProject` exposed (verified/added) |

The app now shows the Project Library on launch. Projects in `~/Videos/racedash/` appear as cards. Clicking a card opens the project and switches to the Editor. Clicking "+ New RaceDash Project" logs to console (wizard comes in sub-plan 3).

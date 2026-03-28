# Project Registry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `~/Videos/racedash` directory scan in `listProjectsHandler` with a persistent JSON registry so projects saved to any custom directory are always discoverable.

**Architecture:** A new `projectRegistry.ts` module serialises all registry reads/writes through an async queue and persists a `string[]` of `project.json` paths to `<userData>/projects-registry.json`. `listProjectsHandler`, `handleCreateProject`, `deleteProjectHandler`, and a new `relocateProjectHandler` all call through this module. The renderer gains a missing-state card with a "Locate…" button.

**Tech Stack:** Node.js `fs.promises`, Electron `app.getPath('userData')` + `BrowserWindow`, Vitest (mocked `node:fs` and `electron`), React + Tailwind, existing `Spinner`/`Button`/`ContextMenu` shadcn components.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/main/projectRegistry.ts` | Registry CRUD + serial queue |
| Create | `src/main/__tests__/projectRegistry.test.ts` | Unit tests for registry module |
| Modify | `src/types/project.ts` | Add `missing?: true` to `ProjectData` |
| Modify | `src/types/ipc.ts` | Add `relocateProject` to `RacedashAPI` |
| Modify | `src/main/ipc.ts` | Rewrite `listProjectsHandler`; update `handleCreateProject`, `deleteProjectHandler`; add `relocateProjectHandler`; register new IPC channel |
| Modify | `src/main/__tests__/ipc.projects.test.ts` | Rewrite for registry-based listing |
| Modify | `src/main/__tests__/ipc.createProject.test.ts` | Add registry call assertions |
| Create | `src/main/__tests__/ipc.relocateProject.test.ts` | Tests for `relocateProjectHandler` |
| Modify | `src/preload/index.ts` | Wire `relocateProject` IPC call |
| Modify | `src/renderer/src/screens/ProjectLibrary.tsx` | Replace skeleton loading with Spinner |
| Modify | `src/renderer/src/components/app/ProjectCard.tsx` | Add missing state: red border, badge, Locate button |

---

## Task 1: Create `projectRegistry.ts` with tests

**Files:**
- Create: `apps/desktop/src/main/projectRegistry.ts`
- Create: `apps/desktop/src/main/__tests__/projectRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/src/main/__tests__/projectRegistry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock electron before importing the module under test.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

import fs from 'node:fs'
import {
  getRegistry,
  addToRegistry,
  removeFromRegistry,
  replaceInRegistry,
  _resetQueueForTesting,
} from '../projectRegistry'

const mockReadFile = vi.mocked(fs.promises.readFile)
const mockWriteFile = vi.mocked(fs.promises.writeFile)

const REGISTRY_PATH = '/Users/testuser/projects-registry.json'

beforeEach(() => {
  vi.clearAllMocks()
  _resetQueueForTesting()
})

describe('getRegistry', () => {
  it('returns [] when the registry file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    expect(await getRegistry()).toEqual([])
  })

  it('returns [] when the registry file contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('NOT JSON' as unknown as Buffer)
    expect(await getRegistry()).toEqual([])
  })

  it('returns the parsed array when the file contains valid JSON', async () => {
    const paths = ['/a/project.json', '/b/project.json']
    mockReadFile.mockResolvedValue(JSON.stringify(paths) as unknown as Buffer)
    expect(await getRegistry()).toEqual(paths)
  })
})

describe('addToRegistry', () => {
  it('appends a new path and writes the file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await addToRegistry('/b/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(
      REGISTRY_PATH,
      JSON.stringify(['/a/project.json', '/b/project.json']),
      'utf-8',
    )
  })

  it('is a no-op when the path is already registered', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await addToRegistry('/a/project.json')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

describe('removeFromRegistry', () => {
  it('removes the path and writes the file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json', '/b/project.json']) as unknown as Buffer)
    await removeFromRegistry('/a/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(
      REGISTRY_PATH,
      JSON.stringify(['/b/project.json']),
      'utf-8',
    )
  })

  it('is a no-op when the path is not in the registry', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await removeFromRegistry('/nonexistent/project.json')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

describe('replaceInRegistry', () => {
  it('replaces the old path with the new path in the same position', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify(['/a/project.json', '/b/project.json']) as unknown as Buffer,
    )
    await replaceInRegistry('/a/project.json', '/c/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(
      REGISTRY_PATH,
      JSON.stringify(['/c/project.json', '/b/project.json']),
      'utf-8',
    )
  })

  it('throws with code NOT_FOUND when the old path is not in the registry', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    const err = await replaceInRegistry('/missing/project.json', '/c/project.json').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as NodeJS.ErrnoException).code).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/projectRegistry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `projectRegistry.ts`**

Create `apps/desktop/src/main/projectRegistry.ts`:

```typescript
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function getRegistryPath(): string {
  return path.join(app.getPath('userData'), 'projects-registry.json')
}

// Serial queue — prevents concurrent reads/writes from racing.
let queue: Promise<void> = Promise.resolve()

export function _resetQueueForTesting(): void {
  queue = Promise.resolve()
}

function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn)
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function readRegistry(): Promise<string[]> {
  try {
    const raw = await fs.promises.readFile(getRegistryPath(), 'utf-8')
    const parsed = JSON.parse(raw as unknown as string)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

async function writeRegistry(paths: string[]): Promise<void> {
  await fs.promises.writeFile(getRegistryPath(), JSON.stringify(paths), 'utf-8')
}

export function getRegistry(): Promise<string[]> {
  return serialise(readRegistry)
}

export function addToRegistry(projectJsonPath: string): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    if (current.includes(projectJsonPath)) return
    await writeRegistry([...current, projectJsonPath])
  })
}

export function removeFromRegistry(projectJsonPath: string): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    const next = current.filter((p) => p !== projectJsonPath)
    if (next.length === current.length) return // not found — no-op
    await writeRegistry(next)
  })
}

export function replaceInRegistry(
  oldProjectPath: string,
  newProjectPath: string,
): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    const idx = current.indexOf(oldProjectPath)
    if (idx === -1) {
      throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
    }
    const next = [...current]
    next[idx] = newProjectPath
    await writeRegistry(next)
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/projectRegistry.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/projectRegistry.ts apps/desktop/src/main/__tests__/projectRegistry.test.ts
git commit -m "feat(desktop): add project registry module"
```

---

## Task 2: Add `missing` type flag and `relocateProject` to API types

**Files:**
- Modify: `apps/desktop/src/types/project.ts`
- Modify: `apps/desktop/src/types/ipc.ts`

- [ ] **Step 1: Add `missing?: true` to `ProjectData`**

In `apps/desktop/src/types/project.ts`, change:

```typescript
export interface ProjectData {
  name: string
  projectPath: string
  /** Path to the engine timing config (config.json) in the project directory. */
  configPath: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}
```

to:

```typescript
export interface ProjectData {
  name: string
  projectPath: string
  /** Path to the engine timing config (config.json) in the project directory. */
  configPath: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
  /** Runtime-only flag set by listProjectsHandler when the project.json cannot be found on disk. Never written to disk. */
  missing?: true
}
```

- [ ] **Step 2: Add `relocateProject` to `RacedashAPI`**

In `apps/desktop/src/types/ipc.ts`, in the `RacedashAPI` interface under the Projects section, add after `renameProject`:

```typescript
relocateProject(oldProjectPath: string): Promise<ProjectData>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/types/project.ts apps/desktop/src/types/ipc.ts
git commit -m "feat(desktop): add missing flag and relocateProject to API types"
```

---

## Task 3: Rewrite `listProjectsHandler` with tests

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/__tests__/ipc.projects.test.ts`

- [ ] **Step 1: Rewrite `ipc.projects.test.ts` with failing tests**

Replace the entire contents of `apps/desktop/src/main/__tests__/ipc.projects.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      rm: vi.fn().mockResolvedValue(undefined),
    },
  },
  promises: {
    readFile: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

// Mock projectRegistry so tests control what paths are registered.
vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn(),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import fs from 'node:fs'
import * as registry from '../projectRegistry'
import { listProjectsHandler, openProjectHandler, deleteProjectHandler } from '../ipc'

const mockGetRegistry = vi.mocked(registry.getRegistry)
const mockReadFile = vi.mocked(fs.promises.readFile)
const mockRm = vi.mocked(fs.promises.rm)
const mockRemoveFromRegistry = vi.mocked(registry.removeFromRegistry)

const PROJECT_PATH = '/custom/my-race/project.json'
const SAMPLE_PROJECT = {
  name: 'My Race',
  projectPath: PROJECT_PATH,
  configPath: '/custom/my-race/config.json',
  videoPaths: ['/custom/my-race/video.mp4'],
  segments: [],
  selectedDriver: 'G. Gorzynski',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProjectsHandler', () => {
  it('returns [] when the registry is empty', async () => {
    mockGetRegistry.mockResolvedValue([])
    expect(await listProjectsHandler()).toEqual([])
  })

  it('returns a parsed project when project.json exists and is valid', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'My Race', projectPath: PROJECT_PATH })
    expect(result[0].missing).toBeUndefined()
  })

  it('returns a missing entry when project.json does not exist', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0].missing).toBe(true)
    expect(result[0].projectPath).toBe(PROJECT_PATH)
    expect(result[0].name).toBe('my-race') // parent dir name
  })

  it('silently omits entries where project.json is corrupt JSON', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue('NOT VALID JSON' as unknown as Buffer)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('silently omits entries where project.json lacks a name field', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(
      JSON.stringify({ projectPath: PROJECT_PATH }) as unknown as Buffer,
    )

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('strips a runtime missing field from a successfully parsed file', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(
      JSON.stringify({ ...SAMPLE_PROJECT, missing: true }) as unknown as Buffer,
    )

    const result = await listProjectsHandler()

    expect(result[0].missing).toBeUndefined()
  })

  it('handles multiple paths, mixing valid and missing', async () => {
    const path2 = '/other/race/project.json'
    mockGetRegistry.mockResolvedValue([PROJECT_PATH, path2])
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(2)
    expect(result[0].missing).toBeUndefined()
    expect(result[1].missing).toBe(true)
  })
})

describe('deleteProjectHandler', () => {
  it('removes from registry then deletes the folder', async () => {
    mockRemoveFromRegistry.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)

    await deleteProjectHandler(PROJECT_PATH)

    expect(mockRemoveFromRegistry).toHaveBeenCalledWith(PROJECT_PATH)
    expect(mockRm).toHaveBeenCalledWith(path.dirname(PROJECT_PATH), { recursive: true, force: true })
  })

  it('proceeds with folder delete even if path was not in registry (no-op remove)', async () => {
    mockRemoveFromRegistry.mockResolvedValue(undefined) // no-op — path was not found
    mockRm.mockResolvedValue(undefined)

    await deleteProjectHandler(PROJECT_PATH)

    expect(mockRm).toHaveBeenCalled()
  })

  it('aborts without touching the disk when removeFromRegistry throws an I/O error', async () => {
    mockRemoveFromRegistry.mockRejectedValue(new Error('disk error'))

    await expect(deleteProjectHandler(PROJECT_PATH)).rejects.toThrow('disk error')
    expect(mockRm).not.toHaveBeenCalled()
  })

  it('throws when projectPath is empty', async () => {
    await expect(deleteProjectHandler('')).rejects.toThrow('non-empty string')
  })

  it('throws when projectPath does not end with project.json', async () => {
    await expect(deleteProjectHandler('/etc/passwd')).rejects.toThrow('project.json')
  })
})

describe('openProjectHandler', () => {
  it('reads and returns parsed ProjectData from the given path', async () => {
    vi.spyOn(require('node:fs'), 'readFileSync').mockReturnValue(JSON.stringify(SAMPLE_PROJECT))
    // openProjectHandler uses sync readFileSync — keep existing test approach
    const fsSync = await import('node:fs')
    vi.spyOn(fsSync.default, 'readFileSync' as never).mockReturnValue(JSON.stringify(SAMPLE_PROJECT) as never)

    const result = await openProjectHandler(SAMPLE_PROJECT.projectPath)
    expect(result.name).toBe('My Race')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail (registry mock missing)**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.projects.test.ts
```

Expected: FAIL — `listProjectsHandler` still scans directory, not registry.

- [ ] **Step 3: Rewrite `listProjectsHandler` and update `deleteProjectHandler` in `ipc.ts`**

In `apps/desktop/src/main/ipc.ts`:

1. **Remove** the `RACEDASH_DIR` constant (lines 52–59).

2. **Add import** for registry at the top of the imports:
```typescript
import { getRegistry, addToRegistry, removeFromRegistry, replaceInRegistry } from './projectRegistry'
```

3. **Replace** `listProjectsHandler` entirely:
```typescript
export async function listProjectsHandler(): Promise<ProjectData[]> {
  const paths = await getRegistry()
  const results = await Promise.all(
    paths.map(async (registeredPath): Promise<ProjectData | null> => {
      try {
        const raw = await fs.promises.readFile(registeredPath, 'utf-8')
        const parsed = JSON.parse(raw as unknown as string) as ProjectData
        if (typeof parsed.name !== 'string') return null
        const { missing: _stripped, ...data } = parsed as ProjectData & { missing?: unknown }
        return { ...data, projectPath: data.projectPath ?? registeredPath }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return {
            name: path.basename(path.dirname(registeredPath)) || registeredPath,
            projectPath: registeredPath,
            configPath: '',
            videoPaths: [],
            segments: [],
            selectedDriver: '',
            missing: true,
          }
        }
        return null
      }
    }),
  )
  return results.filter((r): r is ProjectData => r !== null)
}
```

4. **Replace** `deleteProjectHandler`:
```typescript
export async function deleteProjectHandler(projectPath: string): Promise<void> {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('deleteProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('deleteProject: path must point to a project.json file')
  }
  // Remove from registry first — abort if I/O fails (no-op if not found).
  await removeFromRegistry(projectPath)
  const projectDir = path.dirname(projectPath)
  await fs.promises.rm(projectDir, { recursive: true, force: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.projects.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.projects.test.ts
git commit -m "feat(desktop): rewrite listProjectsHandler to use project registry"
```

---

## Task 4: Update `handleCreateProject` to register new projects

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/__tests__/ipc.createProject.test.ts`

- [ ] **Step 1: Write failing test for registry call**

In `apps/desktop/src/main/__tests__/ipc.createProject.test.ts`, add a mock for `projectRegistry` at the top (after the existing `electron` mock):

```typescript
vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn().mockResolvedValue([]),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))
```

Then add the import after existing imports:

```typescript
import * as registry from '../projectRegistry'
const mockAddToRegistry = vi.mocked(registry.addToRegistry)
```

Add this test inside the `handleCreateProject` describe block:

```typescript
it('registers the new project path in the registry', async () => {
  // (use existing baseOpts from the file)
  await handleCreateProject(baseOpts)
  expect(mockAddToRegistry).toHaveBeenCalledWith(
    expect.stringContaining('project.json'),
  )
})

it('rolls back written files when addToRegistry fails', async () => {
  mockAddToRegistry.mockRejectedValueOnce(new Error('disk full'))

  await expect(handleCreateProject(baseOpts)).rejects.toThrow('disk full')

  // Should have attempted to delete the 3 written files
  expect(vi.mocked(fs.promises).unlink).toHaveBeenCalledTimes(3)
})
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.createProject.test.ts
```

Expected: the two new tests FAIL.

- [ ] **Step 3: Update `handleCreateProject` in `ipc.ts`**

After the line `fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2), 'utf-8')`, add:

```typescript
  // Register the project so it appears in the library regardless of saveDir location.
  try {
    await addToRegistry(projectPath)
  } catch (err) {
    // Roll back the three files we wrote. Do not remove saveDir itself — it may pre-exist.
    await Promise.allSettled([
      fs.promises.unlink(path.join(saveDir, 'project.json')),
      fs.promises.unlink(path.join(saveDir, 'config.json')),
      fs.promises.unlink(path.join(saveDir, 'video.mp4')),
    ])
    throw err
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.createProject.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.createProject.test.ts
git commit -m "feat(desktop): register new projects in registry on create"
```

---

## Task 5: Add `relocateProjectHandler` with tests

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/__tests__/ipc.relocateProject.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/src/main/__tests__/ipc.relocateProject.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  BrowserWindow: {
    getFocusedWindow: vi.fn().mockReturnValue({ id: 1 }),
    getAllWindows: vi.fn().mockReturnValue([{ id: 1 }]),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn().mockResolvedValue(['/old/project.json']),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import { dialog } from 'electron'
import fs from 'node:fs'
import * as registry from '../projectRegistry'
import { relocateProjectHandler } from '../ipc'

const mockShowOpenDialog = vi.mocked(dialog.showOpenDialog)
const mockReadFile = vi.mocked(fs.promises.readFile)
const mockGetRegistry = vi.mocked(registry.getRegistry)
const mockReplaceInRegistry = vi.mocked(registry.replaceInRegistry)
const mockAddToRegistry = vi.mocked(registry.addToRegistry)

const OLD_PATH = '/old/project.json'
const NEW_PATH = '/new/project.json'
const SAMPLE_PROJECT = {
  name: 'My Race',
  projectPath: NEW_PATH,
  configPath: '/new/config.json',
  videoPaths: ['/new/video.mp4'],
  segments: [],
  selectedDriver: 'G. Gorzynski',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRegistry.mockResolvedValue([OLD_PATH])
})

describe('relocateProjectHandler', () => {
  it('rejects with CANCELLED when the user cancels the dialog', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const err = await relocateProjectHandler(OLD_PATH).catch((e) => e)
    expect((err as Error).message).toBe('CANCELLED')
  })

  it('rejects with a parse error when the selected file is not valid JSON', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue('NOT JSON' as unknown as Buffer)

    await expect(relocateProjectHandler(OLD_PATH)).rejects.toThrow()
  })

  it('rejects with ALREADY_REGISTERED when the new path is already in the registry under a different entry', async () => {
    const otherPath = '/other/project.json'
    mockGetRegistry.mockResolvedValue([OLD_PATH, otherPath])
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [otherPath] })
    mockReadFile.mockResolvedValue(JSON.stringify({ ...SAMPLE_PROJECT, projectPath: otherPath }) as unknown as Buffer)

    const err = await relocateProjectHandler(OLD_PATH).catch((e) => e)
    expect((err as Error).message).toBe('ALREADY_REGISTERED')
  })

  it('allows selecting the same path as oldProjectPath (file reappeared in place)', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [OLD_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify({ ...SAMPLE_PROJECT, projectPath: OLD_PATH }) as unknown as Buffer)
    mockReplaceInRegistry.mockResolvedValue(undefined)

    const result = await relocateProjectHandler(OLD_PATH)
    expect(result.projectPath).toBe(OLD_PATH)
    expect(result.missing).toBeUndefined()
  })

  it('calls replaceInRegistry with old and new paths and returns updated ProjectData', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)

    const result = await relocateProjectHandler(OLD_PATH)

    expect(mockReplaceInRegistry).toHaveBeenCalledWith(OLD_PATH, NEW_PATH)
    expect(result.projectPath).toBe(NEW_PATH)
    expect(result.missing).toBeUndefined()
  })

  it('falls back to addToRegistry when replaceInRegistry throws NOT_FOUND', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
    mockReplaceInRegistry.mockRejectedValue(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))

    const result = await relocateProjectHandler(OLD_PATH)

    expect(mockAddToRegistry).toHaveBeenCalledWith(NEW_PATH)
    expect(result.projectPath).toBe(NEW_PATH)
  })

  it('re-throws when replaceInRegistry throws a non-NOT_FOUND error', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
    mockReplaceInRegistry.mockRejectedValue(new Error('I/O error'))

    await expect(relocateProjectHandler(OLD_PATH)).rejects.toThrow('I/O error')
  })

  it('strips the missing field from the returned ProjectData', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(
      JSON.stringify({ ...SAMPLE_PROJECT, missing: true }) as unknown as Buffer,
    )

    const result = await relocateProjectHandler(OLD_PATH)
    expect(result.missing).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.relocateProject.test.ts
```

Expected: FAIL — `relocateProjectHandler` not exported.

- [ ] **Step 3: Add `relocateProjectHandler` to `ipc.ts`**

Add the import for `BrowserWindow` and `dialog` at the top of `ipc.ts` (they are already imported from `electron` — add `BrowserWindow` if not present):

```typescript
import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron'
```

Then add the handler function (after `deleteProjectHandler`):

```typescript
export async function relocateProjectHandler(oldProjectPath: string): Promise<ProjectData> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    filters: [{ name: 'RaceDash Project', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (canceled || filePaths.length === 0) {
    throw new Error('CANCELLED')
  }

  const newProjectPath = filePaths[0]

  const raw = await fs.promises.readFile(newProjectPath, 'utf-8')
  const parsed = JSON.parse(raw as unknown as string) as ProjectData
  if (typeof parsed.name !== 'string') {
    throw new Error('relocateProject: selected file is not a valid RaceDash project')
  }

  // Check not already registered under a different entry.
  const current = await getRegistry()
  if (newProjectPath !== oldProjectPath && current.includes(newProjectPath)) {
    throw new Error('ALREADY_REGISTERED')
  }

  try {
    await replaceInRegistry(oldProjectPath, newProjectPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      await addToRegistry(newProjectPath)
    } else {
      throw err
    }
  }

  const { missing: _stripped, ...data } = parsed as ProjectData & { missing?: unknown }
  return { ...data, projectPath: newProjectPath }
}
```

Then **register the IPC channel** in `registerIpcHandlers` (alongside the other project channels):

```typescript
ipcMain.handle('racedash:relocateProject', (_event, oldProjectPath: string) => relocateProjectHandler(oldProjectPath))
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && npx vitest run --pool forks src/main/__tests__/ipc.relocateProject.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd apps/desktop && npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.relocateProject.test.ts
git commit -m "feat(desktop): add relocateProjectHandler and IPC channel"
```

---

## Task 6: Wire `relocateProject` in preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add `relocateProject` to the preload API object**

In `apps/desktop/src/preload/index.ts`, in the `api` object under the Projects section, add after `renameProject`:

```typescript
relocateProject: (oldProjectPath: string) =>
  ipcRenderer.invoke('racedash:relocateProject', oldProjectPath),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): wire relocateProject in preload"
```

---

## Task 7: Update `ProjectLibrary` loading state

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`

The `Spinner` component is at `src/renderer/src/components/loaders/Spinner.tsx`. It accepts a `label` prop for the accessible text and renders an animated ASCII spinner. Use `SpinnerInline` to show the spinner alongside text.

- [ ] **Step 1: Replace skeleton loading state with spinner**

In `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`:

1. Add the import:
```typescript
import { SpinnerInline } from '@/components/loaders/Spinner'
```

2. Replace the entire loading block (the ternary starting with `{loading ? (`):

**Before** (lines 71–84 roughly):
```tsx
{loading ? (
  view === 'tile' ? (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[158px] rounded-lg" />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  )
) : ...}
```

**After:**
```tsx
{loading ? (
  <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-white/50">
    <SpinnerInline label="Project files are updating">
      <span className="text-sm">Project files are updating</span>
    </SpinnerInline>
  </div>
) : ...}
```

3. Remove the `Skeleton` import if it is no longer used elsewhere in the file.

- [ ] **Step 2: Verify the renderer compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx
git commit -m "feat(desktop): replace loading skeletons with spinner in ProjectLibrary"
```

---

## Task 8: Add missing-project state to `ProjectCard`

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/app/ProjectCard.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx` (pass no-op callbacks + handle locate success)

This is the most involved UI task. Read `ProjectCard.tsx` in full before editing — the structure is a `ContextMenu` wrapping two `Button` variants (tile / list).

- [ ] **Step 1: Add missing-state logic to `ProjectCard`**

In `apps/desktop/src/renderer/src/components/app/ProjectCard.tsx`:

1. Add state and handler inside the component (after existing state declarations):
```typescript
const [locateError, setLocateError] = useState<string | null>(null)
const [locating, setLocating] = useState(false)

async function handleLocate(): Promise<void> {
  setLocateError(null)
  setLocating(true)
  try {
    const updated = await window.racedash.relocateProject(project.projectPath)
    onOpen(updated) // reuse onOpen as "located" callback — ProjectLibrary handles the state update
  } catch (err) {
    if (err instanceof Error && err.message === 'CANCELLED') {
      // no-op
    } else if (err instanceof Error && err.message === 'ALREADY_REGISTERED') {
      setLocateError('This project is already in your library')
    } else {
      setLocateError(err instanceof Error ? err.message : 'Failed to locate project')
    }
  } finally {
    setLocating(false)
  }
}
```

**Note on the `onOpen` reuse:** The caller (`ProjectLibrary`) will handle the locate result via the `onOpen` callback. See Task 8 Step 2 for how `ProjectLibrary` distinguishes between open and locate. Alternatively, add an `onLocate` prop — but reusing `onOpen` avoids a prop-signature change.

Actually, `onOpen` opens the project in the editor. For locate, we need to update the list state, not open the editor. **Add an `onLocate` prop instead:**

```typescript
interface ProjectCardProps {
  project: ProjectData
  view?: 'tile' | 'list'
  onOpen: (project: ProjectData) => void
  onDelete: (project: ProjectData) => void
  onRename: (updated: ProjectData) => void
  onLocate?: (updated: ProjectData) => void  // called after successful relocate
}
```

Update `handleLocate` to call `onLocate?.(updated)` on success instead of `onOpen`.

2. When `project.missing` is `true`, **render a completely different card body** (no `ContextMenu` wrapper, no `Button` click handler, red border, "Missing" badge, "Locate…" button). Wrap the existing tile/list `Button` rendering in a condition:

```tsx
if (project.missing) {
  return (
    <>
      <div className={view === 'tile' ? 'relative' : 'relative w-full'}>
        {view === 'tile' ? (
          <div className="flex h-auto w-full flex-col items-stretch gap-0 overflow-hidden rounded-lg border border-red-500 bg-[#1f1f1f] p-0">
            <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
              <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Missing</span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-white/60">{project.name}</p>
              {locateError && <p className="text-[11px] text-red-400">{locateError}</p>}
              <Button
                size="sm"
                variant="outline"
                className="mt-1 w-full border-red-500/40 text-red-400 hover:border-red-400 hover:text-red-300"
                onClick={handleLocate}
                disabled={locating}
              >
                {locating ? 'Locating…' : 'Locate…'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-auto w-full items-center gap-3 rounded-lg border border-red-500 bg-[#1f1f1f] px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <span className="text-[10px] font-bold text-red-400">!</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-white/60">{project.name}</p>
              <p className="text-[11px] text-red-400">Missing</p>
              {locateError && <p className="text-[11px] text-red-400">{locateError}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-red-500/40 text-red-400 hover:border-red-400 hover:text-red-300"
              onClick={handleLocate}
              disabled={locating}
            >
              {locating ? 'Locating…' : 'Locate…'}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
```

Place this `if (project.missing)` block **before** the `return (` for the normal card.

- [ ] **Step 2: Update `ProjectLibrary.tsx` to handle locate and pass no-op callbacks**

In `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`:

1. Add a `handleLocate` function:
```typescript
function handleLocate(updated: ProjectData) {
  setProjects((prev) => prev.map((p) => p.projectPath === updated.projectPath || p.projectPath === updated.projectPath ? updated : p))
}
```

Wait — after relocation the `projectPath` changes (old → new). The match key should be the **old** path captured in the card's closure. But `handleLocate` here only receives the updated `ProjectData` with the new path. We need the old path too.

The simplest fix: pass the old `projectPath` to `onLocate` as well, or match by the `missing: true` flag knowing the card still has the old `project.projectPath`.

Actually the `ProjectCard` calls `onLocate(updated)` where `updated.projectPath` is the NEW path. But the old entry in `projects` state still has the old `projectPath`. We need to match by the OLD path.

The cleanest solution: make `onLocate` receive both old and new:

```typescript
onLocate?: (oldProjectPath: string, updated: ProjectData) => void
```

In `ProjectCard`:
```typescript
onLocate?.(project.projectPath, updated)  // project.projectPath is the old path (closed over)
```

In `ProjectLibrary`:
```typescript
function handleLocate(oldProjectPath: string, updated: ProjectData) {
  setProjects((prev) => prev.map((p) => p.projectPath === oldProjectPath ? updated : p))
}
```

And pass to `ProjectCard`:
```tsx
<ProjectCard
  key={project.projectPath}
  project={project}
  view={view}
  onOpen={onOpen}
  onDelete={(deleted) => setProjects((prev) => prev.filter((p) => p.projectPath !== deleted.projectPath))}
  onRename={(updated) => setProjects((prev) => prev.map((p) => p.projectPath === updated.projectPath ? updated : p))}
  onLocate={handleLocate}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
cd apps/desktop && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/ProjectCard.tsx apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx
git commit -m "feat(desktop): add missing-project state to ProjectCard with Locate action"
```

---

## Final: Verify and clean up

- [ ] **Step 1: Run full test suite one more time**

```bash
cd apps/desktop && npm test
```

Expected: all tests PASS.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Delete the `Skeleton` import from `ProjectLibrary.tsx` if unused**

Check whether `Skeleton` is still referenced anywhere in the file. If not, remove its import.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -p && git commit -m "chore(desktop): remove unused Skeleton import from ProjectLibrary"
```

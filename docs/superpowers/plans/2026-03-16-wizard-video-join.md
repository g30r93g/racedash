# Wizard Step 1 — Video Join on Continue

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the video join from `createProject` (Step 5) to immediately after the user clicks Continue in Step 1 of the wizard, with a loading state and error handling.

**Architecture:** A new `joinVideos` IPC channel runs ffmpeg concat on the main process. The wizard intercepts the Continue button on Step 1, calls the join, stores the resulting path in wizard state, then advances. `createProject` is updated to accept a pre-joined file path and copy it into the project directory. Temp file cleanup happens in `createProject` (on success) and in the wizard cancel handler.

**Tech Stack:** Electron 33, React 18, TypeScript, ffmpeg (via `execFile`)

**Prerequisite:** Plan A2 scaffold is complete — `apps/desktop/` exists with Electron main/preload/renderer and all IPC infrastructure.

---

## File Map

| File | Change |
|---|---|
| `src/main/ipc.ts` | Add `joinVideosImpl`, update `handleCreateProject` to accept `joinedVideoPath`, register `racedash:joinVideos` |
| `src/main/__tests__/ipc.joinVideos.test.ts` | New — tests for `joinVideosImpl` |
| `src/main/__tests__/ipc.createProject.test.ts` | Update — `baseOpts` changes from `videoPaths[]` to `joinedVideoPath`, add copy/unlink assertions |
| `src/types/ipc.ts` | Add `JoinVideosResult`, add `joinVideos` to `RacedashAPI` |
| `src/types/project.ts` | Update `CreateProjectOpts` — replace `videoPaths: string[]` with `joinedVideoPath: string` |
| `src/preload/index.ts` | Expose `joinVideos` |
| `src/renderer/src/screens/wizard/ProjectCreationWizard.tsx` | Intercept Continue on step 1, call join IPC, manage `joining`/`joinError` state, clear join on file change, cancel cleanup |
| `src/renderer/src/screens/wizard/steps/Step1Videos.tsx` | Accept `joining` and `joinError` props, render loading/error feedback |
| `src/renderer/src/screens/wizard/steps/Step5Confirm.tsx` | Update `createProject` call — pass `joinedVideoPath` instead of `videoPaths` |

---

## Chunk 1: Main Process

### Task 1: `joinVideosImpl` + test

`@racedash/engine` already exports `joinVideos(files: string[], outputPath: string): Promise<void>` (backed by `@racedash/compositor`). `joinVideosImpl` in `ipc.ts` wraps it — no ffmpeg reimplementation needed.

**Files:**
- Modify: `src/main/ipc.ts`
- Create: `src/main/__tests__/ipc.joinVideos.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/ipc.joinVideos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'

vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(),
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn(),
  renderSession: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

import { joinVideos as engineJoinVideos } from '@racedash/engine'
import { joinVideosImpl } from '../ipc'

const mockEngineJoinVideos = vi.mocked(engineJoinVideos)

beforeEach(() => {
  vi.clearAllMocks()
  mockEngineJoinVideos.mockResolvedValue(undefined)
})

describe('joinVideosImpl', () => {
  it('returns the original path unchanged for a single file', async () => {
    const result = await joinVideosImpl(['/videos/chapter1.mp4'])
    expect(result).toBe('/videos/chapter1.mp4')
    expect(mockEngineJoinVideos).not.toHaveBeenCalled()
  })

  it('calls engine joinVideos for multiple files', async () => {
    await joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])
    expect(mockEngineJoinVideos).toHaveBeenCalledWith(
      ['/videos/ch1.mp4', '/videos/ch2.mp4'],
      expect.stringContaining('racedash-join-')
    )
  })

  it('returns a path in the system temp directory for multiple files', async () => {
    const result = await joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])
    expect(path.resolve(result)).toContain(path.resolve(os.tmpdir()))
    expect(result).toMatch(/\.mp4$/)
  })

  it('rejects when the engine throws', async () => {
    mockEngineJoinVideos.mockRejectedValue(new Error('ffmpeg not found'))
    await expect(joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])).rejects.toThrow('ffmpeg not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/ipc.joinVideos.test.ts
```

Expected: FAIL — `joinVideosImpl` not found.

- [ ] **Step 3: Implement `joinVideosImpl` in `src/main/ipc.ts`**

Add `joinVideos` to the existing `@racedash/engine` import at the top of `ipc.ts`:

```ts
import { listDrivers, generateTimestamps, renderSession, joinVideos as engineJoinVideos } from '@racedash/engine'
```

Add the exported function after the existing `checkFfmpegImpl`:

```ts
/**
 * Joins multiple video chapter files into a single MP4 using the engine's
 * joinVideos (backed by @racedash/compositor).
 * For a single file, returns the original path with no work done.
 * For multiple files, writes the joined file to the system temp directory
 * and returns its path.
 */
export async function joinVideosImpl(videoPaths: string[]): Promise<string> {
  if (videoPaths.length === 0) throw new Error('joinVideos: at least one video path is required')
  if (videoPaths.length === 1) return videoPaths[0]

  const outPath = path.join(os.tmpdir(), `racedash-join-${Date.now()}.mp4`)
  await engineJoinVideos(videoPaths, outPath)
  return outPath
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/ipc.joinVideos.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.joinVideos.test.ts
git commit -m "feat(desktop): add joinVideosImpl delegating to @racedash/engine joinVideos"
```

---

### Task 2: Update `CreateProjectOpts` and `handleCreateProject`

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/__tests__/ipc.createProject.test.ts`

- [ ] **Step 1: Update `CreateProjectOpts` in `src/types/project.ts`**

Replace:
```ts
export interface CreateProjectOpts {
  name: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}
```

With:
```ts
export interface CreateProjectOpts {
  name: string
  /** Absolute path to the joined video file (temp or original if single file). */
  joinedVideoPath: string
  segments: SegmentConfig[]
  selectedDriver: string
}
```

- [ ] **Step 2: Update failing tests**

In `src/main/__tests__/ipc.createProject.test.ts`, update `baseOpts` and all assertions:

```ts
const baseOpts = {
  name: 'My Race',
  // Use path.join(os.tmpdir(), ...) so the path matches on macOS where
  // os.tmpdir() returns /private/tmp (symlink to /tmp).
  joinedVideoPath: path.join(os.tmpdir(), 'racedash-join-123.mp4'),
  segments: [
    {
      label: 'Race',
      source: 'mylapsSpeedhive' as const,
      eventId: '12345',
      session: 'race' as const,
    },
  ],
  selectedDriver: 'G. Gorzynski',
}
```

Add mocks for `fs.copyFileSync` and update the `fs` mock at the top:

```ts
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))
```

Replace the existing test cases with:

```ts
describe('handleCreateProject', () => {
  it('creates the project directory under ~/Videos/racedash/<slug>', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(mockMkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true })
  })

  it('copies the joined video into <saveDir>/video.mp4', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.copyFileSync)).toHaveBeenCalledWith(
      baseOpts.joinedVideoPath,
      path.join(expectedDir, 'video.mp4')
    )
  })

  it('deletes the joined video if it is a temp file (in os.tmpdir())', async () => {
    await handleCreateProject(baseOpts)
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(baseOpts.joinedVideoPath)
  })

  it('does not delete the joined video if it is not a temp file', async () => {
    const opts = { ...baseOpts, joinedVideoPath: '/Users/testuser/Videos/chapter1.mp4' }
    await handleCreateProject(opts)
    expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled()
  })

  it('writes project.json with videoPaths pointing to the copied video', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.videoPaths).toEqual([path.join(expectedDir, 'video.mp4')])
  })

  it('writes project.json with correct fields', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const written = JSON.parse(writtenJson)
    expect(written).toMatchObject({
      name: 'My Race',
      projectPath: path.join(expectedDir, 'project.json'),
      selectedDriver: 'G. Gorzynski',
    })
    expect(written.segments).toHaveLength(1)
    expect(written.segments[0].label).toBe('Race')
  })

  it('returns ProjectData with projectPath set to the new project.json path', async () => {
    const result = await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(result.projectPath).toBe(path.join(expectedDir, 'project.json'))
    expect(result.name).toBe('My Race')
    expect(result.selectedDriver).toBe('G. Gorzynski')
  })

  it('slugifies project names with spaces and special characters', async () => {
    await handleCreateProject({ ...baseOpts, name: 'Club Endurance — Round 3!' })
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('club-endurance'),
      { recursive: true }
    )
  })

  it('preserves all segment fields in project.json', async () => {
    const opts = {
      ...baseOpts,
      segments: [{ label: 'Race', source: 'mylapsSpeedhive' as const, eventId: '12345', session: 'race' as const, videoOffsetFrame: 150 }],
    }
    await handleCreateProject(opts)
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.segments[0].videoOffsetFrame).toBe(150)
    expect(written.segments[0].eventId).toBe('12345')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/ipc.createProject.test.ts
```

Expected: FAIL — type errors and assertion mismatches.

- [ ] **Step 4: Update `handleCreateProject` in `src/main/ipc.ts`**

Replace the existing `handleCreateProject` implementation:

```ts
export async function handleCreateProject(opts: CreateProjectOpts): Promise<ProjectData> {
  const slug = opts.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const saveDir = path.join(os.homedir(), 'Videos', 'racedash', slug)
  fs.mkdirSync(saveDir, { recursive: true })

  // Copy the joined video into the project directory.
  const videoPath = path.join(saveDir, 'video.mp4')
  fs.copyFileSync(opts.joinedVideoPath, videoPath)

  // Clean up the temp file if it came from os.tmpdir().
  // Use path.resolve to normalise symlinks (on macOS, os.tmpdir() returns
  // /private/tmp but the path may be seen as /tmp via the symlink).
  if (path.resolve(opts.joinedVideoPath).startsWith(path.resolve(os.tmpdir()))) {
    fs.unlinkSync(opts.joinedVideoPath)
  }

  const projectPath = path.join(saveDir, 'project.json')

  const projectData: ProjectData = {
    name: opts.name,
    projectPath,
    videoPaths: [videoPath],
    segments: opts.segments,
    selectedDriver: opts.selectedDriver,
  }

  fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2), 'utf-8')

  return projectData
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/ipc.createProject.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/types/project.ts apps/desktop/src/main/ipc.ts apps/desktop/src/main/__tests__/ipc.createProject.test.ts
git commit -m "feat(desktop): createProject accepts joinedVideoPath, copies video into project dir"
```

---

### Task 3: IPC wiring — types, registration, preload

**Files:**
- Modify: `src/types/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `JoinVideosResult` and `joinVideos` to `src/types/ipc.ts`**

Add after the `FfmpegStatus` block:

```ts
export interface JoinVideosResult {
  /** Absolute path to the joined file. May be the original path (single file) or a temp path. */
  joinedPath: string
}
```

Add to `RacedashAPI`:

```ts
joinVideos(videoPaths: string[]): Promise<JoinVideosResult>
```

- [ ] **Step 2: Register `racedash:joinVideos` in `src/main/ipc.ts`**

Inside `registerIpcHandlers`, add after the `racedash:checkFfmpeg` handler:

```ts
ipcMain.handle('racedash:joinVideos', async (_event, videoPaths: string[]) => {
  const joinedPath = await joinVideosImpl(videoPaths)
  return { joinedPath }
})
```

- [ ] **Step 3: Expose `joinVideos` in `src/preload/index.ts`**

Add to the `api` object:

```ts
joinVideos: (videoPaths: string[]) =>
  ipcRenderer.invoke('racedash:joinVideos', videoPaths),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/types/ipc.ts apps/desktop/src/main/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): expose joinVideos IPC channel"
```

---

## Chunk 2: Renderer — Wizard Join Flow

### Task 4: Step1Videos — joining feedback props

**Files:**
- Modify: `src/renderer/src/screens/wizard/steps/Step1Videos.tsx`

This task only adds display props — no logic change. The wizard drives the join.

- [ ] **Step 1: Update `Step1VideosProps` and render joining state**

```tsx
interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
  joining?: boolean
  joinError?: string
}
```

Below the drop zone `<div>`, add a status area:

```tsx
{joining && (
  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    Joining video files…
  </p>
)}
{joinError && (
  <p className="mt-3 text-sm text-destructive">{joinError}</p>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step1Videos.tsx
git commit -m "feat(desktop): Step1Videos accepts joining/joinError display props"
```

---

### Task 5: ProjectCreationWizard — join on Continue

**Files:**
- Modify: `src/renderer/src/screens/wizard/ProjectCreationWizard.tsx`

- [ ] **Step 1: Add join state and `joinedVideoPath` to wizard**

Update `WizardState` to include `joinedVideoPath`:

```ts
export interface WizardState {
  videoPaths: string[]
  joinedVideoPath?: string   // set after successful join; cleared if files change
  segments: SegmentConfig[]
  selectedDriver: string
  projectName: string
}
```

Add join state to the component:

```ts
const [joining, setJoining] = useState(false)
const [joinError, setJoinError] = useState<string | null>(null)
```

- [ ] **Step 2: Wire file change to clear join**

Step1Videos currently calls `updateState({ videoPaths: paths })` via the wizard's `updateState`. Add a dedicated handler so clearing `joinedVideoPath` is explicit:

```ts
function handleVideoPathsChange(paths: string[]) {
  updateState({ videoPaths: paths, joinedVideoPath: undefined })
  setJoinError(null)
}
```

Pass it to `Step1Videos`:

```tsx
{step === 1 && (
  <Step1Videos
    videoPaths={state.videoPaths}
    onChange={handleVideoPathsChange}
    joining={joining}
    joinError={joinError ?? undefined}
  />
)}
```

- [ ] **Step 3: Intercept Continue on step 1**

Replace the Continue button's `onClick={goNext}` with a handler that joins first:

```ts
async function handleContinue() {
  if (step === 1 && !state.joinedVideoPath) {
    setJoining(true)
    setJoinError(null)
    try {
      const { joinedPath } = await window.racedash.joinVideos(state.videoPaths)
      updateState({ joinedVideoPath: joinedPath })
      setJoining(false)
      goNext()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join video files')
      setJoining(false)
    }
    return
  }
  goNext()
}
```

Update the Continue button:

```tsx
{step < 5 && (
  <Button onClick={handleContinue} disabled={!canContinue || joining}>
    {joining ? 'Joining…' : 'Continue'}
  </Button>
)}
```

- [ ] **Step 4: Clean up temp file on cancel**

Update the cancel handler to clean up any temp file created in the system temp directory. Since the renderer cannot call `fs.unlink` directly, add a lightweight IPC call or — simpler — accept that OS temp cleanup handles it. The temp file is only created for multi-file joins, is named `racedash-join-*.mp4`, and OS temp directories are routinely purged.

> **Note:** For MVP, OS temp cleanup is acceptable. A `racedash:cleanupTempFile` IPC channel can be added as a follow-on if needed.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx
git commit -m "feat(desktop): join videos on Step 1 Continue before advancing wizard"
```

---

### Task 6: Step5Confirm — pass `joinedVideoPath` to `createProject`

**Files:**
- Modify: `src/renderer/src/screens/wizard/steps/Step5Confirm.tsx`

- [ ] **Step 1: Update `Step5ConfirmProps` and `handleCreate`**

Update the props interface:

```ts
interface Step5ConfirmProps {
  state: WizardState
  onNameChange: (name: string) => void
  onComplete: (project: ProjectData) => void
}
```

`WizardState` now includes `joinedVideoPath`. Update `handleCreate` to use it:

```ts
async function handleCreate() {
  if (!state.projectName.trim()) return
  if (!state.joinedVideoPath) {
    setError('No joined video path — please go back to Step 1 and re-select your files.')
    return
  }
  setLoading(true)
  setError(null)
  try {
    const project = await window.racedash.createProject({
      name: state.projectName.trim(),
      joinedVideoPath: state.joinedVideoPath,
      segments: state.segments,
      selectedDriver: state.selectedDriver,
    })
    onComplete(project)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to create project')
    setLoading(false)
  }
}
```

- [ ] **Step 2: Update description copy in `Step5Confirm`**

The existing paragraph at the top of the component says:
> "Confirming will join your video files and save the project — this may take a moment."

Joining now happens at step 1. Replace with:
> "Review your setup and confirm to save the project."

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all main process tests**

```bash
cd apps/desktop && npx vitest run src/main/__tests__/
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step5Confirm.tsx
git commit -m "feat(desktop): Step5Confirm uses joinedVideoPath for createProject"
```

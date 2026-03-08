# join progress output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real-time progress (`45% (0:12:34 / 0:27:30)`) while `racedash join` runs by switching from buffered `execFileAsync` to a `spawn`-based stderr parser.

**Architecture:** Extract `getVideoDuration` (ffprobe → raw seconds) so `joinVideos` can sum input durations for a known total. Replace the `execFileAsync('ffmpeg', ...)` call in `joinVideos` with a private `runFFmpegWithProgress` function that uses `spawn`, reads stderr line by line, and writes `\rProgress: XX% (H:MM:SS / H:MM:SS)` to process.stderr.

**Tech Stack:** Node.js `child_process.spawn` (streaming), `child_process.execFile` (ffprobe probing), Vitest.

---

### Task 1: Extract `getVideoDuration` helper

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Modify: `packages/compositor/src/index.test.ts`

**Step 1: Write failing tests for `getVideoDuration`**

Add to `packages/compositor/src/index.test.ts` — insert after the existing imports and before the `describe('joinVideos', ...)` block:

```ts
import { getVideoDuration } from './index'

describe('getVideoDuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed seconds from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '120.5\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).resolves.toBeCloseTo(120.5)
  })

  it('throws when ffprobe returns no duration', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('ffprobe returned no duration')
  })

  it('calls ffprobe with the correct path', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '60\n', stderr: '' })
    })
    await getVideoDuration('/my/video.mp4')
    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as [string, string[]]
    expect(cmd).toBe('ffprobe')
    expect(args[args.length - 1]).toBe('/my/video.mp4')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/g30r93g/Projects/racedash/.worktrees/feat-racedash-ts
pnpm --filter @racedash/compositor test
```

Expected: FAIL — `getVideoDuration` is not exported.

**Step 3: Add `getVideoDuration` to `packages/compositor/src/index.ts`**

Add this exported function after `getVideoDurationFrames`:

```ts
/**
 * Get video duration in seconds using ffprobe.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const seconds = parseFloat(stdout.trim())
  if (isNaN(seconds)) throw new Error(`ffprobe returned no duration for: ${videoPath}`)
  return seconds
}
```

Then refactor `getVideoDurationFrames` to call it (DRY):

```ts
export async function getVideoDurationFrames(
  videoPath: string,
  fps: number,
): Promise<number> {
  const seconds = await getVideoDuration(videoPath)
  return Math.ceil(seconds * fps)
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm --filter @racedash/compositor test
```

Expected: all tests pass (previous 6 + new 3 = 9 total).

**Step 5: Commit**

```bash
git add packages/compositor/src/index.ts packages/compositor/src/index.test.ts
git commit -m "feat(compositor): extract getVideoDuration helper, refactor getVideoDurationFrames"
```

---

### Task 2: Add spawn-based progress to `joinVideos`

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Modify: `packages/compositor/src/index.test.ts`

**Step 1: Update the tests**

The existing `joinVideos` tests mock `execFile` for the ffmpeg call. After this task, ffmpeg runs via `spawn` instead, and `execFile` is only called by `getVideoDuration` (ffprobe). All 6 existing `joinVideos` tests need updating.

Replace the entire `packages/compositor/src/index.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import { joinVideos, getVideoDuration } from './index'

// execFile mock: used by getVideoDuration (ffprobe calls).
// Returns a valid duration by default so joinVideos can probe inputs.
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: Function) => {
    callback(null, { stdout: '60\n', stderr: '' })
  }),
  spawn: vi.fn(() => makeSpawnResult(0)),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

/** Creates a fake spawn result that emits close with the given exit code. */
function makeSpawnResult(exitCode: number, stderrOutput?: string) {
  const stderrListeners: ((data: Buffer) => void)[] = []
  const closeListeners: ((code: number) => void)[] = []
  const proc = {
    stderr: {
      on: (_event: string, fn: (data: Buffer) => void) => stderrListeners.push(fn),
    },
    on: (event: string, fn: (code: number) => void) => {
      if (event === 'close') closeListeners.push(fn)
    },
  }
  setImmediate(() => {
    if (stderrOutput) stderrListeners.forEach(fn => fn(Buffer.from(stderrOutput)))
    closeListeners.forEach(fn => fn(exitCode))
  })
  return proc
}

describe('getVideoDuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed seconds from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '120.5\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).resolves.toBeCloseTo(120.5)
  })

  it('throws when ffprobe returns no duration', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('ffprobe returned no duration')
  })

  it('calls ffprobe with the correct path', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '60\n', stderr: '' })
    })
    await getVideoDuration('/my/video.mp4')
    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as [string, string[]]
    expect(cmd).toBe('ffprobe')
    expect(args[args.length - 1]).toBe('/my/video.mp4')
  })
})

describe('joinVideos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when fewer than 2 inputs', async () => {
    await expect(joinVideos(['/a.mp4'], '/out.mp4')).rejects.toThrow('at least 2')
  })

  it('calls ffmpeg via spawn with concat demuxer args', async () => {
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    const mockSpawn = vi.mocked(spawn)
    expect(mockSpawn).toHaveBeenCalledOnce()
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('ffmpeg')
    expect(args).toContain('-f')
    expect(args[args.indexOf('-f') + 1]).toBe('concat')
    expect(args).toContain('-c')
    expect(args[args.indexOf('-c') + 1]).toBe('copy')
    expect(args[args.length - 1]).toBe('/out.mp4')
  })

  it('writes absolute file paths to the concat list', async () => {
    const writeMock = vi.mocked(fsp.writeFile)
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    expect(writeMock).toHaveBeenCalledOnce()
    const content = writeMock.mock.calls[0][1] as string
    expect(content).toContain("file '/clip1.mp4'")
    expect(content).toContain("file '/clip2.mp4'")
  })

  it('escapes single quotes in file paths', async () => {
    const writeMock = vi.mocked(fsp.writeFile)
    await joinVideos(["/rider's cam.mp4", '/clip2.mp4'], '/out.mp4')
    const content = writeMock.mock.calls[0][1] as string
    expect(content).toContain("file '/rider'\\''s cam.mp4'")
  })

  it('deletes temp file after success', async () => {
    const mockSpawn = vi.mocked(spawn)
    let tmpFilePath: string | undefined
    mockSpawn.mockImplementationOnce((_cmd, args) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      return makeSpawnResult(0) as ReturnType<typeof spawn>
    })
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })

  it('deletes temp file after ffmpeg failure', async () => {
    const mockSpawn = vi.mocked(spawn)
    let tmpFilePath: string | undefined
    mockSpawn.mockImplementationOnce((_cmd, args) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      return makeSpawnResult(1, 'ffmpeg: error\n') as ReturnType<typeof spawn>
    })
    await expect(joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')).rejects.toThrow()
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --filter @racedash/compositor test
```

Expected: most `joinVideos` tests fail because `joinVideos` still uses `execFileAsync` for ffmpeg (not `spawn`).

**Step 3: Update `joinVideos` in `packages/compositor/src/index.ts`**

Add `spawn` to the `node:child_process` import at line 1:

```ts
import { execFile, spawn } from 'node:child_process'
```

Add two private helpers at the bottom of the file (after `joinVideos`):

```ts
function runFFmpegWithProgress(args: string[], totalSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      const match = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed =
          parseInt(match[1], 10) * 3600 +
          parseInt(match[2], 10) * 60 +
          parseFloat(match[3])
        const pct = Math.min(100, Math.round((processed / totalSeconds) * 100))
        process.stderr.write(
          `\rProgress: ${pct}% (${_formatDuration(processed)} / ${_formatDuration(totalSeconds)})`,
        )
      }
    })
    proc.on('close', (code: number) => {
      process.stderr.write('\n')
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
  })
}

function _formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
```

Then update `joinVideos` to probe durations and call `runFFmpegWithProgress`:

```ts
export async function joinVideos(inputs: string[], outputPath: string): Promise<void> {
  if (inputs.length < 2) throw new Error('joinVideos requires at least 2 input files')

  const durations = await Promise.all(inputs.map(getVideoDuration))
  const totalSeconds = durations.reduce((a, b) => a + b, 0)

  const tmpFile = resolve(tmpdir(), `racedash-concat-${randomUUID()}.txt`)
  const list = inputs.map(f => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(tmpFile, list, 'utf-8')
  try {
    await runFFmpegWithProgress(
      ['-f', 'concat', '-safe', '0', '-i', tmpFile, '-c', 'copy', '-y', outputPath],
      totalSeconds,
    )
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}
```

**Step 4: Run tests to verify all pass**

```bash
pnpm --filter @racedash/compositor test
```

Expected: 9 tests pass (3 `getVideoDuration` + 6 `joinVideos`).

**Step 5: Run full suite**

```bash
pnpm turbo build test
```

Expected: all tasks pass.

**Step 6: Commit**

```bash
git add packages/compositor/src/index.ts packages/compositor/src/index.test.ts
git commit -m "feat(compositor): show progress during join using spawn + ffprobe duration"
```

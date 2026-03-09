# Render Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce render command wall-clock time by parallelising independent I/O, eliminating a redundant ffprobe call, and enabling GPU-accelerated frame rendering in Remotion.

**Architecture:** Four targeted changes — two to `apps/cli/src/index.ts` (parallel startup I/O, pass cached duration) and two to `packages/compositor/src/index.ts` (accept cached duration in `compositeVideo`, GPU flags in `renderMedia`). No new files. No API surface changes visible to callers outside the monorepo.

**Tech Stack:** Node.js `Promise.all`, Remotion `renderMedia` options (`gl`, `concurrency`), FFmpeg `-hwaccel videotoolbox`, Vitest for compositor unit tests.

---

## Task 1: Parallel fetch + video probe in the render command

The render command currently runs `fetchHtml` then `getVideoDurationFrames` sequentially. They have zero dependency on each other — the network request and the ffprobe subprocess can run at the same time.

The CLI already imports `getVideoDurationFrames` from `@racedash/compositor`. To also cache the raw seconds for Task 2, switch to importing `getVideoDuration` directly and computing frames manually — `getVideoDuration` is already exported.

**Files:**
- Modify: `apps/cli/src/index.ts`

**Step 1: Update the import to include `getVideoDuration`**

In `apps/cli/src/index.ts`, find the existing import line:

```ts
import { compositeVideo, getVideoDurationFrames, renderOverlay, joinVideos } from '@racedash/compositor'
```

Replace with:

```ts
import { compositeVideo, getVideoDuration, renderOverlay, joinVideos } from '@racedash/compositor'
```

**Step 2: Replace the sequential fetch + probe block**

Find this block inside the `render` action (lines 96–105):

```ts
console.error('Fetching laptimes...')
const html = await fetchHtml(url)
const drivers = parseDrivers(html)
const driver = await selectDriver(drivers, driverQuery)
const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

console.error(`Driver: [${driver.kart}] ${driver.name} — ${driver.laps.length} laps`)

console.error('Probing video duration...')
const durationInFrames = await getVideoDurationFrames(opts.video, fps)
```

Replace with:

```ts
console.error('Fetching laptimes and probing video...')
const [html, durationSeconds] = await Promise.all([
  fetchHtml(url),
  getVideoDuration(opts.video),
])
const durationInFrames = Math.ceil(durationSeconds * fps)

const drivers = parseDrivers(html)
const driver = await selectDriver(drivers, driverQuery)
const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

console.error(`Driver: [${driver.kart}] ${driver.name} — ${driver.laps.length} laps`)
```

**Step 3: Verify TypeScript compiles**

```bash
cd apps/cli && npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "perf(cli): parallelise fetch and video probe in render command"
```

---

## Task 2: Eliminate the redundant ffprobe call in `compositeVideo`

`compositeVideo` currently calls `getVideoDuration(sourcePath)` internally to get `totalSeconds` for progress tracking. The CLI already has this value from Task 1 (`durationSeconds`). We can accept it as an optional field in `CompositeOptions` and skip the internal probe when it's provided.

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Modify: `packages/compositor/src/index.test.ts`
- Modify: `apps/cli/src/index.ts`

**Step 1: Write a failing test for the new behaviour**

Add this test to the `describe('compositeVideo' ...)` block — or create it if it doesn't exist yet — in `packages/compositor/src/index.test.ts`. Add after the existing `joinVideos` describe block:

```ts
describe('compositeVideo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips ffprobe when durationSeconds is provided', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 90 })
    // execFile is only used by ffprobe — it must not have been called
    expect(vi.mocked(execFile)).not.toHaveBeenCalled()
  })

  it('calls ffprobe when durationSeconds is not provided', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4')
    expect(vi.mocked(execFile)).toHaveBeenCalledOnce()
  })
})
```

You will also need to add `compositeVideo` to the import at the top of the test file:

```ts
import { joinVideos, getVideoDuration, compositeVideo } from './index'
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm vitest run packages/compositor/src/index.test.ts
```

Expected: the two new `compositeVideo` tests fail because `durationSeconds` doesn't exist yet.

**Step 3: Add `durationSeconds` to `CompositeOptions` and update `compositeVideo`**

In `packages/compositor/src/index.ts`, update the interface:

```ts
export interface CompositeOptions {
  fps?: number
  videoBitrate?: string
  overlayX?: number
  overlayY?: number
  durationSeconds?: number
}
```

Then update `compositeVideo` to use it:

```ts
export async function compositeVideo(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: CompositeOptions = {},
  onProgress?: (progress: number) => void,
): Promise<void> {
  const { fps = 60, videoBitrate = '50M', overlayX = 0, overlayY = 0, durationSeconds } = opts
  const totalSeconds = durationSeconds ?? await getVideoDuration(sourcePath)
  await runFFmpegWithProgress(
    [
      '-i', sourcePath,
      '-i', overlayPath,
      '-filter_complex', `[0:v][1:v]overlay=x=${overlayX}:y=${overlayY}`,
      '-r', String(fps),
      '-pix_fmt', 'yuv420p',
      '-c:v', 'h264_videotoolbox',
      '-b:v', videoBitrate,
      '-c:a', 'copy',
      '-y',
      outputPath,
    ],
    totalSeconds,
    onProgress,
  )
}
```

**Step 4: Run the tests to confirm they pass**

```bash
pnpm vitest run packages/compositor/src/index.test.ts
```

Expected: all tests pass.

**Step 5: Pass `durationSeconds` from the CLI**

In `apps/cli/src/index.ts`, update the `compositeVideo` call to pass through the cached value:

```ts
await compositeVideo(
  opts.video,
  overlayPath,
  opts.output,
  { fps, overlayX, overlayY, durationSeconds },
  makeProgressCallback('Compositing'),
)
```

**Step 6: Verify TypeScript compiles**

```bash
cd apps/cli && npx tsc --noEmit
cd packages/compositor && npx tsc --noEmit
```

Expected: no errors.

**Step 7: Commit**

```bash
git add packages/compositor/src/index.ts packages/compositor/src/index.test.ts apps/cli/src/index.ts
git commit -m "perf(compositor): accept cached durationSeconds in compositeVideo to skip redundant ffprobe"
```

---

## Task 3: GPU-accelerated frame rendering in Remotion

`renderMedia` defaults to Chromium's software renderer (`swiftshader`) in headless mode and uses half the available CPU cores. Passing `gl: 'angle'` switches to Metal on macOS via the ANGLE layer. Passing `concurrency: os.cpus().length` doubles the default parallelism.

There are no meaningful unit tests for `renderOverlay` since it invokes the Remotion renderer (an external library with its own test suite). Verify by running a real render and observing the time reduction.

**Files:**
- Modify: `packages/compositor/src/index.ts`

**Step 1: Add the `os` import**

At the top of `packages/compositor/src/index.ts`, add:

```ts
import { cpus } from 'node:os'
```

**Step 2: Update `renderMedia` call**

Find the `renderMedia` call inside `renderOverlay`:

```ts
await renderMedia({
  serveUrl,
  composition: comp,
  codec: 'prores',
  proResProfile: '4444',
  outputLocation: outputPath,
  inputProps,
  onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
})
```

Replace with:

```ts
await renderMedia({
  serveUrl,
  composition: comp,
  codec: 'prores',
  proResProfile: '4444',
  outputLocation: outputPath,
  inputProps,
  gl: 'angle',
  concurrency: cpus().length,
  onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
})
```

**Step 3: Verify TypeScript compiles**

```bash
cd packages/compositor && npx tsc --noEmit
```

Expected: no errors. (`gl` and `concurrency` are valid `renderMedia` options in Remotion v4.)

**Step 4: Commit**

```bash
git add packages/compositor/src/index.ts
git commit -m "perf(compositor): enable GPU rendering (angle/Metal) and full CPU concurrency in Remotion"
```

---

## Task 4: Hardware-accelerated video decode in FFmpeg

Adding `-hwaccel videotoolbox` before the source input tells FFmpeg to decode the source video on the GPU (Apple VideoToolbox), offloading CPU cycles during the composite step. The `overlay` filter still runs on CPU because alpha compositing requires frames in system memory — but freeing up decode work reduces contention.

This only applies to `compositeVideo`. The `joinVideos` function uses `-c copy` (no decode), so it is unaffected.

**Files:**
- Modify: `packages/compositor/src/index.ts`
- Modify: `packages/compositor/src/index.test.ts`

**Step 1: Write a failing test**

Add inside the existing `describe('compositeVideo')` block in `packages/compositor/src/index.test.ts`:

```ts
it('passes -hwaccel videotoolbox to ffmpeg for hardware decode', async () => {
  vi.mocked(spawn).mockImplementationOnce(
    (_cmd, _args) => makeSpawnResult(0) as ReturnType<typeof spawn>,
  )
  await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 60 })
  const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
  const hwIdx = args.indexOf('-hwaccel')
  expect(hwIdx).toBeGreaterThan(-1)
  expect(args[hwIdx + 1]).toBe('videotoolbox')
})
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm vitest run packages/compositor/src/index.test.ts
```

Expected: the new test fails — `-hwaccel` is not in the args.

**Step 3: Add `-hwaccel videotoolbox` to the FFmpeg args**

In `compositeVideo` in `packages/compositor/src/index.ts`, update the `runFFmpegWithProgress` args array to add `-hwaccel videotoolbox` before the first `-i`:

```ts
await runFFmpegWithProgress(
  [
    '-hwaccel', 'videotoolbox',
    '-i', sourcePath,
    '-i', overlayPath,
    '-filter_complex', `[0:v][1:v]overlay=x=${overlayX}:y=${overlayY}`,
    '-r', String(fps),
    '-pix_fmt', 'yuv420p',
    '-c:v', 'h264_videotoolbox',
    '-b:v', videoBitrate,
    '-c:a', 'copy',
    '-y',
    outputPath,
  ],
  totalSeconds,
  onProgress,
)
```

**Step 4: Run all compositor tests**

```bash
pnpm vitest run packages/compositor/src/index.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add packages/compositor/src/index.ts packages/compositor/src/index.test.ts
git commit -m "perf(compositor): add -hwaccel videotoolbox for hardware-accelerated video decode"
```

---

## Verification

After all four tasks, run the full test suite to confirm nothing regressed:

```bash
pnpm turbo test
```

Then do a real render and compare wall-clock time against `main`.

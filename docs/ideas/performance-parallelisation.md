# Performance: Parallelisation Opportunities

## Summary

The render pipeline is entirely sequential today, but two steps have no dependency on each other and can run concurrently. A third issue is a redundant `ffprobe` call that can be eliminated by caching.

---

## 1. Parallel fetch + video probe (high impact, easy)

**Location:** `apps/cli/src/index.ts` — render command

`fetchHtml()` (network request) and `getVideoDurationFrames()` (ffprobe) are run one after the other, but neither depends on the other's result. They can run with `Promise.all`.

**Current:**
```
fetch ──────────> probe ──> select driver ──> render ──> composite
```

**Improved:**
```
fetch ──────────> select driver ──> render ──> composite
probe ──────────↗
```

**Expected saving:** 2–5 seconds (the full duration of the network request).

```ts
// Before
const html = await fetchHtml(url)
const drivers = parseDrivers(html)
const driver = await selectDriver(drivers, driverQuery)
const timestamps = calculateTimestamps(driver.laps, offsetSeconds)
const durationInFrames = await getVideoDurationFrames(opts.video, fps)

// After
const [html, durationInFrames] = await Promise.all([
  fetchHtml(url),
  getVideoDurationFrames(opts.video, fps),
])
const drivers = parseDrivers(html)
const driver = await selectDriver(drivers, driverQuery)
const timestamps = calculateTimestamps(driver.laps, offsetSeconds)
```

---

## 2. Cache video duration — eliminate redundant ffprobe (medium impact, easy)

**Location:** `apps/cli/src/index.ts` + `packages/compositor/src/index.ts`

`getVideoDuration()` is called twice during a render:
1. Explicitly in the CLI via `getVideoDurationFrames()`
2. Again inside `compositeVideo()`, which calls `getVideoDuration()` internally to compute total seconds for progress tracking

The second call can be avoided by accepting an optional pre-computed duration in `compositeVideo`.

**Expected saving:** 1–2 seconds (one ffprobe subprocess).

**Approach:**
- Add an optional `durationSeconds` field to `CompositeOptions`
- In `compositeVideo`, skip the `getVideoDuration()` call if it's already provided
- In the CLI, derive `durationInFrames` from the cached seconds rather than re-probing

---

## 3. Not worth it: streaming composite during render

The composite step requires the overlay `.mov` to be fully written before FFmpeg can read it. Starting the composite earlier via a file watcher would add significant complexity for minor gain. Not recommended.

---

## Already good: `joinVideos`

`joinVideos` already probes all input file durations in parallel using `Promise.all`. No changes needed.

---

## GPU utilisation

### Remotion overlay render — likely not using GPU at all

`renderMedia` is called with no `gl` or `concurrency` options set:

- **`gl`** defaults to Chromium's software renderer (`swiftshader`) in headless mode — pure CPU. On macOS, passing `gl: 'angle'` makes Chromium use Metal via the ANGLE layer, enabling GPU rasterisation.
- **`concurrency`** defaults to half the number of CPU cores. Can be pushed higher.

Both are single-line additions to the `renderMedia` call in `packages/compositor/src/index.ts`.

```ts
await renderMedia({
  serveUrl,
  composition: comp,
  codec: 'prores',
  proResProfile: '4444',
  outputLocation: outputPath,
  inputProps,
  gl: 'angle',          // use Metal on macOS instead of swiftshader
  concurrency: os.cpus().length,  // default is half
  onProgress: ...,
})
```

### FFmpeg composite — partially using GPU

| | Status |
|---|---|
| Encoding (`h264_videotoolbox`) | GPU ✓ |
| Decoding inputs | CPU — no `-hwaccel` flag |
| `overlay` filter | CPU — unavoidable, alpha compositing requires frames in system memory |

Adding `-hwaccel videotoolbox` to the source input would offload decode to the GPU, but since the `overlay` filter still needs CPU memory, frames must be copied back regardless. Benefit is modest.

### Summary table

| Change | Stage | Location | Impact |
|---|---|---|---|
| `gl: 'angle'` in `renderMedia` | Overlay render | `packages/compositor/src/index.ts` | High — software → Metal GPU rasterisation |
| Raise `concurrency` in `renderMedia` | Overlay render | `packages/compositor/src/index.ts` | Medium — more frames rendered in parallel |
| `-hwaccel videotoolbox` on source input | Composite | `packages/compositor/src/index.ts` | Low — decode offload, filter still runs on CPU |

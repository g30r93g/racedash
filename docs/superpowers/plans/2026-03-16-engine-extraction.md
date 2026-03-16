# @racedash/engine Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract orchestration logic from `apps/cli/src/` into a new `packages/engine` package so both the CLI and the forthcoming desktop app share a single, tested implementation.

**Architecture:** `timingSources.ts` moves to `packages/engine` verbatim; the render/timestamps/drivers orchestration from `apps/cli/src/index.ts` moves into `packages/engine/src/operations.ts`; the CLI becomes thin commander wrappers that call engine functions and format terminal output. All timing/config types live in `@racedash/engine`; all rendering/overlay types stay in `@racedash/core`.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, existing `@racedash/*` packages

---

## File Map

**New files:**
- `packages/engine/package.json`
- `packages/engine/tsconfig.json`
- `packages/engine/src/index.ts` — re-exports from all modules
- `packages/engine/src/types.ts` — engine-specific option/result types
- `packages/engine/src/timingSources.ts` — moved from `apps/cli/src/timingSources.ts`
- `packages/engine/src/operations.ts` — `listDrivers`, `generateTimestamps`, `joinVideos`, `runDoctor`, `renderSession`, `getRenderExperimentalWarning`
- `packages/engine/src/timingSources.test.ts` — moved + expanded from `apps/cli/src/timingSources.test.ts`
- `packages/engine/src/operations.test.ts` — tests for pure engine operation helpers
- `packages/engine/src/__fixtures__/` — moved from `apps/cli/src/__fixtures__/`

**Modified files:**
- `apps/cli/src/index.ts` — major refactor: remove all orchestration, import from `@racedash/engine`
- `apps/cli/src/index.test.ts` — remove engine-level tests, update imports
- `apps/cli/package.json` — add `@racedash/engine` dep, remove `@racedash/compositor`, `@racedash/scraper`, `@racedash/timestamps`, `cheerio`

**Deleted files:**
- `apps/cli/src/timingSources.ts`
- `apps/cli/src/timingSources.test.ts`
- `apps/cli/src/__fixtures__/` (moved to engine)

---

## Chunk 1: Engine Scaffold + timingSources Migration

### Task 1: Scaffold `packages/engine`

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `packages/engine/package.json`**

```json
{
  "name": "@racedash/engine",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@racedash/compositor": "workspace:*",
    "@racedash/core": "workspace:*",
    "@racedash/scraper": "workspace:*",
    "@racedash/timestamps": "workspace:*",
    "cheerio": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 2: Create `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/__fixtures__"]
}
```

- [ ] **Step 3: Create `packages/engine/src/index.ts` (empty for now)**

```ts
// exports added in subsequent tasks
```

- [ ] **Step 4: Run `pnpm install` from repo root to link the new workspace package**

```bash
pnpm install
```

Expected: no errors, `@racedash/engine` appears in workspace.

- [ ] **Step 5: Verify it builds**

```bash
pnpm --filter @racedash/engine build
```

Expected: `dist/index.js` created (contains `"use strict";` and empty exports — this is correct for an empty TypeScript file).

- [ ] **Step 6: Commit**

```bash
git add packages/engine/package.json packages/engine/tsconfig.json packages/engine/src/
git commit -m "feat(engine): scaffold @racedash/engine package"
```

---

### Task 2: Move `timingSources.ts` to engine

**Files:**
- Create: `packages/engine/src/timingSources.ts` (from `apps/cli/src/timingSources.ts`)
- Create: `packages/engine/src/__fixtures__/` (from `apps/cli/src/__fixtures__/`)
- Create: `packages/engine/src/timingSources.test.ts` (from `apps/cli/src/timingSources.test.ts`)
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Copy `timingSources.ts` to the engine**

Copy `apps/cli/src/timingSources.ts` to `packages/engine/src/timingSources.ts`. No changes to the file contents are needed — all imports (`@racedash/core`, `@racedash/scraper`, `@racedash/timestamps`, `cheerio`, `node:*`) resolve correctly from the new location.

Note: `buildManualDriver`, `buildLapTimestamps`, `buildRaceDrivers`, `buildLeaderboardDrivers` are exported from `timingSources.ts` but are **not** re-exported from `packages/engine/src/index.ts` (Step 4 below). This is intentional — they are internal implementation helpers used only within the engine, not part of its public API.

- [ ] **Step 2: Copy fixtures to engine**

```bash
cp -r apps/cli/src/__fixtures__ packages/engine/src/__fixtures__
```

- [ ] **Step 3: Copy and update `timingSources.test.ts`**

Copy `apps/cli/src/timingSources.test.ts` to `packages/engine/src/timingSources.test.ts`. The relative import `'./timingSources'` is already correct — it still resolves to the same-directory file after the move. The fixture paths (`join(__dirname, '__fixtures__', ...)`) also still work because the fixtures are copied to `packages/engine/src/__fixtures__/` in Step 2. No path changes are needed.

- [ ] **Step 4: Re-export from `packages/engine/src/index.ts`**

```ts
export {
  buildRaceLapSnapshots,
  buildSessionSegments,
  driverListsAreIdentical,
  filterDriverHighlights,
  flattenTimestamps,
  formatDriverDisplay,
  getDriversForDisplay,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolvePositionOverrides,
  resolveTimingSegments,
  validateManualTimingData,
  validatePositionOverrideConfig,
  TIMING_FEATURES,
  extractSpeedhiveSessionId,
  parseTeamsportEmailBody,
  parseDaytonaEmailBody,
  readBestEmlBody,
} from './timingSources'

export type {
  TimingSource,
  SegmentConfig,
  AlphaTimingSegmentConfig,
  TeamSportEmailSegmentConfig,
  DaytonaEmailSegmentConfig,
  MylapsSpeedhiveSegmentConfig,
  ManualSegmentConfig,
  BaseSegmentConfig,
  TimingConfig,
  LoadedTimingConfig,
  TimingCapabilities,
  ResolvedTimingSegment,
  DriversCommandSegment,
  PositionOverrideConfig,
  ManualTimingEntry,
} from './timingSources'
```

- [ ] **Step 5: Build and run engine tests**

```bash
pnpm --filter @racedash/engine build
pnpm --filter @racedash/engine test
```

Expected: 15 tests pass (same count as the original `timingSources.test.ts`). The tests that read `.eml` fixtures will pass because fixtures were copied to `packages/engine/src/__fixtures__/` in Step 2.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/timingSources.ts packages/engine/src/timingSources.test.ts packages/engine/src/__fixtures__/ packages/engine/src/index.ts
git commit -m "feat(engine): move timingSources to @racedash/engine"
```

---

### Task 3: Move engine-level tests from CLI `index.test.ts`

The CLI's `index.test.ts` tests four groups of functions. Three groups test business logic that is moving to the engine (`buildRaceLapSnapshots`, `resolvePositionOverrides`, `validatePositionOverrideConfig`). One group tests CLI-specific functions that stay in the CLI (`formatDoctorDiagnostics`, `getRenderExperimentalWarning`, `resolveOutputResolutionPreset`). This task moves the engine tests.

**Files:**
- Modify: `packages/engine/src/timingSources.test.ts`
- Modify: `apps/cli/src/index.test.ts`

- [ ] **Step 1: Append engine-level tests to `packages/engine/src/timingSources.test.ts`**

Append to `packages/engine/src/timingSources.test.ts`. The file already imports `DriverRow` from `@racedash/scraper` — merge the additional types into that existing import rather than adding a duplicate import block:

```ts
// In the existing @racedash/scraper import line, add ReplayLapData and ReplayLapEntry:
import type { DriverRow, ReplayLapData, ReplayLapEntry } from '@racedash/scraper'

// Add this import for the functions being tested:
import { buildRaceLapSnapshots, resolvePositionOverrides, validatePositionOverrideConfig } from './timingSources'
```

Then copy the following test suites verbatim from `apps/cli/src/index.test.ts`:
- The `makeEntry` helper function (note: it is named `makeEntry` in the source, not `makeReplayEntry`)
- `describe('buildRaceLapSnapshots', ...)` — copy all tests verbatim
- `describe('resolvePositionOverrides', ...)` — copy all tests verbatim
- `describe('validatePositionOverrideConfig', ...)` — copy all tests verbatim

- [ ] **Step 2: Run engine tests to verify they pass**

```bash
pnpm --filter @racedash/engine test
```

Expected: all tests pass (15 original + the moved tests).

- [ ] **Step 3: Remove moved test suites from `apps/cli/src/index.test.ts`**

Delete the `describe('buildRaceLapSnapshots', ...)`, `describe('resolvePositionOverrides', ...)`, and `describe('validatePositionOverrideConfig', ...)` blocks from `apps/cli/src/index.test.ts`. Update the import at the top to remove `buildRaceLapSnapshots`, `resolvePositionOverrides`, `validatePositionOverrideConfig` from the `'./index'` import.

Note: the `describe('getRenderExperimentalWarning', ...)` suite stays in `apps/cli/src/index.test.ts` for now — it will be removed in Chunk 3 (Task 7) when `getRenderExperimentalWarning` is deleted from `apps/cli/src/index.ts` and the CLI imports it from `@racedash/engine` instead.

- [ ] **Step 4: Run CLI tests to verify they still pass**

```bash
pnpm --filter @racedash/cli test
```

Expected: tests pass (reduced count — `formatDoctorDiagnostics`, `getRenderExperimentalWarning`, `resolveOutputResolutionPreset` suites remain).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/timingSources.test.ts apps/cli/src/index.test.ts
git commit -m "refactor(engine): move business logic tests to engine package"
```

---

## Chunk 2: Engine Types + Operations

### Task 4: Define engine option/result types

**Files:**
- Create: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `packages/engine/src/types.ts`**

```ts
import type { BoxPosition, CornerPosition } from '@racedash/core'
import type { DriversCommandSegment, ResolvedTimingSegment } from './timingSources'

export interface DriversOptions {
  configPath: string
  driverQuery?: string
}

export interface DriversResult {
  segments: DriversCommandSegment[]
  driverListsIdentical: boolean
}

export interface TimestampsOptions {
  configPath: string
  fps?: number
}

export interface TimestampsResult {
  chapters: string
  segments: ResolvedTimingSegment[]
  offsets: number[]
}

export interface RenderOptions {
  configPath: string
  /** Pre-resolved file paths — caller handles interactive selection. Single file or multiple (joined automatically). */
  videoPaths: string[]
  outputPath: string
  /** Absolute path to apps/renderer/src/index.ts — supplied by caller since engine cannot assume its location relative to the renderer. */
  rendererEntry: string
  style: string
  /** Resolved output dimensions. Pass undefined to use source video resolution. */
  outputResolution?: { width: number; height: number }
  overlayX?: number
  overlayY?: number
  boxPosition?: BoxPosition
  qualifyingTablePosition?: CornerPosition
  labelWindowSeconds?: number
  noCache?: boolean
  onlyRenderOverlay?: boolean
}

export interface RenderProgressEvent {
  phase: string
  /** 0–1 */
  progress: number
}

export interface RenderResult {
  outputPath: string
  overlayReused: boolean
}
```

- [ ] **Step 2: Export from `packages/engine/src/index.ts`**

```ts
export type {
  DriversOptions,
  DriversResult,
  TimestampsOptions,
  TimestampsResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
} from './types'
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @racedash/engine build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/index.ts
git commit -m "feat(engine): add engine option/result types"
```

---

### Task 5: Implement engine operations

**Files:**
- Create: `packages/engine/src/operations.ts`
- Create: `packages/engine/src/operations.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing tests for `getRenderExperimentalWarning`**

```ts
// packages/engine/src/operations.test.ts
import { describe, it, expect } from 'vitest'
import { getRenderExperimentalWarning } from './operations'

describe('getRenderExperimentalWarning', () => {
  it('returns undefined on non-Windows platforms', () => {
    expect(getRenderExperimentalWarning('darwin')).toBeUndefined()
    expect(getRenderExperimentalWarning('linux')).toBeUndefined()
  })

  it('returns a warning string on Windows', () => {
    const warning = getRenderExperimentalWarning('win32')
    expect(typeof warning).toBe('string')
    expect(warning!.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @racedash/engine test
```

Expected: FAIL — `getRenderExperimentalWarning` not defined.

- [ ] **Step 3: Create `packages/engine/src/operations.ts`**

```ts
import path from 'node:path'
import { access, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  collectDoctorDiagnostics,
  compositeVideo,
  getOverlayOutputPath,
  getOverlayRenderProfile,
  getVideoDuration,
  getVideoFps,
  getVideoResolution,
  joinVideos as compositorJoinVideos,
  renderOverlay,
} from '@racedash/compositor'
import type { BoxPosition, CornerPosition } from '@racedash/core'
import { DEFAULT_LABEL_WINDOW_SECONDS } from '@racedash/core'
import { formatChapters, parseOffset } from '@racedash/timestamps'
import {
  buildSessionSegments,
  driverListsAreIdentical,
  flattenTimestamps,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolveTimingSegments,
  resolvePositionOverrides,
} from './timingSources'
import type {
  DriversOptions,
  DriversResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
  TimestampsOptions,
  TimestampsResult,
} from './types'

export function getRenderExperimentalWarning(
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform !== 'win32') return undefined
  return 'Windows render support is experimental and may require fallback paths depending on your FFmpeg and GPU setup.'
}

export async function runDoctor(): Promise<Array<{ label: string; value: string }>> {
  return collectDoctorDiagnostics()
}

export async function joinVideos(files: string[], outputPath: string): Promise<void> {
  return compositorJoinVideos(files, outputPath)
}

export async function listDrivers(opts: DriversOptions): Promise<DriversResult> {
  const { segments: segmentConfigs, driverQuery } = await loadTimingConfig(opts.configPath, false)
  const highlightQuery = opts.driverQuery ?? driverQuery
  const segments = await resolveDriversCommandSegments(segmentConfigs, highlightQuery)
  return {
    segments,
    driverListsIdentical: driverListsAreIdentical(segments),
  }
}

export async function generateTimestamps(opts: TimestampsOptions): Promise<TimestampsResult> {
  const { segments: segmentConfigs, driverQuery } = await loadTimingConfig(opts.configPath, true)
  const resolvedSegments = await resolveTimingSegments(segmentConfigs, driverQuery)
  const offsets = segmentConfigs.map(segment => parseOffset(segment.offset, opts.fps))
  const { segments } = buildSessionSegments(resolvedSegments, offsets)
  return {
    chapters: formatChapters(flattenTimestamps(segments)),
    segments: resolvedSegments,
    offsets,
  }
}

const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 400, minimal: 400 }

function defaultBoxPositionForStyle(style: string): BoxPosition {
  return style === 'modern' ? 'bottom-center' : 'bottom-left'
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000
}

export async function renderSession(
  opts: RenderOptions,
  onProgress: (event: RenderProgressEvent) => void,
  onDiagnostic?: (diagnostic: { label: string; value: string }) => void,
): Promise<RenderResult> {
  let videoPath = opts.videoPaths[0]
  let tempJoinedVideo: string | null = null

  if (opts.videoPaths.length > 1) {
    tempJoinedVideo = path.join(tmpdir(), `racedash-joined-${randomUUID()}.mp4`)
    onProgress({ phase: 'Joining videos', progress: 0 })
    await compositorJoinVideos(opts.videoPaths, tempJoinedVideo)
    videoPath = tempJoinedVideo
    onProgress({ phase: 'Joining videos', progress: 1 })
  }

  try {
    const {
      segments: segmentConfigs,
      driverQuery,
      configBoxPosition,
      configTablePosition,
      styling,
    } = await loadTimingConfig(opts.configPath, true)

    // Validate positions from config file (CLI validates CLI-flag positions; engine validates config-sourced positions)
    const VALID_BOX_POSITIONS = ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right']
    const VALID_TABLE_POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
    if (configBoxPosition != null && !VALID_BOX_POSITIONS.includes(configBoxPosition)) {
      throw new Error(`config.boxPosition must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
    }
    if (configTablePosition != null && !VALID_TABLE_POSITIONS.includes(configTablePosition)) {
      throw new Error(`config.qualifyingTablePosition must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
    }

    const [durationSeconds, videoResolution, fps] = await Promise.all([
      getVideoDuration(videoPath),
      getVideoResolution(videoPath),
      getVideoFps(videoPath),
    ])

    const outputResolution = opts.outputResolution ?? videoResolution
    const frameDuration = 1 / fps

    const rawOffsets = segmentConfigs.map(segment => parseOffset(segment.offset, fps))
    const resolvedPositionOverrides = segmentConfigs.map((segment, index) =>
      resolvePositionOverrides(segment.positionOverrides, rawOffsets[index], index, fps),
    )
    const snappedOffsets = rawOffsets.map(raw =>
      roundMillis(Math.round(raw / frameDuration) * frameDuration),
    )

    const resolvedSegments = await resolveTimingSegments(segmentConfigs, driverQuery)
    const { segments, startingGridPosition } = buildSessionSegments(resolvedSegments, snappedOffsets)
    segments.forEach((segment, index) => {
      segment.positionOverrides = resolvedPositionOverrides[index]
    })

    const boxPosition = (
      opts.boxPosition ?? configBoxPosition ?? defaultBoxPositionForStyle(opts.style)
    ) as BoxPosition
    const resolvedTablePosition = (opts.qualifyingTablePosition ?? configTablePosition) as
      | CornerPosition
      | undefined

    // Compute overlayY from style strip heights if not explicitly provided
    let overlayY = opts.overlayY ?? 0
    const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
    if (stripHeight != null && opts.overlayY == null) {
      const scaledStrip = Math.round((stripHeight * outputResolution.width) / 1920)
      overlayY = boxPosition.startsWith('bottom')
        ? outputResolution.height - scaledStrip
        : 0
    }

    const overlayProps = {
      segments,
      startingGridPosition,
      fps,
      durationInFrames: Math.ceil(durationSeconds * fps),
      videoWidth: outputResolution.width,
      videoHeight: outputResolution.height,
      boxPosition,
      qualifyingTablePosition: resolvedTablePosition,
      styling,
      labelWindowSeconds: opts.labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS,
    }

    const overlayPath = getOverlayOutputPath(opts.outputPath)

    let overlayReused = false
    if (!opts.noCache) {
      try {
        await access(overlayPath)
        const overlayDuration = await getVideoDuration(overlayPath)
        overlayReused = overlayDuration > 0
      } catch {
        overlayReused = false
      }
    }

    if (!overlayReused) {
      await renderOverlay(
        opts.rendererEntry,
        opts.style,
        overlayProps,
        overlayPath,
        (progress) => onProgress({ phase: 'Rendering overlay', progress }),
      )
    }

    if (opts.onlyRenderOverlay) {
      return { outputPath: overlayPath, overlayReused }
    }

    await compositeVideo(
      videoPath,
      overlayPath,
      opts.outputPath,
      {
        fps,
        overlayX: opts.overlayX ?? 0,
        overlayY,
        durationSeconds,
        // Only pass output dimensions when an explicit resolution preset was requested.
        // Passing undefined lets FFmpeg skip the scale filter and use source dimensions.
        outputWidth: opts.outputResolution?.width,
        outputHeight: opts.outputResolution?.height,
        onDiagnostic,
      },
      (progress) => onProgress({ phase: 'Compositing', progress }),
    )

    return { outputPath: opts.outputPath, overlayReused }
  } finally {
    if (tempJoinedVideo) await unlink(tempJoinedVideo).catch(() => {})
  }
}
```

- [ ] **Step 4: Export from `packages/engine/src/index.ts`**

```ts
export {
  getRenderExperimentalWarning,
  runDoctor,
  joinVideos,
  listDrivers,
  generateTimestamps,
  renderSession,
} from './operations'

// Re-export getOverlayRenderProfile so CLI and desktop can display the render profile label
// without taking a direct dependency on @racedash/compositor
export { getOverlayRenderProfile } from '@racedash/compositor'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @racedash/engine test
```

Expected: all tests pass including `getRenderExperimentalWarning` suite.

- [ ] **Step 6: Build**

```bash
pnpm --filter @racedash/engine build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/operations.ts packages/engine/src/operations.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): implement engine operations"
```

---

## Chunk 3: CLI Refactor + Cleanup

### Task 6: Update `apps/cli/package.json`

**Files:**
- Modify: `apps/cli/package.json`

- [ ] **Step 1: Update CLI dependencies**

Replace the existing `dependencies` block:

```json
{
  "dependencies": {
    "@inquirer/prompts": "^5.0.0",
    "@racedash/core": "workspace:*",
    "@racedash/engine": "workspace:*",
    "commander": "^12.0.0"
  }
}
```

Remove from `dependencies`: `@racedash/compositor`, `@racedash/scraper`, `@racedash/timestamps`, `cheerio`.

Update the `prebuild` and `pretest` scripts. The engine's own deps (`@racedash/compositor`, `@racedash/scraper`, etc.) are not built by `pnpm --filter @racedash/engine build` alone when run outside turbo — they must be pre-built. Retain explicit dep building to keep direct invocations (e.g. on CI or in dev) reliable:

```json
{
  "scripts": {
    "prebuild": "pnpm --filter @racedash/core --filter @racedash/scraper --filter @racedash/timestamps --filter @racedash/compositor --filter @racedash/engine build",
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "pretest": "pnpm --filter @racedash/core --filter @racedash/scraper --filter @racedash/timestamps --filter @racedash/compositor --filter @racedash/engine build",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Run `pnpm install`**

```bash
pnpm install
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/package.json
git commit -m "refactor(cli): replace direct package deps with @racedash/engine"
```

---

### Task 7: Refactor `apps/cli/src/index.ts`

**Files:**
- Modify: `apps/cli/src/index.ts`

This is the largest single change in the plan. The CLI's command action bodies are replaced with calls to engine functions; terminal output formatting stays. Read the current `apps/cli/src/index.ts` in full before making changes.

- [ ] **Step 1: Update imports at the top of `apps/cli/src/index.ts`**

Replace the existing imports with:

```ts
#!/usr/bin/env node
import { program } from 'commander'
import path from 'node:path'
import type { BoxPosition, CornerPosition } from '@racedash/core'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
} from '@racedash/core'
import { resolveVideoFiles } from './select'
import {
  generateTimestamps,
  getRenderExperimentalWarning,
  getOverlayRenderProfile,
  joinVideos,
  listDrivers,
  renderSession,
  runDoctor,
  TIMING_FEATURES,
  formatDriverDisplay,
  filterDriverHighlights,
  driverListsAreIdentical,
} from '@racedash/engine'
import type { DriversCommandSegment } from '@racedash/engine'
```

- [ ] **Step 2: Replace the `drivers` command action**

```ts
program
  .command('drivers')
  .description('List drivers for the configured timing segments')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--driver <name>', 'Driver name to highlight (partial, case-insensitive)')
  .action(async (opts: { config: string; driver?: string }) => {
    try {
      console.error('Fetching...')
      const result = await listDrivers({ configPath: opts.config, driverQuery: opts.driver })

      process.stderr.write('\n')
      result.segments.forEach((segment, index) => {
        stat(`Segment ${index + 1}`, `[${segment.config.source}]  [${segment.config.mode}]`)
        if (segment.config.label) stat('  Label', segment.config.label)
        printCapabilities(segment.capabilities)
      })

      if (result.driverListsIdentical) {
        const drivers = result.segments[0]?.drivers ?? []
        printDriverList(drivers, result.segments[0]?.selectedDriver?.name, 'Drivers')
      } else {
        result.segments.forEach((segment, index) => {
          if (index > 0) process.stdout.write('\n')
          process.stdout.write(`Segment ${index + 1}  [${segment.config.source}]  [${segment.config.mode}]\n`)
          if (segment.config.label) process.stdout.write(`  Label: ${segment.config.label}\n`)
          printDriverList(segment.drivers, segment.selectedDriver?.name)
        })
      }
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

- [ ] **Step 3: Replace the `timestamps` command action**

```ts
program
  .command('timestamps')
  .description('Output YouTube chapter timestamps to stdout from a config file')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--fps <n>', 'Video fps used when any segment offset is given as "<frames> F"')
  .action(async (opts: { config: string; fps?: string }) => {
    try {
      const fps = parseOptionalFps(opts.fps)
      console.error('Fetching...')
      const result = await generateTimestamps({ configPath: opts.config, fps })

      process.stderr.write('\n')
      result.segments.forEach((resolvedSegment, index) => {
        const selectedDriver = resolvedSegment.selectedDriver!
        stat(
          `Segment ${index + 1}`,
          `[${resolvedSegment.config.source}]  [${resolvedSegment.config.mode}]  ${formatDriverDisplay(selectedDriver)}  ·  ${selectedDriver.laps.length} laps`,
        )
        stat('  Offset', formatOffsetTime(result.offsets[index]))
        if (resolvedSegment.config.label) stat('  Label', resolvedSegment.config.label)
        printCapabilities(resolvedSegment.capabilities)
      })

      console.log(result.chapters)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

- [ ] **Step 4: Replace the `join` command action**

```ts
program
  .command('join <files...>')
  .description('Concatenate GoPro chapter files into a single video (lossless)')
  .option('--output <path>', 'Output file path', './joined.mp4')
  .action(async (files: string[], opts: { output: string }) => {
    try {
      console.error(`Joining ${files.length} files...`)
      await joinVideos(files, opts.output)
      console.log(`Done: ${opts.output}`)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

- [ ] **Step 5: Replace the `doctor` command action**

```ts
program
  .command('doctor')
  .description('Inspect your machine and FFmpeg setup for rendering')
  .action(async () => {
    try {
      const diagnostics = await runDoctor()
      const warning = getRenderExperimentalWarning()
      const output = warning == null
        ? diagnostics
        : [{ label: 'Warning', value: warning }, ...diagnostics]
      console.log(formatDoctorDiagnostics(output))
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

- [ ] **Step 6: Replace the `render` command action**

The render action now calls `resolveVideoFiles` for interactive selection, resolves the renderer entry path, then delegates to `renderSession`:

```ts
program
  .command('render')
  .description('Render overlay onto video')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .requiredOption('--video <path>', 'Source video file path or directory')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--output-resolution <preset>', 'Output resolution: 1080p, 1440p, or 2160p')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels')
  .option('--box-position <pos>', 'Position for esports/minimal/modern')
  .option('--qualifying-table-position <pos>', 'Corner for qualifying table')
  .option('--label-window <seconds>', 'Seconds to show segment label', DEFAULT_LABEL_WINDOW_SECONDS.toString())
  .option('--no-cache', 'Force re-render the overlay')
  .option('--only-render-overlay', 'Render overlay file only, skip compositing')
  .action(async (opts: RenderOpts) => {
    try {
      const renderWarning = getRenderExperimentalWarning()
      if (renderWarning) process.stderr.write(`\n  Warning      ${renderWarning}\n`)

      if (opts.boxPosition != null && !VALID_BOX_POSITIONS.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
        process.exit(1)
      }
      if (opts.qualifyingTablePosition != null && !VALID_TABLE_POSITIONS.includes(opts.qualifyingTablePosition as CornerPosition)) {
        console.error(`Error: --qualifying-table-position must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
        process.exit(1)
      }

      const outputResolution = resolveOutputResolutionPreset(opts.outputResolution)
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? DEFAULT_LABEL_WINDOW_SECONDS.toString())
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }

      const selectedFiles = await resolveVideoFiles(opts.video)
      const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')

      const result = await renderSession(
        {
          configPath: opts.config,
          videoPaths: selectedFiles,
          outputPath: opts.output,
          rendererEntry,
          style: opts.style,
          outputResolution: outputResolution ? { width: outputResolution.width, height: outputResolution.height } : undefined,
          overlayX: parseInt(opts.overlayX, 10),
          overlayY: opts.overlayY != null ? parseInt(opts.overlayY, 10) : undefined,
          boxPosition: opts.boxPosition as BoxPosition | undefined,
          qualifyingTablePosition: opts.qualifyingTablePosition as CornerPosition | undefined,
          labelWindowSeconds,
          noCache: opts.noCache,
          onlyRenderOverlay: opts.onlyRenderOverlay,
        },
        makeProgressCallback,
        ({ label, value }) => stat(label, value),  // surfaces FFmpeg decode diagnostics to terminal
      )

      // Note: config.boxPosition / config.qualifyingTablePosition validation is now done inside renderSession.

      process.stderr.write('\n')
      console.log(result.outputPath)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })
```

Keep the existing `RenderOpts` interface, `VALID_BOX_POSITIONS`, `VALID_TABLE_POSITIONS`, `resolveOutputResolutionPreset`, `formatDoctorDiagnostics`, `printDriverList`, `printCapabilities`, `makeProgressCallback`, `progressBar`, `stat`, `formatOffsetTime`, `formatSeconds`, `formatFps`, `printStyling`, `parseOptionalFps` functions in the CLI — these are all terminal-formatting concerns.

Also keep `stat('Alpha', getOverlayRenderProfile().label)` in the render action body — `getOverlayRenderProfile` is now imported from `@racedash/engine` (which re-exports it from `@racedash/compositor`).

Remove from the CLI render action: the `configBoxPosition`/`configTablePosition` validation block (lines 274–279 of the original `index.ts`) — this validation has moved inside `renderSession` in the engine.

Remove `buildRaceLapSnapshots`, `resolvePositionOverrides`, `validatePositionOverrideConfig` from the bottom re-exports since those now come from `@racedash/engine`.

Also remove the `getRenderExperimentalWarning` test suite from `apps/cli/src/index.test.ts` at this point — the function is no longer defined in `apps/cli/src/index.ts`.

- [ ] **Step 7: Build CLI**

```bash
pnpm --filter @racedash/cli build
```

Expected: no TypeScript errors.

- [ ] **Step 8: Run CLI tests**

```bash
pnpm --filter @racedash/cli test
```

Expected: all remaining CLI tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "refactor(cli): replace orchestration with @racedash/engine calls"
```

---

### Task 8: Delete moved files from CLI

**Files:**
- Delete: `apps/cli/src/timingSources.ts`
- Delete: `apps/cli/src/timingSources.test.ts`
- Delete: `apps/cli/src/__fixtures__/`

- [ ] **Step 1: Delete files**

```bash
rm apps/cli/src/timingSources.ts
rm apps/cli/src/timingSources.test.ts
rm -r apps/cli/src/__fixtures__
```

- [ ] **Step 2: Build and test everything**

```bash
pnpm build
pnpm test
```

Expected: all packages build, all tests pass (`@racedash/engine` 39+ tests, `@racedash/cli` reduced count).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(cli): remove timingSources files now in @racedash/engine"
```

---

### Task 9: Final smoke test

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass across all packages.

- [ ] **Step 2: Verify CLI still functions end-to-end**

```bash
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js doctor
```

Expected: help text shows all commands; `doctor` outputs diagnostics.

- [ ] **Step 3: Final commit if any fixup changes were needed**

```bash
git add -A
git commit -m "chore: finalise engine extraction"
```

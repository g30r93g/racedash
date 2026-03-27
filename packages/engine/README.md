# @racedash/engine

Orchestration layer that composes scraper, timestamps, and compositor into the full timing → render pipeline.

## Overview

The engine is the single integration point for both `apps/cli` and `apps/desktop`. It reads session config files, fetches timing data via the scraper, calculates timestamps, builds `SessionSegment` data for the renderer, and drives the compositor to produce the final video.

## Local Development

```bash
pnpm --filter @racedash/engine build
pnpm --filter @racedash/engine test          # runs with --pool forks
pnpm --filter @racedash/engine test:coverage
```

Requires FFmpeg/ffprobe on `PATH` for render-related tests.

## Architecture

| File | Purpose |
|---|---|
| `src/timingSources.ts` | Config loading, source resolution (AlphaTiming, Speedhive, email, manual, cached), `SessionSegment` construction |
| `src/operations.ts` | Top-level async operations: `listDrivers`, `generateTimestamps`, `renderSession`, `runDoctor`, `joinVideos` |
| `src/types.ts` | Input/output option types for each operation |
| `src/index.ts` | Public barrel — re-exports everything including compositor utilities |

**Timing sources** (`TimingSource`):
- `alphaTiming` — fetches from AlphaTiming URL
- `mylapsSpeedhive` — fetches from Speedhive session URL
- `teamsportEmail` / `daytonaEmail` — parses saved `.eml` files
- `manual` — inline lap array in config
- `cached` — pre-resolved data from a previous run

**Key operations:**

| Function | Description |
|---|---|
| `listDrivers(opts)` | Fetch all segments, return driver lists |
| `generateTimestamps(opts)` | Resolve segments, compute timestamps, format YouTube chapters |
| `renderSession(opts, onProgress)` | Full pipeline: fetch → timestamps → render overlay → composite |
| `runDoctor()` | Collect and return FFmpeg/GPU diagnostics |

## Testing

```bash
pnpm --filter @racedash/engine test
```

Tests include unit tests (`operations.test.ts`, `timingSources.test.ts`) and property-based tests with `fast-check`. Vitest with `--pool forks`.

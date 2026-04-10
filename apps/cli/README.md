# @racedash/cli

Command-line tool for timing data extraction, YouTube chapter generation, and race overlay rendering.

## Overview

A `commander`-based CLI that wraps `@racedash/engine`. All commands read a JSON session config file. See the root README for the full CLI reference including config format and all flags.

## Local Development

```bash
# Run any command in dev mode (no build step)
pnpm racedash <command> [options]

# Build to dist/
pnpm --filter @racedash/cli build

# Type-check
pnpm --filter @racedash/cli typecheck
```

The `pnpm racedash` script at the monorepo root invokes `tsx src/index.ts` directly.

## Commands

| Command | Description |
|---|---|
| `drivers` | List drivers across configured segments |
| `timestamps` | Print YouTube chapter timestamps to stdout |
| `join` | Lossless GoPro chapter concatenation |
| `doctor` | Print FFmpeg/GPU diagnostics |
| `render` | Render lap timer overlay onto video |
| `bench` | Benchmark the render pipeline without Electron |

See the root README for detailed flag documentation.

### `bench`

Performance benchmark harness for the render pipeline. Runs `renderBatch` directly — no Electron, no UI, no rebuild cycle. Useful for profiling render performance in isolation and comparing changes across runs.

```bash
pnpm --filter @racedash/cli bench -- <project.json> [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-t, --type <type>` | Job type: `entireProject`, `segment`, or `lap` | `lap` |
| `-s, --segment <index>` | Segment index | `0` |
| `-l, --lap <number>` | Lap number | `5` |
| `--style <style>` | Overlay style | `modern` |
| `-r, --runs <count>` | Number of runs (averages results) | `1` |
| `-o, --output <dir>` | Output directory | `$TMPDIR/racedash-bench-<ts>` |
| `--overlay-only` | Render overlay only, skip FFmpeg composite | — |

**Examples:**

```bash
# Full pipeline (overlay + composite) for segment 0, lap 5
pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5

# Overlay only (isolate Remotion performance)
pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5 --overlay-only

# Multiple runs for stable averages
pnpm --filter @racedash/cli bench -- /path/to/project.json -t lap -s 0 -l 5 -r 3

# Segment render
pnpm --filter @racedash/cli bench -- /path/to/project.json -t segment -s 1
```

Output includes per-phase timing breakdowns with percentage bars and, for multi-run benchmarks, summary statistics (avg/min/max/spread) across all phases.

## Architecture

| File | Purpose |
|---|---|
| `src/index.ts` | All command definitions and progress rendering |
| `src/bench.ts` | Standalone render benchmark harness (bypasses Electron) |
| `src/select.ts` | Resolves video file paths (single file or directory glob) |

The CLI delegates all business logic to `@racedash/engine`. It is responsible only for parsing CLI flags, displaying progress bars, and formatting output.

## Testing

```bash
pnpm --filter @racedash/cli test
pnpm --filter @racedash/cli test:coverage
```

Unit tests cover CLI utility functions (flag parsing, output formatting). Vitest, no subprocess spawning in tests.

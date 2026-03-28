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

See the root README for detailed flag documentation.

## Architecture

| File | Purpose |
|---|---|
| `src/index.ts` | All command definitions and progress rendering |
| `src/select.ts` | Resolves video file paths (single file or directory glob) |

The CLI delegates all business logic to `@racedash/engine`. It is responsible only for parsing CLI flags, displaying progress bars, and formatting output.

## Testing

```bash
pnpm --filter @racedash/cli test
pnpm --filter @racedash/cli test:coverage
```

Unit tests cover CLI utility functions (flag parsing, output formatting). Vitest, no subprocess spawning in tests.

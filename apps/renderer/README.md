# @racedash/renderer

Remotion compositions for lap timer video overlay styles. Consumed at render time by `@racedash/compositor` via `renderOverlay()`.

## Overview

Defines five overlay styles as React + Remotion components, each registered in a central registry keyed by composition ID. At render time, `@racedash/compositor` bundles this package's entry point and selects the composition by ID (e.g. `"banner"`, `"esports"`).

## Local Development

### Preview in the Remotion Studio

```bash
pnpm --filter @racedash/renderer preview
# Opens Remotion Studio at http://localhost:3000
```

### Type-check

```bash
pnpm --filter @racedash/renderer build    # tsc --noEmit
```

This package does not emit JS — the `build` script only type-checks. Remotion bundles from source at render time.

## Architecture

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — calls `registerRoot(RemotionRoot)` |
| `src/Root.tsx` | Registers all compositions from the registry with default preview props |
| `src/registry.ts` | Maps composition IDs → components + canvas dimensions |
| `src/styles/` | One directory per overlay style |

### Compositions

| ID | Canvas size | Description |
|---|---|---|
| `banner` | 1920 × 500 | Full-width top bar with lap timer |
| `esports` | 1920 × 400 | Floating card with gradient accent |
| `geometric-banner` | 1920 × 500 | Coloured polygon sections |
| `minimal` | 1920 × 400 | Compact floating card |
| `modern` | 1920 × 1080 | Horizontal bar with diagonal stripe |

All compositions set `scaleWithVideo: true` — the canvas width scales to match the source video at render time.

Shared logic lives in `src/timing.ts`, `src/activeSegment.ts`, `src/leaderboard.ts`, etc.

## Testing

```bash
pnpm --filter @racedash/renderer test
pnpm --filter @racedash/renderer test:coverage
```

Unit tests cover timing calculations, active segment detection, leaderboard state, and position logic. Vitest with jsdom.

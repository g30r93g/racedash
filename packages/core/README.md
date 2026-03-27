# @racedash/core

Pure TypeScript types and constants shared across the entire RaceDash monorepo. No runtime dependencies — build output is `.d.ts` declarations and a thin `.js` barrel.

## Overview

Defines the domain model: `Lap`, `LapTimestamp`, `SessionData`, `SessionSegment`, `OverlayProps`, all overlay styling interfaces (`BannerStyling`, `EsportsStyling`, `MinimalStyling`, etc.), and supporting enums (`SessionMode`, `BoxPosition`, `CornerPosition`). Also exports a small set of overlay default constants.

## Local Development

```bash
# Build (emits to dist/)
pnpm --filter @racedash/core build

# Type-check without emitting
pnpm --filter @racedash/core typecheck
```

This package has no tests — it is types only.

## Architecture

Single entry point: `src/index.ts`. All types and constants are exported from that file. Downstream packages import directly:

```ts
import type { SessionSegment, OverlayProps } from '@racedash/core'
```

See the root README for the full package dependency graph.

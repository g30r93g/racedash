# @racedash/timestamps

Offset parsing, lap timestamp calculation, and YouTube chapter formatting.

## Overview

Pure utility functions with no I/O or side effects. Converts session offset strings (timestamp or frame-count formats) to seconds, maps lap data to video timestamps, and formats results as YouTube chapter text.

## Local Development

```bash
pnpm --filter @racedash/timestamps build
pnpm --filter @racedash/timestamps test
pnpm --filter @racedash/timestamps test:coverage
```

## Architecture

Single source file: `src/index.ts`. All functions are pure and stateless.

| Export | Purpose |
|---|---|
| `parseOffset(offsetStr, fps?)` | Parse `"M:SS.sss"`, `"H:MM:SS"`, or `"12345 F"` → seconds |
| `calculateTimestamps(laps, offsetSeconds)` | Map `Lap[]` → `LapTimestamp[]` (absolute video seconds) |
| `formatYtTimestamp(seconds)` | Format seconds as `M:SS` or `H:MM:SS` |
| `formatLapTime(seconds)` | Format lap duration as `M:SS.mmm` |
| `formatChapters(timestamps)` | Format `LapTimestamp[]` as YouTube chapter text block |

## Testing

```bash
pnpm --filter @racedash/timestamps test
```

Unit tests cover offset parsing edge cases, timestamp calculation, and chapter formatting. Vitest, no fixtures needed.

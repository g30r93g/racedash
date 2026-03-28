# @racedash/scraper

Web scraper for AlphaTiming lap timing pages. Fetches and parses driver lap data, qualifying grids, and race replay snapshots.

## Overview

Provides HTML fetchers and Cheerio-based parsers for AlphaTiming's `/laptimes`, `/grid`, and `/replay` tabs. Includes per-URL rate limiting (10 requests/minute) with exponential backoff, and per-request retry logic (3 attempts, 30 s timeout).

## Local Development

```bash
pnpm --filter @racedash/scraper build
pnpm --filter @racedash/scraper test
pnpm --filter @racedash/scraper test:coverage
```

No environment variables or external services needed — tests run against HTML fixtures in `src/__fixtures__/`.

## Architecture

Single source file: `src/index.ts`. Key exports:

| Export | Purpose |
|---|---|
| `fetchHtml` / `fetchGridHtml` / `fetchReplayHtml` | Fetch an AlphaTiming tab with rate limiting + retries |
| `parseDrivers` | Parse laptimes table → `DriverRow[]` |
| `parseGrid` | Parse grid table → `GridEntry[]` |
| `parseReplayLapData` | Parse embedded `lapData` JSON → `ReplayLapData` |
| `MAX_REQUESTS_PER_WINDOW` / `WINDOW_MS` | Rate-limit constants (10 req / 60 s) |
| `_resetRateLimit` | Test helper to clear rate-limit state |

Rate limiting is tracked per resolved URL. Backoff starts at 1 s and doubles up to 30 s.

## Testing

```bash
pnpm --filter @racedash/scraper test
```

Unit tests use Vitest with saved HTML fixtures. No network calls are made during tests.

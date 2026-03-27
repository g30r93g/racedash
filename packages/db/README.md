# @racedash/db

Drizzle ORM schema, query helpers, and database client for RaceDash Cloud. PostgreSQL via Neon's serverless driver.

## Overview

Defines 9 tables and exposes typed query helpers for credit management, license validation, job tracking, and social uploads. Used by `apps/api` and `infra/lambdas`.

## Local Development

### Start a local Postgres instance

```bash
# From monorepo root — starts Postgres on port 5433
pnpm local:up
```

### Push schema

```bash
DATABASE_URL="postgresql://racedash:racedash_local@localhost:5433/racedash_local" \
  pnpm drizzle-kit push --force
```

### Generate migrations

```bash
pnpm --filter @racedash/db db:generate
```

### Build

```bash
pnpm --filter @racedash/db build
```

## Schema

| Table | Purpose |
|---|---|
| `users` | Clerk-synced user records |
| `licenses` | License tier and status per user |
| `credit_packs` | Purchased credit packs |
| `credit_reservations` | In-flight render credit holds |
| `credit_reservation_packs` | Links reservations to specific packs |
| `jobs` | Cloud render jobs (status lifecycle: `uploading` → `queued` → `rendering` → `compositing` → `complete` / `failed`) |
| `social_uploads` | YouTube upload records and status |
| `connected_accounts` | OAuth tokens for YouTube |
| `admin_audit_log` | Admin action history |

## Architecture

| File | Purpose |
|---|---|
| `src/client.ts` | `createDb(url)` — creates a Drizzle instance via Neon HTTP |
| `src/schema/` | One file per table |
| `src/helpers/` | Business logic: `reserveCredits`, `consumeCredits`, `releaseCredits`, `computeCredits`, `getSlotLimit`, `validateLicenseTier`, `logAdminAction`, etc. |
| `src/types.ts` | Enum string types and constant arrays |
| `src/errors.ts` | `InsufficientCreditsError` |

## Testing

```bash
# Unit tests (no DB required — uses mocks)
pnpm --filter @racedash/db test

# Integration tests against a real Postgres instance
pnpm --filter @racedash/db test:db
```

Tests use Vitest and `fast-check` for property-based testing of credit and license helper logic. The `test:db` script starts a temporary Postgres container via `test/run-with-db.sh`.

## Deployment / Productionising

In production the `DATABASE_URL` points to a [Neon](https://neon.tech) serverless PostgreSQL database. The client uses `@neondatabase/serverless` (HTTP-based, no persistent connections) which is suitable for Lambda cold starts.

Schema changes are applied via `drizzle-kit push` (development) or generated migration files (production).

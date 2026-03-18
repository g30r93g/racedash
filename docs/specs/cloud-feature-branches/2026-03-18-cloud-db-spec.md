# feature/cloud-db — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-db`
**Depends on:** nothing — first to land
**Package:** `packages/db` (`@racedash/db`)

---

## Overview

This branch creates `packages/db`, a new monorepo package that provides all database concerns for RaceDash Cloud. It contains the Drizzle ORM schema for eight tables, a Neon serverless client factory, credit helpers (reserve/release/consume with FIFO depletion), license helpers (tier validation, expiry checks, concurrent render limits), a slot signaling helper for the Step Functions pipeline, and the `computeCredits` formula. The package has no runtime dependencies on any other `@racedash/*` package and is the foundation that every other `feature/cloud-*` branch depends on.

---

## Scope

### In scope

- Drizzle ORM schema definitions for all eight tables: `users`, `licenses`, `credit_packs`, `jobs`, `social_uploads`, `connected_accounts`, `credit_reservations`, `credit_reservation_packs`
- All indexes and constraints defined in Drizzle
- Neon serverless client factory (`createDb`)
- Credit helpers: `reserveCredits`, `releaseCredits`, `consumeCredits`
- License helpers: `getSlotLimit`, `countActiveRenders`, `validateLicenseTier`, `checkLicenseExpiry`
- Slot signaling helper: `claimNextQueuedSlotToken`
- `computeCredits` pure function
- TypeScript type exports for all table row types and enums
- Drizzle migration generation config (`drizzle.config.ts`)
- Unit and property-based tests using Vitest

### Out of scope

- Running migrations against a live database (handled by deployment)
- API endpoints (owned by `cloud-auth`, `cloud-licensing`, `cloud-rendering`)
- AWS infrastructure (owned by `cloud-infra`)
- Stripe integration (owned by `cloud-licensing`)
- Clerk integration (owned by `cloud-auth`)
- UI of any kind
- Seed data scripts (can be added later)

---

## Functional Requirements

1. **FR-1:** The package must export a Drizzle schema covering all eight tables with the exact columns, types, constraints, and indexes defined in this spec.
2. **FR-2:** `reserveCredits` must atomically reserve credits using FIFO depletion (soonest-expiring pack first), creating a `credit_reservation` and one or more `credit_reservation_packs` records, and decrementing `rc_remaining` on affected packs. It must throw `InsufficientCreditsError` if the user's total available balance is less than the requested amount.
3. **FR-3:** `releaseCredits` must restore credits only to non-expired packs. Credits originally drawn from packs that have since expired are forfeited. The operation must be idempotent: if the reservation status is not `'reserved'`, it returns early without error.
4. **FR-4:** `consumeCredits` must update the reservation status to `'consumed'` and set `settled_at` to the current timestamp. No pack balance changes are needed (already decremented at reservation time). Must be idempotent: if already consumed, return early.
5. **FR-5:** `getSlotLimit` must return `1` for `'plus'` tier and `3` for `'pro'` tier.
6. **FR-6:** `countActiveRenders` must return the count of a user's jobs in `'rendering'` or `'compositing'` status.
7. **FR-7:** `validateLicenseTier` must confirm a user has an active license of a given tier or higher. Pro is higher than Plus.
8. **FR-8:** `checkLicenseExpiry` must return whether a user's license is currently active (not expired, not cancelled).
9. **FR-9:** `claimNextQueuedSlotToken` must atomically claim the oldest queued job's `slot_task_token` for a given user, setting it to `NULL` in the same statement and returning the token value. If no claimable token exists, return `null`.
10. **FR-10:** `computeCredits` must calculate render credit cost based on resolution, FPS, and duration using the formula from the epic spec.
11. **FR-11:** The Neon client factory must accept a `DATABASE_URL` and return a Drizzle instance configured for the Neon serverless driver.

---

## Non-Functional Requirements

1. **NFR-1:** All credit operations (`reserveCredits`, `releaseCredits`) must execute within a single database transaction to ensure atomicity.
2. **NFR-2:** `claimNextQueuedSlotToken` must use a single atomic `UPDATE ... RETURNING` statement to prevent double-signaling under concurrent execution.
3. **NFR-3:** The package must compile with `tsc` and produce CommonJS output consistent with the monorepo's `tsconfig.base.json`.
4. **NFR-4:** All exported functions must have complete TypeScript type signatures (no `any` types).
5. **NFR-5:** The package must have zero runtime dependencies on other `@racedash/*` packages.
6. **NFR-6:** Credit FIFO depletion must order by `expires_at ASC` and must correctly handle partial draws across multiple packs in a single reservation.
7. **NFR-7:** All timestamp columns must use `timestamp with time zone` to avoid timezone ambiguity.
8. **NFR-8:** The package must export Drizzle migration config so that `pnpm drizzle-kit generate` produces migration SQL.

---

## Package Structure

```
packages/db/
  package.json
  tsconfig.json
  drizzle.config.ts
  src/
    index.ts                        # barrel export
    client.ts                       # Neon serverless client factory
    schema/
      index.ts                      # re-exports all tables
      users.ts
      licenses.ts
      credit-packs.ts
      credit-reservations.ts
      credit-reservation-packs.ts
      jobs.ts
      social-uploads.ts
      connected-accounts.ts
    helpers/
      index.ts                      # re-exports all helpers
      credits.ts                    # reserveCredits, releaseCredits, consumeCredits
      licenses.ts                   # getSlotLimit, countActiveRenders, validateLicenseTier, checkLicenseExpiry
      slots.ts                      # claimNextQueuedSlotToken
      compute-credits.ts            # computeCredits (pure function)
    types.ts                        # shared types and enums
    errors.ts                       # custom error classes
  test/
    helpers/
      credits.test.ts
      licenses.test.ts
      slots.test.ts
      compute-credits.test.ts
    properties/
      credits.property.test.ts
```

---

## Schema Definitions

### Shared Enums

```ts
// src/types.ts
export const LICENSE_TIERS = ['plus', 'pro'] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

export const LICENSE_STATUSES = ['active', 'expired', 'cancelled'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const JOB_STATUSES = ['uploading', 'queued', 'rendering', 'compositing', 'complete', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SOCIAL_UPLOAD_STATUSES = ['queued', 'uploading', 'processing', 'live', 'failed'] as const;
export type SocialUploadStatus = (typeof SOCIAL_UPLOAD_STATUSES)[number];

export const RESERVATION_STATUSES = ['reserved', 'consumed', 'released'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
```

### `users`

```ts
// src/schema/users.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').unique().notNull(),
  email: text('email').notNull(),
  billingCountry: text('billing_country'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `clerk_id` | `text` | `UNIQUE NOT NULL` |
| `email` | `text` | `NOT NULL` |
| `billing_country` | `text` | nullable |
| `stripe_customer_id` | `text` | nullable |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

### `licenses`

```ts
// src/schema/licenses.ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const licenseTierEnum = pgEnum('license_tier', ['plus', 'pro']);
export const licenseStatusEnum = pgEnum('license_status', ['active', 'expired', 'cancelled']);

export const licenses = pgTable('licenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  tier: licenseTierEnum('tier').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: licenseStatusEnum('status').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('licenses_user_id_idx').on(table.userId),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `tier` | `license_tier` enum | `NOT NULL` (`'plus'` or `'pro'`) |
| `stripe_customer_id` | `text` | nullable |
| `stripe_subscription_id` | `text` | nullable |
| `status` | `license_status` enum | `NOT NULL` |
| `starts_at` | `timestamptz` | `NOT NULL` |
| `expires_at` | `timestamptz` | `NOT NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**Indexes:** `licenses_user_id_idx` on `(user_id)`

### `credit_packs`

```ts
// src/schema/credit-packs.ts
import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { sql } from 'drizzle-orm';

export const creditPacks = pgTable('credit_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  packName: text('pack_name').notNull(),
  rcTotal: integer('rc_total').notNull(),
  rcRemaining: integer('rc_remaining').notNull(),
  priceGbp: numeric('price_gbp', { precision: 10, scale: 2 }).notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id').unique().notNull(),
}, (table) => [
  index('credit_packs_user_fifo_idx')
    .on(table.userId, table.expiresAt)
    .where(sql`rc_remaining > 0`),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `pack_name` | `text` | `NOT NULL` |
| `rc_total` | `integer` | `NOT NULL` |
| `rc_remaining` | `integer` | `NOT NULL` |
| `price_gbp` | `numeric(10,2)` | `NOT NULL` |
| `purchased_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `expires_at` | `timestamptz` | `NOT NULL` (= `purchased_at + 12 months`) |
| `stripe_payment_intent_id` | `text` | `UNIQUE NOT NULL` |

**Indexes:** `credit_packs_user_fifo_idx` on `(user_id, expires_at ASC) WHERE rc_remaining > 0` — partial index for efficient FIFO credit queries.

### `credit_reservations`

```ts
// src/schema/credit-reservations.ts
import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { jobs } from './jobs';

export const reservationStatusEnum = pgEnum('reservation_status', ['reserved', 'consumed', 'released']);

export const creditReservations = pgTable('credit_reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).unique().notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  rcAmount: integer('rc_amount').notNull(),
  status: reservationStatusEnum('status').notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `job_id` | `uuid` | `FK jobs.id UNIQUE NOT NULL` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `rc_amount` | `integer` | `NOT NULL` |
| `status` | `reservation_status` enum | `NOT NULL DEFAULT 'reserved'` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `settled_at` | `timestamptz` | nullable |

### `credit_reservation_packs`

```ts
// src/schema/credit-reservation-packs.ts
import { pgTable, uuid, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { creditReservations } from './credit-reservations';
import { creditPacks } from './credit-packs';

export const creditReservationPacks = pgTable('credit_reservation_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  reservationId: uuid('reservation_id').references(() => creditReservations.id).notNull(),
  packId: uuid('pack_id').references(() => creditPacks.id).notNull(),
  rcDeducted: integer('rc_deducted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('credit_reservation_packs_reservation_id_idx').on(table.reservationId),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `reservation_id` | `uuid` | `FK credit_reservations.id NOT NULL` |
| `pack_id` | `uuid` | `FK credit_packs.id NOT NULL` |
| `rc_deducted` | `integer` | `NOT NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**Indexes:** `credit_reservation_packs_reservation_id_idx` on `(reservation_id)`

### `jobs`

```ts
// src/schema/jobs.ts
import { pgTable, uuid, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { sql } from 'drizzle-orm';

export const jobStatusEnum = pgEnum('job_status', [
  'uploading', 'queued', 'rendering', 'compositing', 'complete', 'failed',
]);

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  status: jobStatusEnum('status').notNull().default('uploading'),
  config: jsonb('config').notNull(),
  inputS3Keys: text('input_s3_keys').array().notNull(),
  uploadIds: jsonb('upload_ids'),
  outputS3Key: text('output_s3_key'),
  downloadExpiresAt: timestamp('download_expires_at', { withTimezone: true }),
  slotTaskToken: text('slot_task_token'),
  renderTaskToken: text('render_task_token'),
  remotionRenderId: text('remotion_render_id'),
  rcCost: integer('rc_cost'),
  sfnExecutionArn: text('sfn_execution_arn'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('jobs_user_id_status_idx').on(table.userId, table.status),
  index('jobs_user_queued_slot_idx')
    .on(table.userId, table.createdAt)
    .where(sql`status = 'queued' AND slot_task_token IS NOT NULL`),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `status` | `job_status` enum | `NOT NULL DEFAULT 'uploading'` |
| `config` | `jsonb` | `NOT NULL` |
| `input_s3_keys` | `text[]` | `NOT NULL` |
| `upload_ids` | `jsonb` | nullable |
| `output_s3_key` | `text` | nullable |
| `download_expires_at` | `timestamptz` | nullable |
| `slot_task_token` | `text` | nullable |
| `render_task_token` | `text` | nullable |
| `remotion_render_id` | `text` | nullable |
| `rc_cost` | `integer` | nullable |
| `sfn_execution_arn` | `text` | nullable |
| `error_message` | `text` | nullable |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**Indexes:**
- `jobs_user_id_status_idx` on `(user_id, status)` — efficient active render counting
- `jobs_user_queued_slot_idx` on `(user_id, created_at) WHERE status = 'queued' AND slot_task_token IS NOT NULL` — partial index for slot signaling query

### `social_uploads`

```ts
// src/schema/social-uploads.ts
import { pgTable, uuid, text, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { jobs } from './jobs';
import { creditReservations } from './credit-reservations';

export const socialUploadStatusEnum = pgEnum('social_upload_status', [
  'queued', 'uploading', 'processing', 'live', 'failed',
]);

export const socialUploads = pgTable('social_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: text('platform').notNull(),
  status: socialUploadStatusEnum('status').notNull().default('queued'),
  metadata: jsonb('metadata'),
  rcCost: integer('rc_cost').notNull().default(10),
  creditReservationId: uuid('credit_reservation_id').references(() => creditReservations.id),
  platformUrl: text('platform_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('social_uploads_job_id_idx').on(table.jobId),
  index('social_uploads_user_id_idx').on(table.userId),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `job_id` | `uuid` | `FK jobs.id NOT NULL` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `platform` | `text` | `NOT NULL` |
| `status` | `social_upload_status` enum | `NOT NULL DEFAULT 'queued'` |
| `metadata` | `jsonb` | nullable |
| `rc_cost` | `integer` | `NOT NULL DEFAULT 10` |
| `credit_reservation_id` | `uuid` | `FK credit_reservations.id`, nullable |
| `platform_url` | `text` | nullable |
| `error_message` | `text` | nullable |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**Indexes:** `social_uploads_job_id_idx` on `(job_id)`, `social_uploads_user_id_idx` on `(user_id)`

### `connected_accounts`

```ts
// src/schema/connected-accounts.ts
import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: text('platform').notNull(),
  accountName: text('account_name'),
  accountId: text('account_id'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => [
  unique('connected_accounts_user_platform_uniq').on(table.userId, table.platform),
]);
```

**Columns:**

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | `FK users.id NOT NULL` |
| `platform` | `text` | `NOT NULL` |
| `account_name` | `text` | nullable |
| `account_id` | `text` | nullable |
| `access_token` | `text` | `NOT NULL` (encrypted at rest by application layer) |
| `refresh_token` | `text` | nullable (encrypted at rest by application layer) |
| `connected_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `last_used_at` | `timestamptz` | nullable |

**Constraints:** `UNIQUE (user_id, platform)`

---

## Credit Helpers

All credit helpers live in `src/helpers/credits.ts`.

### `reserveCredits`

```ts
interface ReserveCreditsInput {
  db: DrizzleDb;
  userId: string;
  jobId: string;
  rcAmount: number;
}

interface ReserveCreditsResult {
  reservationId: string;
  packBreakdown: Array<{ packId: string; rcDeducted: number }>;
}

async function reserveCredits(input: ReserveCreditsInput): Promise<ReserveCreditsResult>;
```

**Behavioral contract:**

1. Begin a database transaction.
2. Query the user's credit packs ordered by `expires_at ASC`, filtered to `rc_remaining > 0` and `expires_at > now()`. Lock the rows with `FOR UPDATE` to prevent concurrent reservation races.
3. Sum `rc_remaining` across all qualifying packs. If total < `rcAmount`, roll back and throw `InsufficientCreditsError`.
4. Walk packs in FIFO order (soonest-expiring first). For each pack, deduct `min(pack.rcRemaining, remainingToReserve)` from `rc_remaining`. Record each deduction as a `credit_reservation_packs` entry. Continue until the full `rcAmount` is covered.
5. Insert a `credit_reservations` row with status `'reserved'`.
6. Insert all `credit_reservation_packs` rows.
7. Update each affected pack's `rc_remaining` via individual `UPDATE` statements within the transaction.
8. Commit and return the reservation ID and pack breakdown.

**Error:** Throws `InsufficientCreditsError` (exported from `src/errors.ts`) if the user does not have enough unexpired credits.

### `releaseCredits`

```ts
interface ReleaseCreditsInput {
  db: DrizzleDb;
  reservationId: string;
}

async function releaseCredits(input: ReleaseCreditsInput): Promise<void>;
```

**Behavioral contract:**

1. Fetch the reservation. If `status !== 'reserved'`, return early (idempotent).
2. Begin a database transaction.
3. Fetch all `credit_reservation_packs` for this reservation, joined with their `credit_packs`.
4. For each reservation pack entry:
   - If the pack's `expires_at > now()`: add `rc_deducted` back to the pack's `rc_remaining`.
   - If the pack has expired: skip (credits are forfeited).
5. Update the reservation: `status = 'released'`, `settled_at = now()`.
6. Commit.

### `consumeCredits`

```ts
interface ConsumeCreditsInput {
  db: DrizzleDb;
  reservationId: string;
}

async function consumeCredits(input: ConsumeCreditsInput): Promise<void>;
```

**Behavioral contract:**

1. Fetch the reservation. If `status !== 'reserved'`, return early (idempotent).
2. Update the reservation: `status = 'consumed'`, `settled_at = now()`.
3. No pack balance changes needed — credits were already decremented at reservation time.

---

## License Helpers

All license helpers live in `src/helpers/licenses.ts`.

### `getSlotLimit`

```ts
function getSlotLimit(tier: LicenseTier): 1 | 3;
```

Pure function. Returns `1` for `'plus'`, `3` for `'pro'`. Throws if tier is not recognized (defensive guard for future tiers).

### `countActiveRenders`

```ts
async function countActiveRenders(db: DrizzleDb, userId: string): Promise<number>;
```

Counts jobs where `user_id = userId` and `status IN ('rendering', 'compositing')`. Uses the `jobs_user_id_status_idx` index.

### `validateLicenseTier`

```ts
interface ValidateLicenseTierInput {
  db: DrizzleDb;
  userId: string;
  requiredTier: LicenseTier;
}

interface ValidateLicenseTierResult {
  valid: boolean;
  activeLicense: {
    id: string;
    tier: LicenseTier;
    expiresAt: Date;
  } | null;
}

async function validateLicenseTier(input: ValidateLicenseTierInput): Promise<ValidateLicenseTierResult>;
```

**Behavioral contract:**

1. Query the user's licenses where `status = 'active'` and `expires_at > now()`, ordered by tier descending (Pro > Plus) then `expires_at DESC`. Take the first result.
2. If no active license exists, return `{ valid: false, activeLicense: null }`.
3. Tier hierarchy: Pro >= Plus. A Pro license satisfies a Plus requirement. A Plus license does not satisfy a Pro requirement.
4. Return `{ valid: true/false, activeLicense: { id, tier, expiresAt } }`.

### `checkLicenseExpiry`

```ts
interface CheckLicenseExpiryInput {
  db: DrizzleDb;
  userId: string;
}

interface CheckLicenseExpiryResult {
  hasActiveLicense: boolean;
  license: {
    id: string;
    tier: LicenseTier;
    status: LicenseStatus;
    expiresAt: Date;
  } | null;
}

async function checkLicenseExpiry(input: CheckLicenseExpiryInput): Promise<CheckLicenseExpiryResult>;
```

Queries the user's most recent license. Returns whether it is active (status is `'active'` and `expires_at > now()`). Returns the license details regardless of status so callers can display expiry information.

---

## Slot Signaling Helper

Lives in `src/helpers/slots.ts`.

### `claimNextQueuedSlotToken`

```ts
interface ClaimNextQueuedSlotTokenInput {
  db: DrizzleDb;
  userId: string;
}

async function claimNextQueuedSlotToken(
  input: ClaimNextQueuedSlotTokenInput,
): Promise<string | null>;
```

**Behavioral contract:**

Executes the following atomic SQL via Drizzle's `db.execute()`:

```sql
UPDATE jobs
SET slot_task_token = NULL
WHERE id = (
  SELECT id FROM jobs
  WHERE user_id = $1
    AND status = 'queued'
    AND slot_task_token IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING slot_task_token
```

`FOR UPDATE SKIP LOCKED` is added to handle the case where two terminal-state Lambdas fire concurrently for the same user: one will lock the row and claim the token, the other will skip the locked row and either claim the next queued job or return `null`.

Returns the `slot_task_token` string if a row was updated, or `null` if no claimable queued job exists. The caller (terminal-state Lambda) uses the returned token to call `states:SendTaskSuccess`.

---

## `computeCredits` Function

Lives in `src/helpers/compute-credits.ts`.

```ts
interface ComputeCreditsInput {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

function computeCredits(input: ComputeCreditsInput): number;
```

**Implementation:**

```ts
export function computeCredits({ width, height, fps, durationSec }: ComputeCreditsInput): number {
  const durationMin = durationSec / 60;
  const resFactor = width >= 3840 ? 3.0 : 1.0;
  const fpsFactor = fps >= 120 ? 1.75 : 1.0;
  return Math.ceil(durationMin * resFactor * fpsFactor);
}
```

This is a pure function with no database dependency. It is exported from the package for use by both `apps/api` (at job creation time) and `apps/desktop` (for cost estimation in the UI before submission).

**Edge cases:**
- `durationSec = 0` returns `0`.
- Very short durations (e.g., 1 second) return `1` due to `Math.ceil`.
- The function does not validate input ranges; callers are responsible for ensuring positive values.

---

## Neon Client Setup

Lives in `src/client.ts`.

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type DrizzleDb = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
```

The `databaseUrl` parameter is the Neon connection string (`DATABASE_URL` environment variable). The factory does not read environment variables itself — the caller provides the URL. This allows different callers to use pooled vs. direct connection strings:
- `apps/api` uses the pooled connection string.
- Pipeline Lambdas use the direct (non-pooled) connection string.

The `DrizzleDb` type is exported for use in helper function signatures throughout the package.

---

## Success Criteria

1. **SC-1:** `pnpm --filter @racedash/db build` succeeds with zero errors.
2. **SC-2:** `pnpm --filter @racedash/db test` passes all unit, property-based, and characterisation tests.
3. **SC-3:** `pnpm drizzle-kit generate` (run from `packages/db`) produces valid SQL migration files that can be applied to a fresh Neon database.
4. **SC-4:** All eight tables are created with correct columns, types, constraints, and indexes when migrations are applied.
5. **SC-5:** `reserveCredits` correctly depletes packs in FIFO order and throws `InsufficientCreditsError` when balance is insufficient.
6. **SC-6:** `releaseCredits` restores credits only to non-expired packs and is idempotent.
7. **SC-7:** `consumeCredits` is idempotent and does not modify pack balances.
8. **SC-8:** `claimNextQueuedSlotToken` atomically claims exactly one token and returns `null` when no claimable job exists.
9. **SC-9:** `computeCredits` matches the formula from the epic spec for all tested input combinations.
10. **SC-10:** The package exports all types, schemas, helpers, and the client factory from its barrel `index.ts`.
11. **SC-11:** No runtime dependency on any other `@racedash/*` package.

---

## User Stories

These are written from the perspective of downstream branches that consume `@racedash/db`.

1. **As `cloud-auth`**, I need the `users` table schema and `createDb` factory so I can insert user records when a Clerk webhook fires and query users in API route handlers.
2. **As `cloud-licensing`**, I need the `licenses` and `credit_packs` schemas, `validateLicenseTier`, `checkLicenseExpiry`, and credit helpers so I can enforce license gating and manage credit purchases via Stripe webhooks.
3. **As `cloud-rendering`**, I need `reserveCredits` to hold credits when a job is created, `consumeCredits` when a job completes, `releaseCredits` when a job fails, `countActiveRenders` and `getSlotLimit` for slot enforcement in the WaitForSlot Lambda, and `claimNextQueuedSlotToken` for slot signaling in FinaliseJob and ReleaseCreditsAndFail Lambdas.
4. **As `cloud-rendering`**, I need `computeCredits` to calculate the `rc_cost` for a job at creation time based on the user's render config.
5. **As `cloud-youtube`**, I need `reserveCredits` (with `rcAmount = 10`) to hold credits for a YouTube upload, `consumeCredits` on success, and `releaseCredits` on failure. I also need the `social_uploads` and `connected_accounts` schemas.
6. **As `cloud-admin`**, I need all table schemas and the `createDb` factory to build admin dashboard queries for user management, license management, job monitoring, and credit adjustments.
7. **As `apps/desktop`**, I need `computeCredits` (imported from `@racedash/db`) to show an estimated credit cost in the Export tab before the user submits a cloud render.

---

## UI Mocks to Produce

None. This is a backend-only package with no UI.

---

## Happy Paths

### HP-1: Reserve credits for a cloud render (single pack, sufficient balance)

1. User has one credit pack with `rc_remaining = 50`, expiring in 6 months.
2. `cloud-rendering` calls `reserveCredits({ db, userId, jobId, rcAmount: 12 })`.
3. A `credit_reservations` row is created with `status = 'reserved'`, `rc_amount = 12`.
4. One `credit_reservation_packs` row is created: `pack_id = pack.id`, `rc_deducted = 12`.
5. The pack's `rc_remaining` is updated from `50` to `38`.
6. Returns `{ reservationId, packBreakdown: [{ packId, rcDeducted: 12 }] }`.

### HP-2: Reserve credits across multiple packs (FIFO)

1. User has two packs:
   - Pack A: `rc_remaining = 5`, `expires_at = 2026-06-01`
   - Pack B: `rc_remaining = 100`, `expires_at = 2026-12-01`
2. `reserveCredits({ ..., rcAmount: 8 })` is called.
3. Pack A (soonest-expiring) is depleted first: 5 credits drawn, `rc_remaining` -> `0`.
4. Pack B provides the remaining 3: `rc_remaining` -> `97`.
5. Two `credit_reservation_packs` rows are created.
6. Returns breakdown: `[{ packId: A, rcDeducted: 5 }, { packId: B, rcDeducted: 3 }]`.

### HP-3: Release credits after a failed render (pack still valid)

1. A reservation exists with `status = 'reserved'`, drawing 10 credits from a single pack.
2. The render fails. `cloud-rendering` calls `releaseCredits({ db, reservationId })`.
3. The pack's `rc_remaining` increases by 10.
4. The reservation's status becomes `'released'`, `settled_at` is set.

### HP-4: Release credits after a failed render (pack expired between reservation and failure)

1. A reservation draws 10 credits from a pack that expires on 2026-04-01.
2. The render fails on 2026-04-15 (after the pack expired).
3. `releaseCredits` detects the pack's `expires_at < now()` and does not restore credits.
4. The reservation is still marked `'released'`. The 10 credits are forfeited.

### HP-5: Consume credits after a successful render

1. A reservation exists with `status = 'reserved'`.
2. The render completes. `cloud-rendering` calls `consumeCredits({ db, reservationId })`.
3. The reservation's status becomes `'consumed'`, `settled_at` is set.
4. No pack balances change (they were decremented at reservation time).

### HP-6: Slot signaling — next queued job is woken

1. User has `getSlotLimit('plus') = 1`. One job is `rendering`, another is `queued` with `slot_task_token = 'token-abc'`.
2. The rendering job completes. FinaliseJob Lambda calls `claimNextQueuedSlotToken({ db, userId })`.
3. The queued job's `slot_task_token` is set to `NULL` atomically.
4. Returns `'token-abc'`. The Lambda calls `SendTaskSuccess` with this token.

### HP-7: Slot signaling — no queued job exists

1. User's only job completes. No other jobs are queued.
2. `claimNextQueuedSlotToken({ db, userId })` returns `null`.
3. The Lambda skips the `SendTaskSuccess` call.

### HP-8: Compute credits for a standard 1080p/60fps 3-minute video

1. `computeCredits({ width: 1920, height: 1080, fps: 60, durationSec: 180 })`.
2. `durationMin = 3`, `resFactor = 1.0`, `fpsFactor = 1.0`.
3. Returns `Math.ceil(3 * 1.0 * 1.0) = 3`.

---

## Security Considerations

1. **SQL injection:** All queries use Drizzle's parameterized query builder. The only raw SQL is the `claimNextQueuedSlotToken` query, which uses Drizzle's `db.execute(sql`...`)` with `$1` parameter binding — never string concatenation.
2. **Transaction isolation:** Credit reservation uses `FOR UPDATE` row locks on credit packs within the transaction to prevent concurrent reservations from overselling the same pack. The default `READ COMMITTED` isolation level is sufficient because the `FOR UPDATE` lock serializes access to the affected pack rows.
3. **Slot token double-signaling prevention:** `claimNextQueuedSlotToken` uses `FOR UPDATE SKIP LOCKED` to ensure that concurrent Lambda invocations cannot claim the same token. The `UPDATE ... SET slot_task_token = NULL ... RETURNING slot_task_token` pattern ensures that only the Lambda that successfully NULLs the token receives it.
4. **Access token storage:** The `connected_accounts` table stores OAuth tokens as `text`. Encryption at rest is handled at the application layer (by `cloud-youtube` when writing/reading tokens), not by this package. This package provides the schema only.
5. **Input validation:** `computeCredits` does not validate input ranges. Callers (the API layer) must validate that `width`, `height`, `fps`, and `durationSec` are positive numbers before calling.
6. **Credit balance consistency:** The `rc_remaining` column can reach `0` but must never go negative. The `reserveCredits` helper checks the sum before decrementing, and the `FOR UPDATE` lock prevents races. A database `CHECK (rc_remaining >= 0)` constraint should be added to the `credit_packs` table as a safety net:

```ts
// In credit-packs.ts schema, add to the table definition:
import { sql, check } from 'drizzle-orm';

// Add check constraint
check('rc_remaining_non_negative', sql`rc_remaining >= 0`)
```

---

## Infrastructure

None owned by this branch. The Neon database is provisioned externally (Neon dashboard or CDK in `cloud-infra`). This package defines the schema and generates migrations; migration execution is a deployment concern.

---

## API Contracts

### Exported from `@racedash/db`

```ts
// Client
export { createDb, type DrizzleDb } from './client';

// Schema (all table objects for use in Drizzle queries)
export {
  users,
  licenses,
  creditPacks,
  creditReservations,
  creditReservationPacks,
  jobs,
  socialUploads,
  connectedAccounts,
} from './schema';

// Drizzle pgEnum objects (needed by downstream migration configs)
export {
  licenseTierEnum,
  licenseStatusEnum,
  jobStatusEnum,
  socialUploadStatusEnum,
  reservationStatusEnum,
} from './schema';

// Inferred row types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type CreditPack = typeof creditPacks.$inferSelect;
export type NewCreditPack = typeof creditPacks.$inferInsert;
export type CreditReservation = typeof creditReservations.$inferSelect;
export type NewCreditReservation = typeof creditReservations.$inferInsert;
export type CreditReservationPack = typeof creditReservationPacks.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type SocialUpload = typeof socialUploads.$inferSelect;
export type NewSocialUpload = typeof socialUploads.$inferInsert;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type NewConnectedAccount = typeof connectedAccounts.$inferInsert;

// Enum types
export type { LicenseTier, LicenseStatus, JobStatus, SocialUploadStatus, ReservationStatus } from './types';
export { LICENSE_TIERS, LICENSE_STATUSES, JOB_STATUSES, SOCIAL_UPLOAD_STATUSES, RESERVATION_STATUSES } from './types';

// Helpers
export { reserveCredits, releaseCredits, consumeCredits } from './helpers/credits';
export type { ReserveCreditsInput, ReserveCreditsResult, ReleaseCreditsInput, ConsumeCreditsInput } from './helpers/credits';
export { getSlotLimit, countActiveRenders, validateLicenseTier, checkLicenseExpiry } from './helpers/licenses';
export type { ValidateLicenseTierInput, ValidateLicenseTierResult, CheckLicenseExpiryInput, CheckLicenseExpiryResult } from './helpers/licenses';
export { claimNextQueuedSlotToken } from './helpers/slots';
export type { ClaimNextQueuedSlotTokenInput } from './helpers/slots';
export { computeCredits } from './helpers/compute-credits';
export type { ComputeCreditsInput } from './helpers/compute-credits';

// Errors
export { InsufficientCreditsError } from './errors';
```

### `package.json`

```json
{
  "name": "@racedash/db",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.0",
    "drizzle-orm": "^0.38.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "typescript": "*",
    "vitest": "*"
  }
}
```

### `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
```

### `tsconfig.json`

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

### Custom Errors

```ts
// src/errors.ts
export class InsufficientCreditsError extends Error {
  public readonly available: number;
  public readonly requested: number;

  constructor(available: number, requested: number) {
    super(`Insufficient credits: requested ${requested} RC but only ${available} RC available`);
    this.name = 'InsufficientCreditsError';
    this.available = available;
    this.requested = requested;
  }
}
```

---

## Tests

All tests use Vitest. Database-dependent tests use a test Neon database (or a local PostgreSQL via `pg` driver for CI) with per-test transaction rollback for isolation.

### Specification Tests

#### `test/helpers/compute-credits.test.ts`

| Test | Input | Expected |
|---|---|---|
| Standard 1080p/60fps, 1 min | `{ width: 1920, height: 1080, fps: 60, durationSec: 60 }` | `1` |
| Standard 1080p/60fps, 3 min | `{ width: 1920, height: 1080, fps: 60, durationSec: 180 }` | `3` |
| 4K/60fps, 1 min | `{ width: 3840, height: 2160, fps: 60, durationSec: 60 }` | `3` |
| 4K/60fps, 5 min | `{ width: 3840, height: 2160, fps: 60, durationSec: 300 }` | `15` |
| 1080p/120fps, 1 min | `{ width: 1920, height: 1080, fps: 120, durationSec: 60 }` | `2` (ceil of 1.75) |
| 4K/120fps, 1 min | `{ width: 3840, height: 2160, fps: 120, durationSec: 60 }` | `6` (ceil of 5.25) |
| 4K/120fps, 2.5 min | `{ width: 3840, height: 2160, fps: 120, durationSec: 150 }` | `14` (ceil of 13.125) |
| Zero duration | `{ width: 1920, height: 1080, fps: 60, durationSec: 0 }` | `0` |
| Very short (1 sec) | `{ width: 1920, height: 1080, fps: 60, durationSec: 1 }` | `1` |
| Sub-4K high res (2560x1440) | `{ width: 2560, height: 1440, fps: 60, durationSec: 60 }` | `1` (resFactor = 1.0) |
| Exactly 3840 width | `{ width: 3840, height: 1080, fps: 60, durationSec: 60 }` | `3` (resFactor = 3.0) |
| Exactly 120fps boundary | `{ width: 1920, height: 1080, fps: 120, durationSec: 60 }` | `2` (fpsFactor = 1.75) |
| Just below 120fps (119) | `{ width: 1920, height: 1080, fps: 119, durationSec: 60 }` | `1` (fpsFactor = 1.0) |

#### `test/helpers/credits.test.ts`

**`reserveCredits`:**
1. Single pack, exact amount — reserves all remaining, `rc_remaining` becomes 0
2. Single pack, partial amount — `rc_remaining` decreases by exact amount
3. Multiple packs, FIFO order — soonest-expiring pack depleted first
4. Multiple packs, spans three packs — deductions spread correctly across three packs
5. Insufficient balance — throws `InsufficientCreditsError` with correct `available` and `requested` values
6. Expired packs excluded — packs with `expires_at <= now()` are not considered
7. Zero-remaining packs excluded — packs with `rc_remaining = 0` are not considered
8. Creates correct `credit_reservation` record — status is `'reserved'`, `rc_amount` matches, `settled_at` is null
9. Creates correct `credit_reservation_packs` records — one per affected pack, `rc_deducted` sums to `rcAmount`
10. Concurrent reservations — two concurrent calls for the same user do not oversell (requires `FOR UPDATE`)

**`releaseCredits`:**
1. Standard release — pack `rc_remaining` restored, reservation status becomes `'released'`
2. Pack expired between reservation and release — credits forfeited, pack `rc_remaining` unchanged
3. Mixed: one pack still valid, one expired — only valid pack restored
4. Idempotent: calling release on an already-released reservation — no error, no balance change
5. Idempotent: calling release on a consumed reservation — no error, no balance change
6. Multi-pack release — all non-expired packs restored correctly

**`consumeCredits`:**
1. Standard consume — reservation status becomes `'consumed'`, `settled_at` set
2. Pack balances unchanged — `rc_remaining` on affected packs stays the same after consume
3. Idempotent: calling consume on an already-consumed reservation — no error
4. Idempotent: calling consume on a released reservation — no error

#### `test/helpers/licenses.test.ts`

**`getSlotLimit`:**
1. `'plus'` returns `1`
2. `'pro'` returns `3`

**`countActiveRenders`:**
1. No jobs — returns `0`
2. One rendering job — returns `1`
3. One compositing job — returns `1`
4. One rendering + one compositing — returns `2`
5. Jobs in other statuses (`uploading`, `queued`, `complete`, `failed`) not counted
6. Only counts jobs for the specified user, not other users

**`validateLicenseTier`:**
1. Active Pro license, requires Plus — valid
2. Active Pro license, requires Pro — valid
3. Active Plus license, requires Plus — valid
4. Active Plus license, requires Pro — invalid
5. Expired license — invalid, `activeLicense` is null
6. Cancelled license — invalid, `activeLicense` is null
7. No license at all — invalid, `activeLicense` is null
8. Multiple licenses, picks highest active tier

**`checkLicenseExpiry`:**
1. Active, not expired — `hasActiveLicense: true`
2. Active, but `expires_at` in the past — `hasActiveLicense: false`
3. Status is `'expired'` — `hasActiveLicense: false`
4. Status is `'cancelled'` — `hasActiveLicense: false`
5. No license — `hasActiveLicense: false`, `license: null`

#### `test/helpers/slots.test.ts`

**`claimNextQueuedSlotToken`:**
1. One queued job with token — returns the token, token is NULL in DB afterward
2. No queued jobs — returns `null`
3. Queued job but `slot_task_token` is NULL (already claimed) — returns `null`
4. Multiple queued jobs — returns the oldest (by `created_at`), only that one's token is NULLed
5. Jobs in non-queued statuses with tokens — not claimed
6. Jobs belonging to a different user — not claimed

### Property-Based Tests

#### `test/properties/credits.property.test.ts`

Use a property-based testing library (e.g., `fast-check` via Vitest).

1. **Credits conservation:** For any sequence of `reserveCredits` and `releaseCredits` calls (no consumes), the total `rc_remaining` across all packs plus the total `rc_amount` of active (`status = 'reserved'`) reservations equals the total `rc_total` across all non-expired packs. (Expired packs may have forfeited credits, so the invariant only holds for non-expired packs.)

2. **FIFO ordering:** For any set of packs with distinct `expires_at` values and any reservation amount, the `credit_reservation_packs` entries must be ordered by pack `expires_at ASC`, and each pack must be fully depleted before the next is touched (except the last pack, which may be partially depleted).

3. **Idempotency of release:** Calling `releaseCredits` N times on the same reservation produces the same database state as calling it once.

4. **Idempotency of consume:** Calling `consumeCredits` N times on the same reservation produces the same database state as calling it once.

5. **Non-negative balance:** For any sequence of credit operations, `rc_remaining` on every pack is always >= 0.

6. **`computeCredits` monotonicity in duration:** For fixed resolution and FPS, `computeCredits` is non-decreasing as `durationSec` increases.

7. **`computeCredits` monotonicity in resolution factor:** For fixed FPS and duration, `computeCredits(width=3840, ...) >= computeCredits(width=1920, ...)`.

8. **`computeCredits` non-negative:** For any non-negative inputs, the result is >= 0.

### Mutation / Genetic Modification Tests

These define critical mutations that the test suite must catch (i.e., the tests must fail if the mutation is applied). This validates test quality.

1. **Mutation: Remove FIFO ordering.** Change the `ORDER BY expires_at ASC` in `reserveCredits` to `ORDER BY expires_at DESC`. Tests must detect that packs are depleted in the wrong order.

2. **Mutation: Remove `FOR UPDATE` lock.** Remove the `FOR UPDATE` clause from the credit pack query in `reserveCredits`. The concurrent reservation test must detect potential overselling (or test must verify the clause is present via SQL inspection).

3. **Mutation: Skip expired-pack check in `releaseCredits`.** Always restore credits regardless of pack expiry. Tests must detect that expired pack balances are incorrectly restored.

4. **Mutation: Change `getSlotLimit('plus')` from 1 to 2.** The slot limit test must fail.

5. **Mutation: Remove `Math.ceil` from `computeCredits`.** Tests with non-integer results (e.g., 1080p/120fps/1min = 1.75) must fail because they expect the ceiling.

6. **Mutation: Include `'queued'` status in `countActiveRenders`.** The status filter test must detect that queued jobs are incorrectly counted.

7. **Mutation: Remove `slot_task_token IS NOT NULL` filter in `claimNextQueuedSlotToken`.** Tests must detect that already-claimed tokens (NULL) are incorrectly selected.

8. **Mutation: Remove `SKIP LOCKED` from slot claim query.** Under concurrent execution, two callers could claim the same token. The concurrent test must detect this.

9. **Mutation: Change reservation status check in `releaseCredits` from `!== 'reserved'` to `!== 'consumed'`.** The idempotency tests must detect that releasing an already-released reservation would incorrectly re-release.

10. **Mutation: Remove `expires_at > now()` filter in `reserveCredits`.** Tests must detect that expired packs are incorrectly included in the available balance.

### Characterisation Tests

These capture the current behavior to protect against unintended regressions. They are written after initial implementation and snapshot specific outputs.

1. **`computeCredits` snapshot table:** Run `computeCredits` against a fixed set of 20+ input combinations and snapshot the results. Any formula change will cause a regression failure.

2. **`reserveCredits` pack deduction snapshot:** Given a fixed set of 3 packs with known balances and expiry dates, reserve a specific amount and snapshot the resulting `packBreakdown` array and final `rc_remaining` values.

3. **`releaseCredits` mixed-expiry snapshot:** Given a reservation spanning 2 packs where one has since expired, snapshot the final `rc_remaining` values after release to confirm the forfeiture behavior.

4. **Schema column snapshot:** Export the Drizzle table column definitions as a serializable structure and snapshot them. Any accidental column rename, type change, or constraint removal will cause a regression failure. This can be done by iterating over each table's columns in the schema and snapshotting the column names, types, and `notNull` / `default` / `unique` properties.

5. **Error message snapshot:** Snapshot the exact error message from `InsufficientCreditsError` for known `available` and `requested` values to ensure the message format is stable for consumers who may parse or display it.

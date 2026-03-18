# cloud-db Feature Branch Spec

**Date:** 2026-03-18
**Status:** Review on waking
**Branch:** feature/cloud-db
**Depends on:** —

---

## Overview

`feature/cloud-db` creates `packages/db` — the single source of truth for all database schema, migrations, and data-access helpers used across the RaceDash Cloud backend. Every other cloud feature branch (`cloud-auth`, `cloud-licensing`, `cloud-rendering`, `cloud-youtube`, `cloud-admin`) imports from `@racedash/db`. Nothing else in the monorepo touches the database directly.

This branch lands first. It has no runtime users until `cloud-auth` merges, but it must be fully tested in isolation against a Neon test branch before other branches begin integration.

---

## Scope

### In scope
- `packages/db` workspace package (`@racedash/db`)
- Drizzle ORM table definitions for all 8 tables
- Drizzle schema relations (for join inference)
- Database migration files (generated via `drizzle-kit generate`)
- Neon serverless client factory (`createDb`)
- Credit helpers: `computeCredits`, `reserveCredits`, `releaseCredits`, `consumeCredits`
- License helpers: `getSlotLimit`, `countActiveRenders`, `validateLicense`
- Full TypeScript types exported for all table rows and insert shapes
- Vitest test suite requiring a real Neon test branch

### Out of scope
- API route handlers (owned by `cloud-auth`, `cloud-licensing`, `cloud-rendering`, `cloud-youtube`)
- Stripe or Clerk SDK calls (the DB layer records results; it does not call external APIs)
- SES emails (owned by pipeline Lambdas)
- Admin dashboard UI (owned by `cloud-admin`)
- `drizzle-kit push` / production migration strategy (that is a deployment concern, documented here as an open question)

---

## Functional Requirements

1. **Schema** — define and export Drizzle table objects for: `users`, `licenses`, `credit_packs`, `credit_reservations`, `credit_reservation_packs`, `jobs`, `social_uploads`, `connected_accounts`.
2. **Relations** — declare Drizzle `relations()` for all FK relationships so consuming code can use relational queries.
3. **DB client** — export `createDb(connectionString: string): DrizzleDB` using `@neondatabase/serverless` with `drizzle-orm/neon-serverless`. Pooled connection for `apps/api`; direct (non-pooled) connection for pipeline Lambdas and Fargate.
4. **`computeCredits`** — pure function, no DB access. Implements the formula from the epic design spec.
5. **`reserveCredits`** — atomically deducts RC from the soonest-expiring non-exhausted packs (FIFO), records the reservation and per-pack deductions, returns the reservation ID.
6. **`releaseCredits`** — atomically restores RC to the packs originally deducted from, marks the reservation as `'released'`.
7. **`consumeCredits`** — marks the reservation as `'consumed'`; does not modify `rc_remaining` on the packs (already deducted at reserve time).
8. **`getSlotLimit`** — returns `1` for Plus tier, `3` for Pro tier.
9. **`countActiveRenders`** — counts the user's jobs with `status IN ('rendering', 'compositing')`.
10. **`validateLicense`** — given a `userId`, returns the user's active license or throws if none exists / license is expired or cancelled.
11. **Indexes** — create indexes for all FK columns and any columns used in `WHERE` clauses in the helpers (e.g. `jobs.user_id + jobs.status`, `credit_packs.user_id + credit_packs.expires_at`).
12. **Migrations** — `drizzle-kit generate` produces SQL migration files in `packages/db/drizzle/`.

---

## Non-Functional Requirements

- **Correctness** — `reserveCredits` must be atomic: either all pack deductions succeed or none do (use a DB transaction).
- **No double-spend** — concurrent calls to `reserveCredits` for the same user must not allow total reservations to exceed available balance (row-level locking via `SELECT ... FOR UPDATE` inside the transaction).
- **Testability** — all helpers accept `db: DrizzleDB` as the first argument so tests can inject a test-database connection.
- **Type safety** — no `any` types; all helper return types are fully typed.
- **Bundle size** — `@neondatabase/serverless` must be the only runtime DB dependency; do not bundle Drizzle's full ORM in Lambda cold-start path unnecessarily.
- **Migrations are idempotent** — generated SQL uses `IF NOT EXISTS` / Drizzle's own idempotency guarantees.

---

## Success Criteria

- [ ] `pnpm --filter @racedash/db build` succeeds with no TypeScript errors
- [ ] `pnpm --filter @racedash/db test` passes all tests against a Neon test branch (requires `TEST_DATABASE_URL`)
- [ ] `drizzle-kit generate` produces migration files with no conflicts
- [ ] All 8 tables exist in the test database after running migrations
- [ ] `reserveCredits` passes a concurrent-access test (two simultaneous calls with insufficient total balance — only one succeeds)
- [ ] All exported TypeScript types are consumed without type errors in a minimal `apps/api` stub that imports `@racedash/db`

---

## User Stories

These are written from the perspective of downstream feature branches:

- **cloud-auth:** "As a Clerk webhook handler, I call `db.insert(users)` using the exported `users` table and the `DrizzleDB` type, with no knowledge of the connection string — the caller constructs `createDb(process.env.DATABASE_URL)`."
- **cloud-licensing:** "As the Stripe webhook handler, I call `db.insert(licenses)` and `db.update(licenses)` using exported table definitions. I call `validateLicense(db, userId)` before allowing a cloud render submission."
- **cloud-rendering:** "As the `WaitForSlot` Lambda, I call `countActiveRenders(db, userId)` and `getSlotLimit(license.tier)` to decide whether to signal immediately or park the task token. I call `consumeCredits(db, reservationId)` in `FinaliseJob`."
- **cloud-rendering:** "As `complete-upload`, I call `reserveCredits(db, { userId, rcAmount })` before starting the Step Functions execution. The returned `reservationId` is stored in the jobs row."
- **cloud-youtube:** "As the YouTube Fargate task, I call `consumeCredits(db, reservationId)` on successful upload and `releaseCredits(db, reservationId)` on failure."
- **cloud-admin:** "As the admin dashboard, I query `db.select().from(jobs)` and `db.select().from(users)` using the exported table objects and `DrizzleDB` type."

---

## Package Structure

```
packages/db/
  package.json          ← @racedash/db; deps: drizzle-orm, @neondatabase/serverless
  tsconfig.json         ← extends ../../tsconfig.base.json; outDir: ./dist; rootDir: ./src
  drizzle.config.ts     ← drizzle-kit config pointing at src/schema.ts + drizzle/ migrations dir
  drizzle/              ← generated migration SQL files (committed)
  src/
    schema.ts           ← all Drizzle table definitions + relations
    client.ts           ← createDb() factory
    credits.ts          ← computeCredits, reserveCredits, releaseCredits, consumeCredits
    licenses.ts         ← getSlotLimit, countActiveRenders, validateLicense
    index.ts            ← re-exports everything from schema, client, credits, licenses
  src/__tests__/
    credits.test.ts     ← Vitest integration tests for credit helpers
    licenses.test.ts    ← Vitest integration tests for license helpers
    schema.test.ts      ← smoke tests: tables exist, FK constraints enforced
```

---

## Schema

Complete Drizzle table definitions. All `id` columns use `crypto.randomUUID()` as default.

```typescript
// src/schema.ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const licenseTierEnum = pgEnum('license_tier', ['plus', 'pro'])

export const licenseStatusEnum = pgEnum('license_status', [
  'active',
  'expired',
  'cancelled',
])

export const jobStatusEnum = pgEnum('job_status', [
  'uploading',
  'queued',
  'rendering',
  'compositing',
  'complete',
  'failed',
])

export const reservationStatusEnum = pgEnum('reservation_status', [
  'reserved',
  'consumed',
  'released',
])

export const socialUploadStatusEnum = pgEnum('social_upload_status', [
  'queued',
  'uploading',
  'processing',
  'live',
  'failed',
])

// ─── Tables ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const licenses = pgTable('licenses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  tier: licenseTierEnum('tier').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  status: licenseStatusEnum('status').notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('licenses_user_id_idx').on(table.userId),
  index('licenses_user_status_idx').on(table.userId, table.status),
])

export const creditPacks = pgTable('credit_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  packName: text('pack_name').notNull(),
  rcTotal: integer('rc_total').notNull(),
  rcRemaining: integer('rc_remaining').notNull(),
  priceGbp: integer('price_gbp').notNull(), // pence
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id').notNull().unique(),
}, (table) => [
  index('credit_packs_user_expiry_idx').on(table.userId, table.expiresAt),
  // Partial index for packs with remaining credits — used by reserveCredits
  index('credit_packs_user_remaining_idx')
    .on(table.userId, table.expiresAt, table.rcRemaining)
    .where(sql`rc_remaining > 0`),
])

export const creditReservations = pgTable('credit_reservations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text('job_id').notNull().unique(), // 1:1 with jobs
  userId: text('user_id').notNull().references(() => users.id),
  rcAmount: integer('rc_amount').notNull(),
  status: reservationStatusEnum('status').notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  index('credit_reservations_user_idx').on(table.userId),
  index('credit_reservations_job_idx').on(table.jobId),
])

export const creditReservationPacks = pgTable('credit_reservation_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  reservationId: text('reservation_id')
    .notNull()
    .references(() => creditReservations.id),
  packId: text('pack_id').notNull().references(() => creditPacks.id),
  rcDeducted: integer('rc_deducted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('crp_reservation_idx').on(table.reservationId),
])

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  status: jobStatusEnum('status').notNull().default('uploading'),
  // Video metadata (populated after upload probe)
  inputS3Key: text('input_s3_key'),
  outputS3Key: text('output_s3_key'),
  overlayS3Key: text('overlay_s3_key'),
  videoWidthPx: integer('video_width_px'),
  videoHeightPx: integer('video_height_px'),
  videoFps: integer('video_fps'),
  videoDurationSec: integer('video_duration_sec'),
  // Rendering config (racedash session config JSON)
  config: jsonb('config').notNull(),
  // Credit tracking
  rcCost: integer('rc_cost'),
  creditReservationId: text('credit_reservation_id').references(() => creditReservations.id),
  // Step Functions / pipeline tracking
  sfnExecutionArn: text('sfn_execution_arn'),
  slotTaskToken: text('slot_task_token'),        // SET TO NULL atomically when claimed
  renderTaskToken: text('render_task_token'),    // SET TO NULL after SendTaskSuccess/Failure
  remotionRenderId: text('remotion_render_id'),  // for debugging and log lookups
  // Result
  downloadExpiresAt: timestamp('download_expires_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('jobs_user_status_idx').on(table.userId, table.status),
  index('jobs_user_created_idx').on(table.userId, table.createdAt),
])

export const socialUploads = pgTable('social_uploads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text('job_id').notNull().references(() => jobs.id),
  userId: text('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(), // 'youtube'
  status: socialUploadStatusEnum('status').notNull().default('queued'),
  rcCost: integer('rc_cost').notNull().default(10),
  creditReservationId: text('credit_reservation_id').references(() => creditReservations.id),
  platformUrl: text('platform_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('social_uploads_user_idx').on(table.userId),
  index('social_uploads_job_idx').on(table.jobId),
])

export const connectedAccounts = pgTable('connected_accounts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(), // 'youtube'
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('connected_accounts_user_platform_idx').on(table.userId, table.platform),
])

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  licenses: many(licenses),
  creditPacks: many(creditPacks),
  creditReservations: many(creditReservations),
  jobs: many(jobs),
  socialUploads: many(socialUploads),
  connectedAccounts: many(connectedAccounts),
}))

export const licensesRelations = relations(licenses, ({ one }) => ({
  user: one(users, { fields: [licenses.userId], references: [users.id] }),
}))

export const creditPacksRelations = relations(creditPacks, ({ one, many }) => ({
  user: one(users, { fields: [creditPacks.userId], references: [users.id] }),
  reservationPacks: many(creditReservationPacks),
}))

export const creditReservationsRelations = relations(creditReservations, ({ one, many }) => ({
  user: one(users, { fields: [creditReservations.userId], references: [users.id] }),
  packs: many(creditReservationPacks),
}))

export const creditReservationPacksRelations = relations(creditReservationPacks, ({ one }) => ({
  reservation: one(creditReservations, {
    fields: [creditReservationPacks.reservationId],
    references: [creditReservations.id],
  }),
  pack: one(creditPacks, {
    fields: [creditReservationPacks.packId],
    references: [creditPacks.id],
  }),
}))

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
  creditReservation: one(creditReservations, {
    fields: [jobs.creditReservationId],
    references: [creditReservations.id],
  }),
  socialUploads: many(socialUploads),
}))

export const socialUploadsRelations = relations(socialUploads, ({ one }) => ({
  job: one(jobs, { fields: [socialUploads.jobId], references: [jobs.id] }),
  user: one(users, { fields: [socialUploads.userId], references: [users.id] }),
  creditReservation: one(creditReservations, {
    fields: [socialUploads.creditReservationId],
    references: [creditReservations.id],
  }),
}))

export const connectedAccountsRelations = relations(connectedAccounts, ({ one }) => ({
  user: one(users, { fields: [connectedAccounts.userId], references: [users.id] }),
}))
```

---

## DB Client

```typescript
// src/client.ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type DrizzleDB = ReturnType<typeof createDb>

/**
 * Create a Drizzle DB client.
 *
 * @param connectionString - Neon connection string.
 *   Use the **pooled** connection string in `apps/api` (Fastify/Lambda Function URL).
 *   Use the **direct** (non-pooled) connection string in pipeline Lambdas and Fargate tasks
 *   to avoid pgbouncer transaction mode limitations during long-running transactions.
 */
export function createDb(connectionString: string): DrizzleDB {
  const sql = neon(connectionString)
  return drizzle(sql, { schema })
}
```

**Connection string strategy:**
- `apps/api` — pooled (`postgresql://...@ep-xxx-pooler.neon.tech/neondb?sslmode=require`)
- Pipeline Lambdas and Fargate — direct non-pooled (`postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require`)
- Tests — `TEST_DATABASE_URL` env var (direct, non-pooled Neon test branch)

---

## Credit Helpers

### `computeCredits`

Pure function. No DB access.

```typescript
// src/credits.ts

/**
 * Compute the RC cost for a cloud render job.
 *
 * @param width  - Video width in pixels
 * @param height - Video height in pixels (unused in formula but passed for future use)
 * @param fps    - Video frame rate
 * @param durationSec - Video duration in seconds
 * @returns RC cost (always >= 1)
 */
export function computeCredits(
  width: number,
  height: number,
  fps: number,
  durationSec: number,
): number {
  const durationMin = durationSec / 60
  const resFactor = width >= 3840 ? 3.0 : 1.0
  const fpsFactor = fps >= 120 ? 1.75 : 1.0
  return Math.ceil(durationMin * resFactor * fpsFactor)
}
```

### `reserveCredits`

Atomically deducts RC from the user's soonest-expiring packs (FIFO). Runs inside a single DB transaction with row-level locking to prevent concurrent over-spend.

```typescript
export interface ReserveCreditsOpts {
  jobId: string
  userId: string
  rcAmount: number
}

export interface ReserveCreditsResult {
  reservationId: string
}

/**
 * Reserve RC for a job. FIFO depletion: soonest-expiring pack first.
 *
 * Algorithm:
 *   1. BEGIN TRANSACTION
 *   2. SELECT id, rc_remaining, expires_at FROM credit_packs
 *      WHERE user_id = $userId AND rc_remaining > 0 AND expires_at > NOW()
 *      ORDER BY expires_at ASC
 *      FOR UPDATE  ← row-level lock prevents concurrent over-spend
 *   3. Walk packs in order, deducting from each until rcAmount is satisfied.
 *      If total available < rcAmount → ROLLBACK, throw InsufficientCreditsError
 *   4. INSERT INTO credit_reservations (job_id, user_id, rc_amount, status='reserved')
 *   5. For each deducted pack, INSERT INTO credit_reservation_packs
 *      and UPDATE credit_packs SET rc_remaining = rc_remaining - deducted WHERE id = packId
 *   6. COMMIT
 *   7. Return { reservationId }
 *
 * @throws InsufficientCreditsError if the user has fewer than rcAmount RC available
 */
export async function reserveCredits(
  db: DrizzleDB,
  opts: ReserveCreditsOpts,
): Promise<ReserveCreditsResult>
```

**`InsufficientCreditsError`:**
```typescript
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS'
  constructor(public readonly available: number, public readonly required: number) {
    super(`Insufficient credits: ${available} available, ${required} required`)
  }
}
```

### `releaseCredits`

Restores RC to the packs originally deducted from. Marks the reservation as `'released'`.

```typescript
/**
 * Release a reservation back to the originating packs.
 *
 * Algorithm:
 *   1. BEGIN TRANSACTION
 *   2. SELECT status FROM credit_reservations WHERE id = $reservationId FOR UPDATE
 *      If status != 'reserved' → ROLLBACK, throw ReservationAlreadySettledError
 *   3. SELECT pack_id, rc_deducted FROM credit_reservation_packs WHERE reservation_id = $reservationId
 *   4. For each row: UPDATE credit_packs SET rc_remaining = rc_remaining + rc_deducted WHERE id = packId
 *   5. UPDATE credit_reservations SET status = 'released', settled_at = NOW() WHERE id = $reservationId
 *   6. COMMIT
 *
 * Note: Does NOT check whether the pack's rc_remaining + rc_deducted would exceed rc_total.
 * This is intentional — a pack that expires and is then released simply regains its credits
 * (which will then be non-spendable since the pack is expired). This is acceptable behaviour.
 */
export async function releaseCredits(db: DrizzleDB, reservationId: string): Promise<void>
```

### `consumeCredits`

Marks the reservation as `'consumed'`. RC was already deducted from packs at reserve time — no further modification to pack balances.

```typescript
/**
 * Consume (finalise) a reservation after a successful job/upload.
 *
 * Algorithm:
 *   1. UPDATE credit_reservations
 *      SET status = 'consumed', settled_at = NOW()
 *      WHERE id = $reservationId AND status = 'reserved'
 *      RETURNING id
 *   2. If no row returned → throw ReservationAlreadySettledError
 *
 * Does NOT modify credit_packs (deduction already happened at reserve time).
 */
export async function consumeCredits(db: DrizzleDB, reservationId: string): Promise<void>
```

---

## License Helpers

```typescript
// src/licenses.ts

export type LicenseTier = 'plus' | 'pro'

export interface License {
  id: string
  userId: string
  tier: LicenseTier
  status: 'active' | 'expired' | 'cancelled'
  startsAt: Date
  expiresAt: Date
}

/**
 * Returns the maximum number of concurrent cloud renders for a given license tier.
 *
 * Plus: 1 concurrent render
 * Pro:  3 concurrent renders
 */
export function getSlotLimit(tier: LicenseTier): 1 | 3 {
  return tier === 'pro' ? 3 : 1
}

/**
 * Count the user's jobs currently occupying a render slot.
 * A slot is occupied while status is 'rendering' or 'compositing'.
 */
export async function countActiveRenders(db: DrizzleDB, userId: string): Promise<number>

/**
 * Validate that a user has an active, non-expired license.
 *
 * @returns The user's active License record
 * @throws LicenseNotFoundError if no active license exists
 * @throws LicenseExpiredError if the license exists but is expired or cancelled
 */
export async function validateLicense(db: DrizzleDB, userId: string): Promise<License>

export class LicenseNotFoundError extends Error {
  readonly code = 'LICENSE_NOT_FOUND'
}

export class LicenseExpiredError extends Error {
  readonly code = 'LICENSE_EXPIRED'
  constructor(public readonly expiresAt: Date) {
    super(`License expired at ${expiresAt.toISOString()}`)
  }
}
```

**`validateLicense` algorithm:**
1. `SELECT * FROM licenses WHERE user_id = $userId AND status = 'active' ORDER BY expires_at DESC LIMIT 1`
2. If no row → throw `LicenseNotFoundError`
3. If `expiresAt < NOW()` → throw `LicenseExpiredError(row.expiresAt)`
4. Return the license row

---

## Security Considerations

- **Parameterised queries** — Drizzle ORM uses parameterised queries exclusively; no string interpolation into SQL. Consuming code must not bypass Drizzle with raw `sql` template strings containing untrusted input.
- **Connection strings** — `DATABASE_URL` / `TEST_DATABASE_URL` must never be logged, returned in API responses, or committed to version control. The `createDb` factory accepts the string as a parameter rather than reading `process.env` directly, so tests can inject a test string without polluting the environment.
- **Access tokens** — `connected_accounts.access_token` and `refresh_token` are stored as plaintext in the DB. **Open question:** should these be encrypted at rest using a KMS-managed key? (See Open Questions.)
- **Row-level locking** — `reserveCredits` uses `SELECT ... FOR UPDATE` to prevent concurrent over-spend. This is Neon-compatible as Neon supports standard PostgreSQL locking.
- **No wildcard exports** — the package does not export the raw Neon `sql` tagged template or the underlying connection object; callers receive only the `DrizzleDB` typed client.

---

## API Contracts (Exported Types)

Everything downstream packages need is re-exported from `src/index.ts`:

```typescript
// src/index.ts

// Schema tables (for use in db.select().from(users), etc.)
export {
  users, licenses, creditPacks, creditReservations, creditReservationPacks,
  jobs, socialUploads, connectedAccounts,
} from './schema'

// Enum values (for use in WHERE clauses)
export {
  licenseTierEnum, licenseStatusEnum, jobStatusEnum,
  reservationStatusEnum, socialUploadStatusEnum,
} from './schema'

// Row types (inferred from table definitions)
export type {
  InferSelectModel, InferInsertModel,
} from 'drizzle-orm'
// Convenience aliases:
export type UserRow = typeof users.$inferSelect
export type LicenseRow = typeof licenses.$inferSelect
export type CreditPackRow = typeof creditPacks.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type SocialUploadRow = typeof socialUploads.$inferSelect
export type ConnectedAccountRow = typeof connectedAccounts.$inferSelect

// Client
export { createDb } from './client'
export type { DrizzleDB } from './client'

// Credit helpers
export {
  computeCredits,
  reserveCredits, releaseCredits, consumeCredits,
  InsufficientCreditsError, ReservationAlreadySettledError,
} from './credits'
export type { ReserveCreditsOpts, ReserveCreditsResult } from './credits'

// License helpers
export {
  getSlotLimit, countActiveRenders, validateLicense,
  LicenseNotFoundError, LicenseExpiredError,
} from './licenses'
export type { License, LicenseTier } from './licenses'
```

---

## Happy Paths

### Credit purchase → render → consume

1. User purchases a 50 RC pack via Stripe. Webhook handler inserts a `credit_packs` row: `{ rcTotal: 50, rcRemaining: 50, expiresAt: now + 12 months }`.
2. User submits a cloud render (1080p, 60fps, 10-minute video). `computeCredits(1920, 1080, 60, 600)` → `Math.ceil(10 * 1.0 * 1.0)` = **10 RC**.
3. `POST /jobs/reserve` calls `reserveCredits(db, { jobId, userId, rcAmount: 10 })`. The single pack has 50 RC → deducts 10 → `rcRemaining = 40`. Reservation created.
4. Render completes. `FinaliseJob` Lambda calls `consumeCredits(db, reservationId)`. Reservation marked `'consumed'`. Pack balance remains 40.

### Credit release on failure

1. Same setup as above. After `reserveCredits`, pack has `rcRemaining = 40`.
2. Remotion render fails. `ReleaseCreditsAndFail` Lambda calls `releaseCredits(db, reservationId)`.
3. `credit_reservation_packs` shows the pack was deducted 10 RC. That 10 is restored: `rcRemaining = 50`.
4. Reservation marked `'released'`.

### Slot limit enforcement (Plus tier)

1. Plus user (slot limit = 1) has one job in `'rendering'` status.
2. User submits a second render. `reserveCredits` succeeds (credits are sufficient).
3. `complete-upload` starts Step Functions execution immediately.
4. `WaitForSlot` Lambda runs: `countActiveRenders(db, userId)` returns 1, `getSlotLimit('plus')` returns 1. `1 >= 1` → slot not free. Lambda stores task token in `jobs.slot_task_token` and returns. Step Functions parks the execution.
5. First render completes. `FinaliseJob` Lambda runs the atomic slot-claim SQL, finds the second job's `slot_task_token`, sets it to `NULL`, calls `SendTaskSuccess`. Second job proceeds.

### FIFO depletion across two packs

1. User has Pack A: `{ rcRemaining: 5, expiresAt: 2026-06 }` and Pack B: `{ rcRemaining: 20, expiresAt: 2026-12 }`.
2. Render costs 12 RC. `reserveCredits` locks both packs (in expiry order).
3. Deducts 5 from Pack A (exhausted), then 7 from Pack B. Two `credit_reservation_packs` rows created.
4. On release, Pack A gets 5 back, Pack B gets 7 back.

---

## Tests

### Specification Tests (Vitest)

All tests require `TEST_DATABASE_URL` env var. Each test should run migrations against a clean Neon test branch (or a dedicated test schema).

**`src/__tests__/credits.test.ts`** — test case names:

```
computeCredits
  ✓ returns 1 for a 1-minute 1080p 60fps video
  ✓ applies 3x resFactor for 4K (width >= 3840)
  ✓ applies 1.75x fpsFactor for 120fps
  ✓ applies both factors for 4K 120fps
  ✓ rounds up fractional results (Math.ceil)
  ✓ returns at least 1 for any positive input
  ✓ handles sub-minute videos (e.g. 30 seconds → Math.ceil(0.5) = 1)

reserveCredits
  ✓ deducts from the soonest-expiring pack first (FIFO)
  ✓ spans multiple packs when a single pack is insufficient
  ✓ throws InsufficientCreditsError when total available < required
  ✓ throws InsufficientCreditsError when all packs are expired (rc > 0 but expired)
  ✓ creates credit_reservation and credit_reservation_packs rows
  ✓ is idempotent for the same jobId (unique constraint on job_id)
  ✓ prevents concurrent over-spend (two simultaneous calls, only one succeeds)

releaseCredits
  ✓ restores rc_remaining to originating packs
  ✓ marks reservation as released with settled_at timestamp
  ✓ throws ReservationAlreadySettledError if status is already consumed
  ✓ throws ReservationAlreadySettledError if status is already released
  ✓ restores correctly when reservation spans two packs

consumeCredits
  ✓ marks reservation as consumed with settled_at timestamp
  ✓ does NOT modify credit_packs.rc_remaining
  ✓ throws ReservationAlreadySettledError if status is already consumed
  ✓ throws ReservationAlreadySettledError if status is already released
```

**`src/__tests__/licenses.test.ts`:**

```
getSlotLimit
  ✓ returns 1 for plus tier
  ✓ returns 3 for pro tier

countActiveRenders
  ✓ returns 0 when user has no jobs
  ✓ counts jobs in rendering status
  ✓ counts jobs in compositing status
  ✓ does not count jobs in queued, uploading, complete, or failed status
  ✓ does not count other users' jobs

validateLicense
  ✓ returns active license for a user with valid license
  ✓ throws LicenseNotFoundError when user has no license rows
  ✓ throws LicenseExpiredError when license.expires_at is in the past
  ✓ throws LicenseNotFoundError when license.status is cancelled
  ✓ returns the most-recently-expiring license when user has multiple active rows
```

**`src/__tests__/schema.test.ts`:**

```
  ✓ all 8 tables exist in the database after migration
  ✓ FK constraint enforced: inserting a job with unknown user_id fails
  ✓ unique constraint enforced: credit_packs.stripe_payment_intent_id
  ✓ unique constraint enforced: connected_accounts (user_id, platform)
  ✓ job status enum rejects unknown values
```

### Property-Based Tests

Use `fast-check` or `@fast-check/vitest`:

1. **`computeCredits` is always >= 1:** For all `(width: 1..10000, height: 1..10000, fps: 1..240, durationSec: 1..7200)`, `computeCredits(w, h, fps, d) >= 1`.
2. **Reserve then consume never loses credits beyond the reserved amount:** For any valid reservation, `sum(rc_remaining after consume) === sum(rc_remaining before) - rcAmount`.
3. **Release is the inverse of reserve:** After `releaseCredits`, `sum(rc_remaining)` equals the pre-reserve value.
4. **FIFO ordering:** Given two packs with different expiry dates, `reserveCredits` always deducts from the earlier-expiring pack first when that pack has sufficient credits.

### Mutation/GM Tests

These are assertions that catch common implementation mistakes:

1. **FIFO vs LIFO order:** Mutate the `ORDER BY expires_at ASC` to `DESC` in `reserveCredits`. The FIFO test must fail (deduction comes from later-expiring pack).
2. **Off-by-one in slot limit:** Mutate `countActiveRenders >= getSlotLimit` to `countActiveRenders >` (strict greater-than instead of >=). The "slot is full at limit" test must fail.
3. **Missing FOR UPDATE lock:** Remove `FOR UPDATE` from the `reserveCredits` query. The concurrent over-spend test must fail (race condition allows double-spend).
4. **Double-settle not caught:** Mutate `consumeCredits` to not check the current status before updating. The `throws ReservationAlreadySettledError if already consumed` test must fail.

### Characterisation Tests

The existing packages (`core`, `engine`, `compositor`, `scraper`, `timestamps`) have no DB interactions, so no characterisation tests apply to this package from the perspective of existing behaviour. Characterisation tests would be appropriate for any **migration scripts** added in the future — snapshot the DB state before and after applying each migration file to confirm the migration matches expectations.

---

## Open Questions

1. **OAuth token encryption at rest:** Should `connected_accounts.access_token` and `refresh_token` be encrypted using an AWS KMS-managed key before storage? The tradeoff is added complexity (KMS decrypt on every read) vs data exposure if the Neon database is compromised. **Decision needed from reviewer.**

2. **`drizzle-kit push` vs migrations in CI:** Should the migration workflow be `drizzle-kit push` (schema-push, dev-friendly) or generated SQL migrations applied via `drizzle-kit migrate`? Generated migrations are safer for production (explicit, auditable). **Recommendation: generated SQL migrations committed to the repo; `drizzle-kit push` only for local dev against throwaway branches.**

3. **Neon branching strategy for tests:** The test suite needs a clean schema on every CI run. Options: (a) a dedicated Neon test branch reset before each run, (b) a unique Neon branch per CI job (Neon's branch API supports this), (c) schema-per-test using Postgres schemas. Option (b) is cleanest for parallelism. **Decision needed from reviewer.**

4. **`updated_at` auto-update trigger:** Drizzle does not automatically update `updated_at` on row update. Should a Postgres trigger be added, or should callers be responsible for setting `updatedAt: new Date()` on every update? **Recommendation: Postgres trigger — safer, but adds a migration artifact.**

5. **Credit pack expiry grace period:** Should expired packs with `rc_remaining > 0` be silently excluded from `reserveCredits` (current spec) or surfaced as a "you have X RC expiring" warning? The notification feature is deferred to phase 2 — confirm this is acceptable for launch.

6. **`jobs.config` shape:** The `config` column is `jsonb`. Should this be typed as `typeof RacedashConfig` (from `packages/core` or a shared type) or left as `unknown` at the DB layer? **Recommendation: type it as `unknown` in the DB layer; the API layer casts it to the known config type after deserialization.**

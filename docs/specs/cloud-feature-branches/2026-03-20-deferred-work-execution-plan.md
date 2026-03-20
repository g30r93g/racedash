# Cloud Epic — Deferred Work Execution Plan

**Date:** 2026-03-20
**Branch:** `epic/cloud`
**Status:** Ready to execute

All 7 feature branches have been merged into `epic/cloud`. This plan covers the remaining deferred work across all branches, ordered by dependency and grouped into parallelisable phases.

**Source documents:**
- `docs/specs/cloud-feature-branches/2026-03-19-cloud-auth-deferred.md`
- `docs/specs/cloud-feature-branches/2026-03-19-cloud-infra-deferred.md`
- `docs/specs/cloud-feature-branches/2026-03-19-cloud-licensing-deferred.md`
- `docs/specs/cloud-feature-branches/2026-03-20-cloud-admin-deferred.md`
- `docs/specs/cloud-feature-branches/2026-03-20-cloud-rendering-deferred.md`
- `docs/specs/cloud-feature-branches/2026-03-20-cloud-youtube-deferred.md`

---

## Phase 1 — Functionality & Type Safety

These items fix the app so it actually works end-to-end and clean up cross-cutting type issues that later test work will benefit from.

### 1A. Wire `useAuth` into component tree
**Source:** cloud-auth deferred #1
**Why first:** Without this, the desktop app shows default/signed-out state regardless of session. All UI testing is meaningless until auth state flows.
**Scope:** Call `useAuth()` from `ProjectLibrary.tsx` and `Editor.tsx`, thread state down to `AccountDetails`, `AppSidebar`, `ExportTab`.
**Depends on:** nothing

### 1B. Wire `FeatureGate` to real gated features
**Source:** cloud-licensing deferred #7
**Why now:** `FeatureGate` and `UpgradePrompt` components exist but are unused. Now that cloud-rendering has landed, they should gate concurrent render slot limits.
**Depends on:** 1A (auth state must flow for tier to be known)

### 1C. Fix `as any` casts on Fastify reply sends
**Source:** cloud-licensing deferred #1 (13 instances) + cloud-rendering deferred #7 (24 instances)
**Why together:** Same root cause — `reply.send()` generics don't union with `ApiError`. Fix by adding error types to route handler generics. One pattern, applied everywhere.
**Files:** `routes/stripe.ts`, `routes/stripe-credits.ts`, `routes/credits.ts`, `routes/license.ts`, `routes/webhooks-stripe.ts`, `routes/jobs.ts`, `routes/webhooks-remotion.ts`, `routes/webhooks-render.ts`
**Depends on:** nothing

### 1D. Add `FastifyRequest.rawBody` module augmentation
**Source:** cloud-licensing deferred #2
**Scope:** Add `declare module 'fastify' { interface FastifyRequest { rawBody?: string } }` and remove `(request as any).rawBody` casts.
**Files:** `routes/webhooks-stripe.ts`, `app.ts`
**Depends on:** nothing

### 1E. Fix `logAdminAction` transaction type safety
**Source:** cloud-admin deferred #11
**Scope:** Update type signature to accept both top-level Drizzle client and transaction proxy, remove `as any` casts.
**Files:** `packages/db/src/helpers/audit.ts`, call sites in `routes/admin/licenses.ts`, `routes/admin/credits.ts`
**Depends on:** nothing

**1C, 1D, 1E are independent of each other and of 1A/1B — all can run in parallel.**

---

## Phase 2 — API Hardening

Code quality and security items that should land before tests are written against them.

### 2A. CORS configuration
**Source:** cloud-admin deferred #1
**Scope:** Add `@fastify/cors` to `apps/api`, register with `ADMIN_APP_ORIGIN` env var. Required for production admin dashboard.
**Depends on:** nothing

### 2B. Zod validation schemas for admin routes
**Source:** cloud-admin deferred #3
**Scope:** Replace manual `if`-based validation with Zod schemas in admin API routes.
**Files:** `routes/admin/licenses.ts`, `routes/admin/credits.ts`, `routes/admin/users.ts`, `routes/admin/stats.ts`
**Depends on:** nothing

### 2C. Rate limiting on admin endpoints
**Source:** cloud-admin deferred #7
**Scope:** Add Fastify rate-limiting plugin scoped to `/api/admin/` prefix (100 req/min per admin user).
**Files:** `routes/admin/index.ts`, `package.json`
**Depends on:** nothing

### 2D. Verify presigned URL expiry
**Source:** cloud-rendering deferred #8
**Scope:** Confirm `getSignedUrl()` in `start-upload` has explicit `expiresIn: 3600`. Add if missing.
**Depends on:** nothing

### 2E. Deduplicate `racedash:license:get` push event
**Source:** cloud-licensing deferred #5
**Scope:** Only fire `racedash:license:changed` on out-of-band changes, not on explicit fetches.
**Files:** `stripe-checkout.ts`
**Depends on:** nothing

### 2F. IAM `PassedToService` conditions
**Source:** cloud-infra deferred #1
**Scope:** Add conditions to PassRole statements in pipeline-stack and social-stack.
**Depends on:** nothing

### 2G. Gate `RemovalPolicy.DESTROY` on environment
**Source:** cloud-infra deferred #2
**Scope:** Use `RETAIN` when `config.env === 'prod'` for S3 buckets.
**Depends on:** nothing

**All Phase 2 items are independent and can run in parallel.**

---

## Phase 3 — Specification Tests

The bulk of the deferred work. These create the test coverage that mutation tests (Phase 4) will validate.

### 3A. Implement cloud-auth todo API tests (20 tests)
**Source:** cloud-auth deferred #2
**Scope:** Implement the `.todo` test cases in existing files. Requires Clerk `verifyToken()` and Svix `Webhook.verify()` mock factories.
**Files:** `clerk-auth.test.ts` (7 todos), `auth.test.ts` (6 todos), `webhooks.test.ts` (7 todos)
**Depends on:** nothing (test files already exist with `.todo` stubs)

### 3B. Create cloud-rendering API route tests (36 tests)
**Source:** cloud-rendering deferred #1
**Scope:** New test file `apps/api/test/routes/jobs.test.ts` — covers POST /jobs (8), POST /start-upload (6), POST /complete-upload (6), GET /status SSE (9), GET /download (6), GET /jobs list (7).
**Files also needed:** `webhooks-remotion.test.ts` (7), `webhooks-render.test.ts` (6)
**Depends on:** 2D (presigned URL expiry should be confirmed before testing it)

### 3C. Create cloud-rendering Lambda handler tests (40 tests)
**Source:** cloud-rendering deferred #2
**Scope:** 7 new test files under `apps/api/test/lambdas/` — wait-for-slot (5), grant-slot (2), start-render-overlay (6), prepare-composite (7), finalise-job (8), notify-user (4), release-credits-and-fail (8).
**Depends on:** nothing

### 3D. Create cloud-rendering desktop tests (12 tests)
**Source:** cloud-rendering deferred #3
**Scope:** New file `apps/desktop/test/cloud-render.test.ts` — export tab UI (5), Cloud Renders tab (7).
**Depends on:** 1A (auth must be wired for desktop tests to be meaningful)

### 3E. Create cloud-youtube Lambda dispatch tests (5 tests)
**Source:** cloud-youtube deferred #1
**Scope:** New file `infra/test/lambdas/social-dispatch.test.ts` — Fargate launch, payload passing, status update, unknown platform, SQS parsing.
**Depends on:** nothing

### 3F. Create cloud-youtube Fargate task tests (15 tests)
**Source:** cloud-youtube deferred #2
**Scope:** New file `infra/test/tasks/youtube-upload.test.ts` — S3 streaming, metadata, status transitions, credit ops, token refresh, error scenarios, SES, exit code.
**Depends on:** nothing

### 3G. Create cloud-admin spec tests (~74 tests)
**Source:** cloud-admin deferred #8
**Scope:** 14 new test files covering admin auth plugin (4), users routes (8), licenses routes (11), jobs routes (13), credits routes (11), stats routes (7), hooks (3), and 6 component test files (17).
**Depends on:** 2B (Zod schemas should land first so tests validate the final validation logic), 2C (rate limiting should land first)

### 3H. Complete cloud-infra deferred tests
**Source:** cloud-infra deferred #3, #4, #5, #6, #7
**Scope:**
- Split snapshot tests into 5 per-stack files (#3)
- Add mutation test #5 + prerequisite spec test for Catch block coverage (#4)
- Complete 4 LocalStack Step Functions tests (#5)
- Add SQS DLQ test (#6)
- Add EventBridge relay Lambda invocation assertion (#7)
**Depends on:** nothing

**3A, 3C, 3E, 3F, 3H are independent and can run in parallel.**
**3B depends on 2D. 3D depends on 1A. 3G depends on 2B + 2C.**

---

## Phase 4 — Advanced Tests

These validate that the spec tests from Phase 3 are strong enough to catch critical mutations.

### 4A. Cloud-rendering property-based tests (5 tests)
**Source:** cloud-rendering deferred #4
**Scope:** `apps/api/test/properties/jobs.property.test.ts` — credit conservation, queue monotonicity, bitrate determinism, HMAC symmetry, presigned URL count.
**Depends on:** nothing (property tests are independent of spec tests)

### 4B. Cloud-rendering mutation tests (10 mutations)
**Source:** cloud-rendering deferred #5
**Scope:** Verify each mutation is caught by the spec test suite from 3B + 3C.
**Depends on:** 3B, 3C

### 4C. Cloud-rendering characterisation/snapshot tests (6 snapshots)
**Source:** cloud-rendering deferred #6
**Scope:** MediaConvert config, SSE event shapes, presigned URL structure, SES templates, API errors, CloudRenderJob interface.
**Depends on:** nothing

### 4D. Cloud-youtube mutation tests (15 mutations)
**Source:** cloud-youtube deferred #3
**Scope:** Verify mutations are caught. API-targeting mutations (11) likely already caught by existing tests. Fargate-targeting mutations (4) need 3F.
**Depends on:** 3F (for Fargate-targeting mutations)

### 4E. Cloud-admin property-based tests (3 tests)
**Source:** cloud-admin deferred #9
**Scope:** Admin role exhaustiveness, pagination invariant, credit correction bound.
**Depends on:** nothing

### 4F. Cloud-admin snapshot tests (5 snapshots)
**Source:** cloud-admin deferred #10
**Scope:** API response shapes + component rendering snapshots.
**Depends on:** nothing

**4A, 4C, 4E, 4F can run in parallel and don't depend on Phase 3.**
**4B depends on 3B + 3C. 4D depends on 3F.**

---

## Phase 5 — UI/UX Improvements

User-facing polish. None of these block production deployment.

### 5A. Pack size selection UI
**Source:** cloud-licensing deferred #3
**Scope:** Replace hardcoded `packSize: 100` with a picker (dropdown or button group) supporting 50, 100, 250, 500.
**Files:** `ProjectLibrary.tsx`, `AccountDetails.tsx`, `CreditBalance.tsx`
**Depends on:** 1A (auth/credit state must flow)

### 5B. Stripe Customer Portal
**Source:** cloud-licensing deferred #4
**Scope:** New API endpoint `POST /api/stripe/portal`, new IPC handler, wire "Manage subscription" button in `AccountDetails.tsx`.
**Depends on:** nothing

### 5C. shadcn/ui migration for admin
**Source:** cloud-admin deferred #2
**Scope:** Replace hand-written HTML in admin dashboard with shadcn/ui primitives.
**Depends on:** nothing

### 5D. Multi-select job status filter
**Source:** cloud-admin deferred #4
**Scope:** Replace single-select `<select>` with multi-select component. API already supports comma-separated statuses.
**Files:** `apps/admin/app/jobs/page.tsx`
**Depends on:** 5C (if doing shadcn migration, do it before this)

### 5E. Shared hooks extraction
**Source:** cloud-admin deferred #5
**Scope:** Extract `useAdminAuth` and `useApiMutation` hooks from dialog components.
**Depends on:** nothing

### 5F. Dialog error handling
**Source:** cloud-admin deferred #6
**Scope:** Add error state display to `IssueLicenseDialog`, `ExtendLicenseDialog`, `RevokeLicenseDialog`.
**Depends on:** nothing (but 5E would simplify this if done first)

---

## Phase 6 — Paper UI Mockups

Design deliverables. Independent of all code work. Can be done at any point.

### 6A. Cloud-licensing mocks (10 mockups)
**Source:** cloud-licensing deferred #6

### 6B. Cloud-rendering mocks (5 mockups)
**Source:** cloud-rendering deferred #9

### 6C. Cloud-youtube mocks (9 mockups)
**Source:** cloud-youtube deferred #4

### 6D. Cloud-admin mocks (11 mockups)
**Source:** cloud-admin deferred #12

---

## Dependency Graph

```
Phase 1 (functionality + types)
├── 1A  Wire useAuth ──────────────────────┐
│   └── 1B  Wire FeatureGate               │
├── 1C  Fix as any casts                   │
├── 1D  rawBody augmentation               │
└── 1E  logAdminAction types               │
                                           │
Phase 2 (API hardening) — all independent  │
├── 2A  CORS                               │
├── 2B  Zod validation ────────────────┐   │
├── 2C  Rate limiting ─────────────────┤   │
├── 2D  Presigned URL expiry ──────┐   │   │
├── 2E  Dedupe license event       │   │   │
├── 2F  IAM conditions             │   │   │
└── 2G  RemovalPolicy gating       │   │   │
                                   │   │   │
Phase 3 (spec tests)               │   │   │
├── 3A  Auth todos (20)            │   │   │
├── 3B  Rendering API (49) ◄───────┘   │   │
├── 3C  Rendering Lambdas (40) ────────────┤
├── 3D  Rendering Desktop (12) ◄───────────┘
├── 3E  YouTube dispatch (5)       │
├── 3F  YouTube Fargate (15) ──────────┐
├── 3G  Admin spec tests (74) ◄────┘   │
└── 3H  Infra tests                    │
                                       │
Phase 4 (advanced tests)               │
├── 4A  Rendering properties (5)       │
├── 4B  Rendering mutations (10) ◄── 3B+3C
├── 4C  Rendering snapshots (6)        │
├── 4D  YouTube mutations (15) ◄───────┘
├── 4E  Admin properties (3)
└── 4F  Admin snapshots (5)

Phase 5 (UI/UX) — mostly independent
├── 5A  Pack size picker ◄── 1A
├── 5B  Stripe portal
├── 5C  shadcn migration
│   └── 5D  Multi-select filter
├── 5E  Shared hooks
└── 5F  Dialog errors (easier after 5E)

Phase 6 (Paper mocks) — fully independent
├── 6A  Licensing (10)
├── 6B  Rendering (5)
├── 6C  YouTube (9)
└── 6D  Admin (11)
```

---

## Execution Summary

| Phase | Items | Estimated tests | Can parallelise |
|---|---|---|---|
| 1 | 5 items | — | 1C, 1D, 1E in parallel; 1A→1B sequential |
| 2 | 7 items | — | All in parallel |
| 3 | 8 items | ~221 tests | 3A, 3C, 3E, 3F, 3H in parallel |
| 4 | 6 items | ~44 tests | 4A, 4C, 4E, 4F in parallel |
| 5 | 6 items | — | 5B, 5C, 5E in parallel |
| 6 | 4 items | 35 mockups | All in parallel |

**Total deferred tests:** ~265
**Total deferred mockups:** 35

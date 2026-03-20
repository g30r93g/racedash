# cloud-rendering — Deferred Work

**Date:** 2026-03-20
**Status:** Deferred until epic body of work is complete
**Branch:** `feat/cloud-rendering`

These tasks are non-blocking test coverage, design deliverables, and code quality refinements. All API endpoints (8), Lambda handlers (7), desktop UI (Export tab cloud option, Cloud Renders tab with SSE), and IPC handlers are fully functional without them.

---

## 1. Specification Tests — API Routes

All 12 test files required by the spec are missing. No test infrastructure exists for the rendering pipeline.

**`apps/api/test/routes/jobs.test.ts`** — 23 tests

| Group | Tests |
|---|---|
| `POST /jobs` | 8 (create, insufficient credits, no license, invalid body, unauth, JSONB config, initial status, rcCost accuracy) |
| `POST /jobs/:id/start-upload` | 6 (valid, not found, wrong user, wrong status, presigned URL count, S3 key prefix) |
| `POST /jobs/:id/complete-upload` | 6 (valid, not found, wrong user, wrong status, sfn_execution_arn stored, SFN input shape) |
| `GET /jobs/:id/status` | 9 (SSE content-type, first event, not found, wrong user, close on complete, close on failed, queuePosition, errorMessage, downloadExpiresAt) |
| `GET /jobs/:id/download` | 6 (valid, not found, wrong user, wrong status, expired 410, CloudFront signed URL) |
| `GET /jobs` | 7 (user scoped, no cross-user leak, cursor pagination, default limit 20, max limit 100, queuePosition, empty result) |

**`apps/api/test/routes/webhooks-remotion.test.ts`** — 7 tests
- HMAC-SHA512 verification (valid success, valid error, valid timeout, invalid signature, missing signature, taskToken passthrough, secret + raw body usage)

**`apps/api/test/routes/webhooks-render.test.ts`** — 6 tests
- Webhook secret validation (SUCCEEDED event + slot signal, FAILED event, no queued jobs, invalid secret, missing secret, timingSafeEqual usage)

---

## 2. Specification Tests — Lambda Handlers

**`apps/api/test/lambdas/wait-for-slot.test.ts`** — 5 tests
- Slot available → immediate SendTaskSuccess, no slot → store token only, token stored in slot_task_token, Plus limit = 1, Pro limit = 3

**`apps/api/test/lambdas/grant-slot.test.ts`** — 2 tests
- Status updated to 'rendering', updated_at timestamp set

**`apps/api/test/lambdas/start-render-overlay.test.ts`** — 6 tests
- renderMediaOnLambda called with correct params, webhook URL/secret passed, taskToken in customData, renderId stored, render_task_token stored, prores codec

**`apps/api/test/lambdas/prepare-composite.test.ts`** — 7 tests
- Status set to 'compositing', correct input S3 keys, bitrate: ≥3840 → 50 Mbps, ≥2560 → 30 Mbps, <2560 → 20 Mbps, output key `renders/{jobId}/output.mp4`, MediaConvert role ARN included

**`apps/api/test/lambdas/finalise-job.test.ts`** — 8 tests
- consumeCredits called, status → 'complete', download_expires_at ≈ now+7d, output_s3_key set, source upload deleted from S3, claimNextQueuedSlotToken called, token → SendTaskSuccess, no token → no call

**`apps/api/test/lambdas/notify-user.test.ts`** — 4 tests
- SES email subject, user email lookup, project name in body, SES_FROM_ADDRESS as sender

**`apps/api/test/lambdas/release-credits-and-fail.test.ts`** — 8 tests
- releaseCredits called, status → 'failed', error_message stored, SES failure email sent, SES error caught (no throw), claimNextQueuedSlotToken called, token → SendTaskSuccess, no token → no call

---

## 3. Specification Tests — Desktop

**`apps/desktop/test/cloud-render.test.ts`** — 12 tests
- Export tab cloud/local toggle, cloud hides output path, estimated cost shown, submit disabled on insufficient credits, submit disabled when unauthenticated, upload progress display, cancel aborts upload, Cloud Renders tab grouping (Active/Completed/Failed), queued shows position, complete shows download + countdown, failed shows error + credits restored, expired shows disabled button

---

## 4. Property-Based Tests

**`apps/api/test/properties/jobs.property.test.ts`** — 5 tests

1. **Credit conservation:** complete → consumed = rcCost; failed → net change = 0 (accounting for pack expiry forfeiture)
2. **Queue position monotonicity:** N queued jobs → positions 1..N ordered by created_at ASC
3. **Bitrate selection determinism:** same width → same bitrate (pure function of width)
4. **HMAC verification symmetry:** sign + verify with same secret succeeds; different secret fails
5. **Presigned URL count:** partCount in → exactly partCount URLs out, partNumbers 1..partCount

---

## 5. Mutation Tests

10 mutations the test suite must catch:

| # | Mutation | Target file |
|---|---|---|
| 1 | Remove `timingSafeEqual` from render webhook (replace with `===`) | `webhooks-render.ts` |
| 2 | Remove HMAC-SHA512 verification from Remotion webhook | `webhooks-remotion.ts` |
| 3 | Skip `claimNextQueuedSlotToken` in FinaliseJob | `finalise-job/index.ts` |
| 4 | Remove `consumeCredits` in FinaliseJob | `finalise-job/index.ts` |
| 5 | Remove `releaseCredits` in ReleaseCreditsAndFail | `release-credits-and-fail/index.ts` |
| 6 | Change slot check from `<` to `<=` in WaitForSlot | `wait-for-slot/index.ts` |
| 7 | Remove job ownership check from `GET /jobs/:id/download` | `jobs.ts` |
| 8 | Remove `download_expires_at` check from download endpoint | `jobs.ts` |
| 9 | Change download window from 7 days to 1 day in FinaliseJob | `finalise-job/index.ts` |
| 10 | Remove SES error catch in ReleaseCreditsAndFail | `release-credits-and-fail/index.ts` |

---

## 6. Characterisation / Snapshot Tests

6 snapshots to lock down API contract stability:

1. **MediaConvert config snapshot** — fixed 1080p source + "classic" style → full config structure
2. **SSE event shape snapshot** — one snapshot per status (uploading, queued, rendering, compositing, complete, failed)
3. **Presigned URL structure snapshot** — fixed jobId + partCount → response structure
4. **SES email template snapshots** — completion and failure email subject + body
5. **API error response snapshots** — 402, 403, 409, 410 error shapes
6. **CloudRenderJob interface snapshot** — TypeScript interface stability

---

## 7. `as any` Casts in API Routes

18 instances in `jobs.ts`, 4 in `webhooks-remotion.ts`, 2 in `webhooks-render.ts` — all on `reply.send()` calls. Fastify's `Reply` generic doesn't union with `ApiError` by default. Fix by adding error types to route handler generics. Pre-existing pattern from `cloud-licensing`; violates NFR-8.

---

## 8. Presigned URL Expiry Verification

`getSignedUrl()` in `start-upload` does not explicitly set expiry duration. Verify that the default matches the spec requirement of 1 hour, or add an explicit `expiresIn: 3600` parameter.

---

## 9. Paper UI Mockups

5 mockups listed in spec, none created:

1. Export tab — Cloud render option selected (cost estimate, balance, submit button)
2. Export tab — Upload in progress (progress bar, speed, bytes, cancel)
3. Cloud Renders tab — Mixed states (queued with position, rendering with progress, complete with countdown, failed with error)
4. Cloud Renders tab — Download expiry countdown close-up
5. Cloud Renders tab — Empty state

# RaceDash Cloud Epic — Design Spec

**Date:** 2026-03-18
**Status:** Approved
**Branch:** epic/cloud

---

## Overview

RaceDash Cloud extends the desktop Electron application with cloud-powered features. The desktop app is the sole product offering; there is no web app in this phase. Cloud capabilities are layered on top of the existing local-first experience.

**In scope for launch:**
- In-app authentication (Clerk, embedded BrowserWindow OAuth)
- Annual licensing — Plus (software access) and Pro (software + future cloud storage allowance)
- Credit-based cloud rendering — desktop uploads locally-joined video + config, cloud renders overlay and composites, 7-day download window, email notification on completion
- Credit-based direct-to-YouTube upload
- Dedicated backend API (`apps/api`)
- AWS infrastructure (Remotion Lambda, MediaConvert, S3, CloudFront, Step Functions, SES)
- Admin dashboard (`apps/admin`)

**Deferred to a future phase:**
- Project library cloud sync (Pro tier benefit)
- Credit expiry notifications (email reminders at 90/30/7 days)
- Web app / browser-based product

---

## Section 1: New Apps & Packages

| Location | Package name | Purpose |
|---|---|---|
| `packages/db` | `@racedash/db` | Drizzle ORM schema, Neon client, credit + license helpers |
| `apps/api` | `@racedash/api` | Dedicated backend API — Clerk auth middleware, all cloud endpoints |
| `apps/admin` | `@racedash/admin` | Admin dashboard for managing users, licenses, jobs |
| `infra/` | — | AWS CDK v2 TypeScript stacks |

Existing packages (`core`, `engine`, `compositor`, `scraper`, `timestamps`) and `apps/desktop` are extended but not restructured.

---

## Section 2: Workstream Definitions

### `feature/cloud-db`
**Owns:** `packages/db`
- Drizzle ORM schema: `users`, `licenses`, `credit_packs`, `jobs`, `social_uploads`, `connected_accounts`, `credit_reservations`, `credit_reservation_packs`
- Credit helpers: `reserveCredits`, `releaseCredits`, `consumeCredits` (FIFO depletion, soonest-expiring-first)
- License helpers: tier validation (Plus / Pro), expiry checks, concurrent render limit by tier (`getSlotLimit(tier): 1 | 3`), active render count query (`countActiveRenders(db, userId): number` — counts jobs in `'rendering' | 'compositing'`)
- Neon serverless client setup

**`licenses` table columns:**
```
id, user_id (FK users.id), tier ('plus' | 'pro'),
stripe_customer_id, stripe_subscription_id,
status ('active' | 'expired' | 'cancelled'),
starts_at, expires_at, created_at, updated_at
```

**Depends on:** nothing — first to land

---

### `feature/cloud-infra`
**Owns:** `infra/` — CDK construct definitions, IAM, resource declarations, and wiring only. Lambda handler source code is owned by `feature/cloud-rendering` and `feature/cloud-youtube` respectively.
- AWS CDK v2 TypeScript stacks:
  - **StorageStack**: `racedash-uploads-{env}` + `racedash-renders-{env}` S3 buckets with lifecycle rules (uploads expire after job completes; render outputs expire after 7 days); CloudFront distribution over renders bucket with RSA signed URL key pair
  - **PipelineStack**: Step Functions state machine (desktop-only path — no join step; single input video always; includes initial `WaitForSlot` polling loop); Remotion Lambda IAM role + site bucket; MediaConvert IAM role; CDK constructs for pipeline Lambda functions (WaitForSlot, StartRenderOverlay, WaitForRemotionLambda, CreateMediaConvertJob, WaitForMediaConvert, FinaliseJob, NotifyUser, ReleaseCreditsAndFail)
  - **NotificationsStack**: SES for render completion + failure emails; EventBridge rule on Step Functions terminal states → relay Lambda → `POST /api/webhooks/render`. The relay Lambda target URL (`WEBHOOK_TARGET_URL`) and `WEBHOOK_SECRET` are injected post-deploy once `cloud-rendering` has defined and deployed the endpoint. The CDK deploy is expected to be re-run after `cloud-rendering` lands.
  - **SocialStack**: ECS Fargate cluster + YouTube upload task definition (handler code owned by `cloud-youtube`); SQS queue for social upload jobs + DLQ; CDK construct for the SQS dispatch Lambda (handler code owned by `cloud-youtube`)
- MediaConvert endpoint is discovered at runtime via `describeEndpoints()` — not an environment variable.

**Depends on:** nothing — runs in parallel with `cloud-db`

---

### `feature/cloud-auth`
**Owns:** Clerk integration across desktop + API, and `apps/api` scaffold
- `apps/api` scaffold: project setup, Clerk auth middleware (validates session token on all protected routes), error handling conventions
- Electron: BrowserWindow-based OAuth flow (opens Clerk hosted sign-in, captures token on redirect); session token persisted in Electron's secure storage; token injected into API requests
- Desktop Account tab: real user data (name, email, plan tier), functional sign-out — includes removing the `disabled` attribute from the existing sign-out button stub and wiring it to Electron session clear + Clerk sign-out
- Update `AppSidebar` plan prop type from `'free' | 'pro'` to `'plus' | 'pro'` and handle both tiers visually

**Note:** `cloud-admin` can begin `apps/admin` shell work independently, but API integration within the admin app is blocked until this branch lands and `apps/api` is scaffolded.

**Depends on:** `cloud-db`

---

### `feature/cloud-licensing`
**Owns:** Stripe subscription management + license gating + credit balance UI
- `apps/api`: subscription endpoints (get current license, initiate Checkout session, webhook handler for `customer.subscription.*` events); credit pack purchase endpoints; credit balance endpoint
- Electron: in-app Stripe Checkout via BrowserWindow (desktop calls `POST /api/stripe/checkout` and receives a hosted Checkout URL, then opens it in BrowserWindow — no Stripe publishable key needed in the desktop); license tier stored locally after validation; feature gating enforced in UI (Pro-only features disabled/prompted for Plus users)
- Desktop Account tab: credit balance display (current RC, pack breakdown, expiry dates); credit top-up entry point; credit purchase history
- Desktop Cloud Renders tab: hide the storage usage bar at launch (cloud storage sync is deferred; storage bar has no data source in phase 1)
- Stripe Tax enabled (automatic VAT/GST)

**Depends on:** `cloud-db`, `cloud-auth`

---

### `feature/cloud-rendering`
**Owns:** End-to-end cloud render pipeline from desktop to download, including Lambda handler code
- `apps/api`: job endpoints — `POST /jobs` (create + reserve credits), `POST /jobs/:id/start-upload` (presigned S3 multipart URLs), `POST /jobs/:id/complete-upload` (complete multipart, start Step Functions execution), `GET /jobs/:id/status` (SSE stream), `GET /jobs/:id/download` (signed CloudFront URL, valid until `download_expires_at`), `POST /api/webhooks/render` (EventBridge relay receiver — validates `x-webhook-secret` with `timingSafeEqual`)
- Pipeline Lambda handler code (`infra/lambdas/`): WaitForSlot (slot availability check — queries DB for active render count vs. tier limit), StartRenderOverlay, WaitForRemotionLambda polling loop, CreateMediaConvertJob, WaitForMediaConvert polling loop, FinaliseJob (sets `download_expires_at = now() + 7 days`), NotifyUser (SES render completion email — separate Lambda so a notification failure does not roll back the completed job), ReleaseCreditsAndFail
- Desktop Export tab: cloud render option alongside local render; upload progress UI; estimated upload time warning for large files
- Desktop Cloud Renders tab: fully wired — reconcile `CloudRenderJob.status` type with canonical job status enum (`'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed'`); live job status via SSE; `queued` state shows queue position (derived from `created_at` ordering among the user's `queued` jobs, returned by the SSE or status endpoint); progress indicators per pipeline stage; download action with 7-day expiry countdown; failed state with credit-restored message
- SES emails sent by pipeline Lambdas on render completion and failure. `apps/api` does not call SES directly.

**Download window:** 7 days (intentional reduction from the original web-app spec's 14 days, reflecting the desktop-primary use case).

**Depends on:** `cloud-db`, `cloud-infra`, `cloud-auth`, `cloud-licensing`

---

### `feature/cloud-youtube`
**Owns:** Direct-to-YouTube upload pipeline, including SQS dispatch Lambda + Fargate task handler code
- `apps/api`: OAuth endpoints (`GET /auth/youtube/connect`, `GET /auth/youtube/callback`), social upload endpoint (`POST /jobs/:id/social-upload`), token storage + refresh logic
- SQS dispatch Lambda handler code: reads `platform` field, dispatches to YouTube Fargate task
- YouTube upload Fargate task handler code: streams S3 render output → YouTube resumable upload API; handles token refresh on 401; calls `consumeCredits` on success, `releaseCredits` on failure; updates `social_uploads.status`
- Desktop: YouTube upload button on completed Cloud Renders entries; OAuth connect flow via BrowserWindow; upload status tracking

**Credit cost:** flat 10 RC per YouTube upload

**Depends on:** `cloud-db`, `cloud-infra`, `cloud-auth`, `cloud-licensing`

---

### `feature/cloud-admin`
**Owns:** `apps/admin` — internal admin dashboard
- User list + detail view (Clerk user data + DB records)
- License management: issue, revoke, extend licenses manually
- Job monitoring: job list with status, error messages, Step Functions execution links
- Credit management: manual credit adjustments (grants, corrections)
- Admin auth: separate Clerk organisation or role gate — admin routes not accessible to regular users
- Shell and UI work can begin immediately; API integration requires `cloud-auth` to have landed

**Depends on:** `cloud-db`, `cloud-auth`

---

## Section 3: Sequence & Parallelism

```
Phase 1 — parallel (no dependencies)
├── feature/cloud-db
└── feature/cloud-infra

Phase 2 — parallel (unblocked once cloud-db lands)
├── feature/cloud-auth          ← also scaffolds apps/api
└── feature/cloud-admin         ← shell work only; API integration waits for cloud-auth

Phase 3 — sequential (needs cloud-auth)
└── feature/cloud-licensing

Phase 4 — parallel (unblocked once cloud-licensing lands)
├── feature/cloud-rendering     ← also triggers cloud-infra re-deploy (relay Lambda URL)
└── feature/cloud-youtube
```

`cloud-admin` shell work (routing, layout, static UI) can begin in Phase 2 alongside `cloud-auth`. API integration within the admin app is blocked until `cloud-auth` merges and `apps/api` is scaffolded.

`cloud-rendering` and `cloud-youtube` are the heaviest branches and should be worked in parallel once the foundation is in place. When `cloud-rendering` ships, a re-deploy of `cloud-infra` is needed to inject the `POST /api/webhooks/render` URL into the EventBridge relay Lambda.

---

## License Tiers

| Tier | Annual price | Entitlements |
|---|---|---|
| Plus | TBD | RaceDash Desktop software access |
| Pro | TBD | Desktop access + 250 GB cloud storage allowance (sync deferred to phase 2) |

Both tiers require credits for cloud rendering and YouTube uploads.

**Concurrent render limits:**

| Tier | Max concurrent cloud renders |
|---|---|
| Plus | 1 |
| Pro | 3 |

A job occupies a slot while in `rendering` or `compositing` state. Jobs in `uploading` or `queued` state do not consume a slot. If a user submits a render while at their limit, Step Functions accepts the execution immediately but holds it in a `WaitForSlot` polling loop at the start of the workflow until a slot becomes free. See Rendering Pipeline for details.

---

## Credit System

Cloud rendering cost follows the `computeCredits` formula:

```ts
function computeCredits(width, height, fps, durationSec): number {
  const durationMin = durationSec / 60
  const resFactor = width >= 3840 ? 3.0 : 1.0
  const fpsFactor = fps >= 120 ? 1.75 : 1.0
  return Math.ceil(durationMin * resFactor * fpsFactor)
}
```

YouTube upload: **10 RC flat** per upload.

Credits are purchased in-app via Stripe Checkout (server-initiated: desktop receives a hosted Checkout URL from the API and opens it in a BrowserWindow). FIFO depletion (soonest-expiring pack first). 12-month expiry per pack.

---

## Rendering Pipeline (Desktop Path)

The desktop joins chapter files locally before submitting to cloud. The Step Functions state machine has no join step.

`complete-upload` always triggers Step Functions immediately regardless of how many renders the user currently has active. Slot enforcement is handled inside the state machine itself via an initial `WaitForSlot` polling loop — no pre-flight check in the API.

```
Desktop
  │  upload joined.mp4 → S3 (multipart, presigned URLs via /jobs/:id/start-upload)
  │  POST /jobs/:id/complete-upload  →  jobs.status = 'queued', StartExecution
  ▼
Step Functions
  ├─ WaitForSlot            (polling loop, 15s interval, max 480 iterations = 2 hours)
  │    Lambda: query DB for count of user's jobs in ('rendering', 'compositing')
  │    Compare against tier limit (Plus=1, Pro=3)
  │    ├─ count < limit  → CheckSlotGranted (updates jobs.status → 'rendering', proceeds)
  │    └─ count ≥ limit  → WaitForSlot (loop)
  │    Catch → ReleaseCreditsAndFail
  │
  ├─ StartRenderOverlay     (Remotion Lambda → overlay.mov → S3)
  │    Catch → ReleaseCreditsAndFail
  │
  ├─ WaitForRemotionLambda  (polling, 10s interval, max 120 iterations)
  │    ├─ done=true      → CreateMediaConvertJob
  │    ├─ fatalError     → ReleaseCreditsAndFail
  │    └─ iterCount=120  → ReleaseCreditsAndFail
  │
  ├─ CreateMediaConvertJob  (composite joined.mp4 + overlay.mov → output.mp4)
  │    Catch → ReleaseCreditsAndFail
  │
  ├─ WaitForMediaConvert    (polling, 30s interval, max 60 iterations; writes status → 'compositing' on first poll)
  │    ├─ COMPLETE      → FinaliseJob
  │    ├─ ERROR         → ReleaseCreditsAndFail
  │    └─ iterCount=60  → ReleaseCreditsAndFail
  │
  ├─ FinaliseJob            (consume credits, status → 'complete', download_expires_at = now() + 7 days)
  ├─ NotifyUser             (SES email with download prompt — separate state; failure routes to LogNotifyError)
  ├─ LogNotifyError         (log SES failure; job already complete, do NOT release credits → Succeed)
  └─ ReleaseCreditsAndFail  (release credit reservation, status → 'failed', SES failure email)
```

**WaitForSlot timeout:** 480 iterations × 15s = 2 hours maximum wait time. If a slot never frees within 2 hours (extreme edge case), the job routes to `ReleaseCreditsAndFail` and the user is notified with credits fully restored.

**State machine timeout:** `TimeoutSeconds: 14400` (4 hours) — covers worst-case 2-hour slot wait + up to 2 hours of render pipeline.

**`jobs.status` during WaitForSlot:** remains `queued`. The `WaitForSlot` Lambda writes `status → 'rendering'` only when the slot is granted (the `CheckSlotGranted` transition). The Desktop Cloud Renders tab shows a "Queued" state with position information derived from `created_at` ordering among the user's `queued` jobs.

Output stored in `racedash-renders-{env}/renders/{jobId}/output.mp4`. Signed CloudFront download URL generated fresh on each `/jobs/:id/download` request, valid until `download_expires_at`.

---

## Environment Variables

### `apps/api` (deployed service)
```
CLERK_SECRET_KEY
DATABASE_URL                    (Neon pooled)
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
S3_UPLOAD_BUCKET
S3_RENDERS_BUCKET
CLOUDFRONT_DOMAIN
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY_PEM
STEP_FUNCTIONS_STATE_MACHINE_ARN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
SQS_SOCIAL_UPLOAD_QUEUE_URL
WEBHOOK_SECRET                  (shared secret; validated with timingSafeEqual in /api/webhooks/render)
```

`apps/api` does not call SES directly. All transactional emails (render completion, failure) are sent by pipeline Lambdas or the YouTube Fargate task.

### Pipeline Lambdas (via CDK environment props)
```
DATABASE_URL                    (Neon direct non-pooled)
S3_UPLOAD_BUCKET
S3_RENDERS_BUCKET
REMOTION_SERVE_URL
REMOTION_FUNCTION_NAME
MEDIACONVERT_ROLE_ARN
CLOUDFRONT_DOMAIN
CLOUDFRONT_KEY_PAIR_ID
CLOUDFRONT_PRIVATE_KEY_PEM
SES_FROM_ADDRESS
```

MediaConvert endpoint is discovered at runtime via `describeEndpoints()` — not an environment variable.

### YouTube Fargate Task (via ECS task definition environment)
```
DATABASE_URL                    (Neon direct non-pooled)
S3_RENDERS_BUCKET
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
SES_FROM_ADDRESS                (for upload failure notification email)
```

### `apps/desktop` (Electron, runtime)
```
VITE_API_URL                    (backend API base URL)
VITE_CLERK_PUBLISHABLE_KEY
```

Stripe is fully server-initiated: the desktop calls `POST /api/stripe/checkout` and receives a hosted Checkout URL, then opens it in a BrowserWindow. No Stripe publishable key is needed in the desktop.

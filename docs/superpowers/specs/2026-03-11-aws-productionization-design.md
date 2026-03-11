# RaceDash AWS Productionisation — Design Spec

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Productionise the RaceDash monorepo as a B2C SaaS platform. Users upload GoPro karting footage via a web browser, configure their session, and receive a Remotion-rendered overlay composited onto their footage. Billing is credit-based with no subscription. The rendering backend runs entirely on AWS; the web application is hosted on Vercel.

---

## Monorepo Structure

```
racedash/
  apps/
    web/          ← NEW: Next.js 15 App Router (Vercel)
    renderer/     ← existing Remotion compositions
    cli/          ← existing local CLI tool (unchanged)
  infra/          ← NEW: AWS CDK v2 stacks (TypeScript)
  packages/
    core/         ← existing shared types
    compositor/   ← existing (reused in Fargate worker container)
    scraper/      ← existing
    timestamps/   ← existing
    db/           ← NEW: Drizzle ORM schema, client, credit helpers
```

---

## Service Choices

| Concern | Choice | Rationale |
|---|---|---|
| Frontend hosting | Vercel (Next.js 15 App Router) | — |
| Auth | Clerk | Best Next.js App Router integration; email, Google OAuth, webhooks |
| Database | Neon (serverless Postgres) | FIFO credit depletion requires SQL; serverless driver built for Vercel |
| ORM | Drizzle | Type-safe, lightweight, same TS codebase |
| Payments | Stripe + Stripe Tax | Checkout, webhooks, automatic VAT/GST calculation |
| Job orchestration | AWS Step Functions | Built-in ECS `.sync`, visual debugging, clean error/retry handling |
| IaC | AWS CDK v2 (TypeScript) | Same language as monorepo |
| Email | AWS SES | Credit expiry reminders, render completion notifications |
| Output delivery | S3 + CloudFront | Presigned URLs; CloudFront for global edge caching |

---

## Section 1: Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (user)                                                 │
│  Next.js on Vercel                                              │
│   ├── App Router (RSC + client components)                      │
│   ├── Route handlers (serverless) ← Clerk auth middleware       │
│   └── Direct S3 multipart upload (presigned URLs)              │
└────────────────────┬───────────────────────────────────────────┘
                     │ HTTP (render jobs: StartExecution directly)
                     │ SQS  (social uploads only)
┌────────────────────▼───────────────────────────────────────────┐
│  AWS                                                            │
│                                                                 │
│  S3 (uploads)  →  Step Functions workflow                       │
│                      │                                          │
│                      ├─ [Choice] single file? skip join         │
│                      ├─ [1] Fargate task: ffmpeg join (I/O)     │
│                      │        └─ writes race.mp4 → S3          │
│                      ├─ [2] Remotion Lambda: render overlay     │
│                      │        └─ writes overlay.mov → S3       │
│                      ├─ [3] MediaConvert: composite + encode    │
│                      │        └─ writes output.mp4 → S3        │
│                      └─ [4] Lambda: notify (SES) + DB update   │
│                                                                 │
│  S3 (renders) → CloudFront → presigned download URL            │
│  Neon Postgres: users, credits, jobs                           │
└────────────────────────────────────────────────────────────────┘
```

---

## Section 2: Upload Pipeline

### Flow

1. User selects GoPro chapter files in the browser
2. Client-side probe — browser uses `mp4box.js` to read each selected file's moov atom from the local `File` object. Extracts `width`, `height`, `r_frame_rate`, `duration` locally (no upload, no server call). Browser calls `computeCredits()` (same formula as server) to display the RC cost quote instantly.
3. User reviews RC cost and confirms
   - `POST /api/jobs/reserve { config, filenames }` — atomically creates job record + reserves credits in a single DB transaction
   - If balance ≥ rc_cost: job created with status `'uploading'`, returns `job_id`
   - If balance < rc_cost: API returns `402 { needed, available, shortfall }` (no job record created); UI shows overage top-up prompt (Section 7) and pack options. User purchases credits, then re-calls `POST /api/jobs/reserve` with the same config
4. `POST /api/jobs/[id]/start-upload` — returns presigned multipart upload URLs (one set per chapter)
5. Browser uploads directly to S3 in 10 MB chunks (parallel per file, sequential across files optional)
6. `POST /api/jobs/[id]/complete-upload` — API completes S3 multipart uploads, invokes the ValidationLambda synchronously, updates status → `'queued'`, then calls `states:StartExecution` with input:
   ```json
   {
     "jobId": "...",
     "inputS3Keys": ["uploads/{jobId}/GX01.MP4", ...],
     "config": { "...session config..." },
     "validated": { "width": 3840, "height": 2160, "fps": 60, "durationSec": 1847, "rcCost": 92 }
   }
   ```
   The `validated` object is the authoritative source for `rc_cost` (written by `FinaliseJob`) and for MediaConvert bitrate selection (`CreateMediaConvertJob`). SQS is not used in the render job path.
7. Step Functions execution begins. Status transitions:
   - Multi-file jobs: `JoinFootage` Fargate container writes `jobs.status → 'joining'` at container start; `StartRenderOverlay` Lambda writes `'rendering'`
   - Single-file jobs (join skipped): `StartRenderOverlay` Lambda writes `'rendering'` directly from `'queued'`
   - Both paths: `WaitForMediaConvert` first-poll Lambda writes `'compositing'`; `FinaliseJob` Lambda writes `'complete'`; `ReleaseCreditsAndFail` Lambda writes `'failed'`

### Pre-flight (Step 2)

Pre-flight happens **client-side** at file selection time. The browser uses `mp4box.js` (a JS MP4 demuxer) to read each file's moov atom from the local `File` object — no upload required. This extracts `width`, `height`, `r_frame_rate`, and `duration` from the container header within milliseconds. The RC cost is shown instantly as files are selected.

**Server-side validation**: after upload completes in Step 6, the `complete-upload` handler invokes a validation Lambda that runs ffprobe on the uploaded files via S3 presigned URL (range request, first few MB only). If the authoritative RC cost differs from the client-quoted cost by more than 10%, the pipeline does not start. Credits reserved at the client-quoted cost are released, and the user is shown the corrected quote to re-confirm. If the re-reservation fails due to insufficient balance (another job consumed credits in the gap), the pipeline aborts and the user is shown the top-up prompt with the corrected cost. In practice this edge case is rare (GoPro moov atoms are reliable); it exists as a fraud/error guard.

### Resumable upload

Multipart `UploadId` values are populated in `jobs.upload_ids` (JSONB) by the `start-upload` handler — this is where S3 `CreateMultipartUpload` is called and `UploadId` is returned. At reservation time (`reserve`) the column is `null`. If the user disconnects after `start-upload` and returns, the UI fetches the stored `UploadId` values and re-requests presigned part URLs for incomplete parts only (via `ListParts`). Already-completed parts are not re-uploaded.

### UX for large files

The UI shows an estimated upload time based on a rough throughput estimate and warns that the tab must stay open. Example:

```
Uploading 24.9 GB — estimated 2.8 hours on a 20 Mbps connection.
You'll receive an email when your render is ready.
```

### S3 Bucket Structure

```
racedash-uploads-{env}/
  uploads/{jobId}/GX010088.MP4
  uploads/{jobId}/GX020088.MP4
  uploads/{jobId}/GX030088.MP4

racedash-renders-{env}/
  renders/{jobId}/joined.mp4        ← Fargate join output (multi-file jobs only)
  renders/{jobId}/overlay.mov       ← Remotion Lambda output (ProRes 4444, 1080p)
  renders/{jobId}/output.mp4        ← MediaConvert final output
```

### S3 Lifecycle Rules

| Prefix | Tag | Expiry |
|---|---|---|
| `uploads/` | `job-status: complete` | 1 day |
| `renders/` | `file-type: intermediate` | 2 days |
| `renders/` | `file-type: output` | 14 days |
| Any | (incomplete multipart) | 3 days |

---

## Section 3: Render Pipeline

### Step Functions State Machine

**Timeouts**: state machine `TimeoutSeconds: 7200` (2 hours, covers worst-case upload + join + render). `WaitForRemotionLambda` max 120 iterations (20 min). `WaitForMediaConvert` max 60 iterations (30 min). If either polling loop exhausts its iterations, it routes to `ReleaseCreditsAndFail`. If the state machine itself times out (`TIMED_OUT`), the EventBridge relay Lambda fires and the `/api/webhooks/render` webhook calls `releaseCredits` (idempotent).

```
StartExecution (jobId, inputS3Keys[], config)
  │
  ├─ [State: CheckInputCount]  ← Choice state
  │    ├─ inputS3Keys.length > 1  → JoinFootage
  │    └─ inputS3Keys.length == 1 → RenderOverlay (passes inputS3Keys[0] as joinedS3Key)
  │
  ├─ [State: JoinFootage]  (multi-file only)
  │    ECS RunTask (Fargate) .sync
  │    Input:  uploads/{jobId}/*.MP4
  │    Output: renders/{jobId}/joined.mp4
  │    Catch → ReleaseCreditsAndFail
  │
  ├─ [State: StartRenderOverlay]
  │    Lambda: invoke renderMediaOnLambda()
  │    Input:  joinedS3Key, session config (URLs, kart, style)
  │    Returns { renderId }; updates jobs.status → 'rendering'
  │    Catch → ReleaseCreditsAndFail
  │
  ├─ [State: WaitForRemotionLambda]  ← polling loop, 10s interval, max 120 iterations
  │    Lambda: calls getRenderProgress(renderId), no other I/O
  │    ├─ done=true      → CreateMediaConvertJob
  │    │    (Remotion Lambda has written overlay.mov to renders/{jobId}/overlay.mov)
  │    ├─ fatalError     → ReleaseCreditsAndFail
  │    ├─ iterCount=120  → ReleaseCreditsAndFail
  │    └─ else           → WaitForRemotionLambda (loop)
  │
  ├─ [State: CreateMediaConvertJob]
  │    Lambda: submit MediaConvert job, returns MediaConvert jobId
  │
  ├─ [State: WaitForMediaConvert]  ← polling loop, 30s interval, max 60 iterations
  │    Lambda: check MediaConvert job status; updates jobs.status → 'compositing' on first poll
  │    ├─ COMPLETE      → FinaliseJob
  │    ├─ ERROR         → ReleaseCreditsAndFail
  │    ├─ iterCount=60  → ReleaseCreditsAndFail
  │    └─ else          → WaitForMediaConvert (loop)
  │
  ├─ [State: FinaliseJob]
  │    Lambda:
  │    - Convert credit reservation → consumed (Drizzle transaction)
  │    - Update job status → complete
  │    - Store output_s3_key (constructed deterministically as `renders/{jobId}/output.mp4`
  │      from the execution context jobId — no need to parse MediaConvert response)
  │      + set download_expires_at = now() + 14 days in DB
  │      (signed download URL is NOT stored — generated fresh on each /jobs/[id] page load
  │       by the Next.js route handler using CLOUDFRONT_KEY_PAIR_ID + CLOUDFRONT_PRIVATE_KEY_PEM,
  │       signed valid until download_expires_at)
  │
  ├─ [State: NotifyUser]
  │    Lambda: SES email with download link
  │    Catch → LogNotifyError (job is already complete; do NOT release credits)
  │
  ├─ [State: LogNotifyError]
  │    Lambda: log SES failure to CloudWatch → [Succeed]
  │
  ├─ [Succeed]
  │
  └─ [State: ReleaseCreditsAndFail]  ← Catch target for all stages except NotifyUser
       Lambda: release credit reservation, update job status → failed, SES email
```

### Fargate Join Task

- **Image**: `node:20-alpine` + ffmpeg + `@racedash/compositor` package
- **Task**: 2 vCPU / 4 GB RAM — I/O bound, no heavy compute
- **Spot**: yes (join is idempotent; interruption retries from scratch)
- **Status update**: worker writes `jobs.status → 'joining'` to DB via Neon at task start
- **Mechanism**: `ffmpeg -f concat -safe 0 -i filelist.txt -c copy -y -` piped to `aws s3 cp - s3://bucket/renders/{jobId}/joined.mp4`
  - Source files read via presigned HTTP URLs (no local disk copy of input)
  - Output streamed directly to S3 (no large EBS volume required)
- **Duration**: ~5–12 minutes for ~19 GB at Fargate network throughput
- **Single-file jobs**: join step skipped entirely via Choice state

### Remotion Lambda Overlay Render

- **Deployment**: `deploySite()` bundles `apps/renderer` to S3 at deploy time; `deployFunction()` provisions the Lambda function. Serve URL stored in Secrets Manager, re-deployed on renderer changes via CI.
- **Output resolution**: **1920×1080** regardless of source resolution. The overlay is 2D vector graphics; MediaConvert upscales to match the source during compositing. Keeps ProRes 4444 intermediate to ~8–12 GB for 30 minutes (vs ~35 GB at 4K).
- **Codec**: ProRes 4444 / `yuva444p10le` — alpha channel preserved for compositing
- **Parallelism**: Remotion Lambda spawns ~200 concurrent Lambda invocations, each rendering a chunk of frames
- **Duration**: ~60–120 seconds wall-clock for a 30-minute 1080p60 overlay
- **Source video**: referenced from S3 in the Remotion `<Video>` component; each Lambda invocation reads only its time-slice via HTTP range requests

### MediaConvert Composite + Encode

- **Input 1**: `renders/{jobId}/joined.mp4` for multi-file jobs; `uploads/{jobId}/{filename}` (the raw upload key, i.e. `inputS3Keys[0]`) for single-file jobs — passed through the state machine as `joinedS3Key` in both cases
- **Input 2**: `renders/{jobId}/overlay.mov` — ProRes 4444 overlay, 1920×1080. MediaConvert scales this to match the source resolution using `STRETCH` scaling (the overlay is always 16:9 matching the source aspect ratio, so stretch = fill with no distortion)
- **Output codec**: H.265 (HEVC)
- **Output bitrate**: determined by `CreateMediaConvertJob` Lambda from `validated.width` in the Step Functions execution context:
  - `width >= 3840` (2160p / UHD) → **50 Mbps**
  - `width >= 2560` (1440p) → **30 Mbps**
  - else (1080p and below) → **20 Mbps**
- **Audio**: copied from source unchanged
- **Duration**: ~3–8 minutes for a 30-minute 2160p60 job
- **Pricing**: UHD $0.030/min, HD $0.015/min

### End-to-end timing (30-minute 2160p60 race)

| Step | Duration |
|---|---|
| Upload (user-side, 20 Mbps) | ~2.8 hours |
| Fargate join | ~8 min |
| Remotion Lambda overlay | ~90 sec |
| MediaConvert composite | ~5 min |
| **Total post-upload** | **~15 min** |

### Failure handling

Every stage failure routes to `ReleaseCreditsAndFail`:
- Credit reservation fully released (user balance restored)
- Job status → `failed` with error reason
- SES email: "Your render failed — no credits were consumed"
- Stages 1 and 3 auto-retry twice before failing (platform errors)
- Remotion Lambda has its own internal retry logic

---

## Section 4: Social Upload

### Architecture

On-demand workflow triggered from the job detail page after a render completes.

```
POST /api/jobs/[id]/social-upload { platform, metadata }
  → validate OAuth token
  → insert social_uploads row (status: 'queued'), get socialUploadId
  → reserveCredits(db, userId, `su_${socialUploadId}`, 10)
      — credit_reservations.job_id stores 'su_{uuid}' for social uploads,
        distinguishing them from bare UUID v4 render job IDs in the same column.
        The UNIQUE constraint on job_id holds because 'su_{uuid}' is never equal
        to a bare UUID v4 string.
  → SQS message with payload:
    ```json
    {
      "socialUploadId": "...",
      "reservationKey": "su_{socialUploadId}",
      "jobId": "...",
      "userId": "...",
      "platform": "youtube" | "vimeo",
      "outputS3Key": "renders/{jobId}/output.mp4",
      "metadata": { "title": "...", "description": "...", "privacy": "..." }
    }
    ```
  → platform-specific upload consumer; DLQ Lambda uses `reservationKey` directly with `releaseCredits`
  → on failure: releaseCredits(db, `su_${socialUploadId}`), status → 'failed'
  → on success: consumeCredits(db, `su_${socialUploadId}`), status → 'live'

YouTube  → Fargate task (streams S3 → YouTube resumable upload API)
Vimeo    → Lambda     (Vimeo pull upload: provides presigned CloudFront URL; Vimeo fetches)
```

**SQS consumer architecture**: an SQS event source mapping triggers a **dispatch Lambda** on each message. The dispatch Lambda reads the `platform` field and either:
- **Vimeo**: calls the Vimeo pull upload API directly within the Lambda; sets `status → 'uploading'` before the API call. On success: `consumeCredits`, `status → 'live'`. On any failure: `releaseCredits`, `status → 'failed'`, SES email. The dispatch Lambda owns the entire Vimeo lifecycle.
- **YouTube**: sets `status → 'uploading'`, then calls `ECS RunTask` to start a Fargate task (same cluster + task definition as the join step, different entrypoint command) which streams S3 → YouTube resumable upload API. The Fargate task calls `consumeCredits` / `releaseCredits` and updates `social_uploads.status` on completion/failure.

Vimeo uses pull upload (no Fargate required). YouTube requires a Fargate push task.

### Credit cost

**10 RC flat** per social upload, regardless of resolution or duration. Covers S3 egress cost (~£0.90 for a large output file).

### Connected accounts

OAuth flows handled via Next.js route handlers (`/api/auth/[platform]/callback`). Tokens stored encrypted (AES-256, key in AWS Secrets Manager). Users connect accounts once under `/account` and reuse across all jobs.

**Token refresh**: YouTube access tokens expire after 1 hour; Vimeo tokens may also expire. The social upload consumer (Fargate task for YouTube, Lambda for Vimeo) attempts the upload and, on receiving a 401, uses the stored refresh token to obtain a new access token, updates `connected_accounts.access_token`, then retries once. If the refresh also fails (e.g. user has revoked access), the upload fails with `status: 'failed'` and an error message instructing the user to reconnect their account. Credits are released on failure.

### Extensibility

```ts
interface SocialPlatform {
  id: 'youtube' | 'vimeo'  // extend here
  uploadStrategy: 'push' | 'pull'
  oauthScopes: string[]
  validateMetadata(meta: unknown): UploadMetadata
}
```

---

## Section 5: Web App (Next.js 15 App Router)

### Route Structure

```
app/
  (marketing)/
    page.tsx                        ← landing page (public)
    pricing/page.tsx                ← credit packs, pricing table (public)

  (app)/                            ← Clerk middleware protects all routes
    dashboard/page.tsx              ← job list, credit balance summary
    upload/page.tsx                 ← new job: files, config, cost confirm
    jobs/[id]/page.tsx              ← status, progress, download, social upload
    credits/
      page.tsx                      ← balance, history, pack purchase
      success/page.tsx              ← post-Stripe redirect
    account/
      page.tsx                      ← profile, connected social accounts
      connect/[platform]/
        callback/route.ts           ← OAuth callback handler

  api/
    webhooks/
      stripe/route.ts               ← add credits on payment_intent.succeeded
      render/route.ts               ← Step Functions → EventBridge → here
      clerk/route.ts                ← user.created → create DB record
    jobs/
      reserve/route.ts              ← POST: create job record + reserve credits atomically
                                       (RC cost supplied by client from mp4box.js computeCredits();
                                        server validates against ffprobe result in complete-upload)
      [id]/
        start-upload/route.ts       ← POST: presigned multipart URLs
        complete-upload/route.ts    ← POST: complete multipart, trigger pipeline
        social-upload/route.ts      ← POST: initiate social upload
        status/route.ts             ← GET: SSE stream for real-time status
    credits/
      checkout/route.ts             ← POST: Stripe Checkout session
    auth/
      [platform]/callback/route.ts  ← OAuth callbacks
    cron/
      expiry-notifications/route.ts ← GET: daily cron (Vercel Cron, guarded by CRON_SECRET)
```

### Real-time Job Status

Server-Sent Events via a Vercel streaming route handler (`/api/jobs/[id]/status`). Polls `jobs.status` from DB every 3 seconds, pushes updates to the client. Closes when job reaches a terminal state (`complete` | `failed`). No WebSockets required.

**Status write ownership**: pipeline Lambdas write intermediate status transitions directly to the DB (`joining`, `rendering`, `compositing`) at the start of each stage. The `FinaliseJob` and `ReleaseCreditsAndFail` Lambdas write terminal states (`complete`, `failed`). The EventBridge → `/api/webhooks/render` webhook is used only to **trigger a push notification** (SSE close + SES email) on terminal state — it does not write status itself, avoiding any race with the Lambda writes.

### Key Pages

- **`/upload`**: Three-step flow — (1) configure session URLs + driver kart + style, (2) select chapter files + view RC cost from pre-flight, (3) confirm reservation + upload progress
- **`/dashboard`**: Job list with status chips, credit balance in header, link to start new job
- **`/jobs/[id]`**: Live pipeline step progress via SSE; download button (14-day countdown); social upload buttons on completion
- **`/credits`**: Balance breakdown by pack (RC remaining, expiry), purchase buttons, transaction history

### Auth (Clerk)

- `clerkMiddleware()` in `middleware.ts` protects `(app)/` route group
- Public routes: `(marketing)/`, all `api/webhooks/`
- Sign-in methods: email/password + Google OAuth
- `user.created` webhook → creates `users` DB record

### Vercel Considerations

- All heavy work is async — API routes only initiate or query, well within 60s function timeout
- S3 uploads bypass Vercel entirely (browser → S3 direct via presigned URLs)
- Output downloads bypass Vercel entirely (CloudFront → browser direct)

---

## Section 6: Credit System (Neon Postgres + Drizzle)

### Schema (Drizzle definitions in `packages/db`)

**`users`**
```
id, clerk_id (unique), email, billing_country,
stripe_customer_id, created_at
```

**`credit_packs`**
```
id, user_id, pack_name, rc_total, rc_remaining, price_gbp,
purchased_at, expires_at (purchased_at + 12 months),
stripe_payment_intent_id (unique)
```
Index: `(user_id, expires_at ASC) WHERE rc_remaining > 0` — supports soonest-expiring-first depletion

**`credit_reservations`**
```
id, job_id (unique), user_id, rc_amount,
status ('reserved' | 'consumed' | 'released'),
created_at, settled_at
```

**`jobs`**
```
id, user_id, status ('uploading' | 'queued' | 'joining' | 'rendering' |
  'compositing' | 'complete' | 'failed'),
-- 'uploading': chapters being uploaded; 'queued': upload complete, awaiting pipeline start
config (jsonb), input_s3_keys (text[]), upload_ids (jsonb),
joined_s3_key, overlay_s3_key, output_s3_key,
download_expires_at (null at creation; set to now() + 14 days by FinaliseJob Lambda),
-- Note: no download_url column — signed URLs are generated fresh on each /jobs/[id] page load
--       from output_s3_key, valid until download_expires_at
rc_cost, sfn_execution_arn, error_message,
created_at, updated_at
```

**`social_uploads`**
```
id, job_id, user_id, platform, status
  ('queued' | 'uploading' | 'processing' | 'live' | 'failed'),
metadata (jsonb), rc_cost (default 10),
credit_reservation_id (FK credit_reservations.id),  -- explicit FK, not string convention
platform_url, error_message, created_at, updated_at
```

**`connected_accounts`**
```
id, user_id, platform, account_name, account_id,
access_token (encrypted), refresh_token (encrypted),
connected_at, last_used_at
UNIQUE (user_id, platform)  -- one connected account per platform per user (v1 intentional)
```

**`credit_reservation_packs`** (links a reservation to the specific packs deducted from)
```
id, reservation_id (FK credit_reservations.id), pack_id (FK credit_packs.id),
rc_deducted, created_at
INDEX (reservation_id)
```

**`credit_expiry_notifications`**
```
id, user_id, credit_pack_id, threshold_days (90 | 30 | 7),
sent_at
UNIQUE (credit_pack_id, threshold_days)
```

### FIFO Credit Depletion (Drizzle Transaction)

`reserveCredits` **immediately decrements `rc_remaining`** on the affected packs. This is intentional — the user's displayed balance reflects the reservation as unavailable. The `credit_reservations` record plus the `credit_reservation_packs` table (defined in schema above) enable full restoration on failure.

```ts
// packages/db/src/credits.ts
export async function reserveCredits(
  db: DrizzleDB,
  userId: string,
  jobId: string,
  amount: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const packs = await tx
      .select()
      .from(creditPacks)
      .where(
        and(
          eq(creditPacks.userId, userId),
          gt(creditPacks.rcRemaining, 0),
          gt(creditPacks.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(creditPacks.expiresAt))  // soonest-expiring first — matches index
      .for('update')

    let remaining = amount
    const breakdown: { packId: string; deducted: number }[] = []
    for (const pack of packs) {
      if (remaining === 0) break
      const deduct = Math.min(remaining, pack.rcRemaining)
      await tx
        .update(creditPacks)
        .set({ rcRemaining: pack.rcRemaining - deduct })
        .where(eq(creditPacks.id, pack.id))
      breakdown.push({ packId: pack.id, deducted: deduct })
      remaining -= deduct
    }

    if (remaining > 0) throw new Error('Insufficient credits')

    const [reservation] = await tx
      .insert(creditReservations)
      .values({ jobId, userId, rcAmount: amount })
      .returning()

    await tx.insert(creditReservationPacks).values(
      breakdown.map(({ packId, deducted }) => ({
        reservationId: reservation.id,
        packId,
        rcDeducted: deducted,
      })),
    )
  })
}

export async function releaseCredits(db: DrizzleDB, jobId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const reservation = await tx.query.creditReservations.findFirst({
      where: eq(creditReservations.jobId, jobId),
      with: { packs: true },
    })
    if (!reservation || reservation.status !== 'reserved') return

    for (const { packId, rcDeducted } of reservation.packs) {
      // Only restore to non-expired packs. If a pack expired between reservation
      // and failure, those credits are forfeited (noted in failure email).
      await tx
        .update(creditPacks)
        .set({ rcRemaining: sql`rc_remaining + ${rcDeducted}` })
        .where(and(eq(creditPacks.id, packId), gt(creditPacks.expiresAt, new Date())))
    }

    await tx
      .update(creditReservations)
      .set({ status: 'released', settledAt: new Date() })
      .where(eq(creditReservations.id, reservation.id))
  })
}
```

`consumeCredits(db, reservationKey)` updates `status → consumed`, `settledAt → now()` — no pack changes needed as they were already decremented at reservation time.

`releaseCredits` restores credits only to **non-expired** packs (adds an `expires_at > now()` guard on each update). If a pack has expired between reservation and failure, those credits are forfeited — the user is informed in the failure email. This is an edge case (12-month expiry windows make it rare) and is explicitly acceptable in v1.

`releaseCredits` is called by the `ReleaseCreditsAndFail` Lambda for render jobs and by the social upload failure handler. Both pass the `credit_reservations.job_id` key (see social upload section for how `social_upload_id` maps to this).

### Expiry Notifications

Vercel Cron job (daily) at `GET /api/cron/expiry-notifications`, configured in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/expiry-notifications", "schedule": "0 9 * * *" }]
}
```

Handler validates `Authorization: Bearer $CRON_SECRET` (Vercel sets this automatically). Queries packs expiring within 90/30/7 days, checks `credit_expiry_notifications` for already-sent entries, sends SES emails for new crossings only. Non-reentrant by design (daily schedule + idempotency table makes concurrent runs safe).

---

## Section 7: Payments (Stripe)

### Credit Packs

| Pack | RC | Price | Stripe Price |
|---|---|---|---|
| Starter | 100 RC | £10 | `price_starter` (env var) |
| Standard | 250 RC | £20 | `price_standard` (env var) |
| Club | 500 RC | £35 | `price_club` (env var) |

Pre-created in Stripe dashboard; IDs stored in environment variables.

### Overage Top-Up

Charged at **£0.12/RC** when a job requires more RC than the current balance.

| Amount | Price |
|---|---|
| 100 RC | £12 |
| 250 RC | £30 |
| 500 RC | £60 |
| 1,000 RC | £120 |

Prices created dynamically via `price_data` in Stripe Checkout. Top-up prompt shows pack options alongside overage options so users can compare value.

### Webhook Handler

Handles `payment_intent.succeeded`. Idempotent via `UNIQUE` constraint on `stripe_payment_intent_id` — duplicate webhook deliveries are silently ignored.

### Tax

Stripe Tax enabled on all Checkout sessions (`automatic_tax: { enabled: true }`). Handles UK VAT, EU VAT, AU GST automatically. `billing_country` populated from Stripe `customer.address.country` on first purchase.

---

## Section 8: AWS CDK Infrastructure

### Stack Structure

```
infra/
  bin/app.ts
  lib/
    storage-stack.ts       ← S3 buckets, CloudFront, lifecycle rules
    pipeline-stack.ts      ← Step Functions, SQS, ECS cluster + task def, IAM
    render-stack.ts        ← Remotion Lambda IAM + site bucket, MediaConvert role
    notifications-stack.ts ← SES, EventBridge → API Gateway → /api/webhooks/render
```

### Key CDK Resources

- **StorageStack**: `racedash-uploads-{env}` + `racedash-renders-{env}` S3 buckets with lifecycle rules; CloudFront distribution over renders bucket
- **PipelineStack**: ECS Fargate cluster; worker task definition (2 vCPU / 4 GB); Step Functions state machine; SQS queue for social uploads (Lambda event source mapping triggers dispatch Lambda; DLQ with CloudWatch alarm — dead-letter Lambda calls `releaseCredits` + sends failure email). `releaseCredits` is idempotent: the `if (reservation.status !== 'reserved') return` guard prevents double-release if the in-process failure handler already ran.
- **ValidationLambda**: 512 MB, 30s timeout, ffprobe layer, `s3:GetObject` on uploads bucket. Invoked synchronously by `complete-upload` handler (blocks HTTP response). Returns `{ rc_cost, width, height, fps, durationSec }` or error. If validation cost differs >10% from reserved cost, returns a `COST_MISMATCH` error code — `complete-upload` releases + re-reserves credits or returns 402 if balance insufficient.
- **RenderStack**: Remotion Lambda IAM role (S3 read/write + Lambda self-invoke); MediaConvert IAM role (S3 read source + overlay, S3 write output); CloudFront key group + RSA key pair (CDK `cloudfront.PublicKey` + `cloudfront.KeyGroup`). The **key pair ID** (short alphanumeric string, e.g. `APKABC123`) and the **private key** (PEM) are stored in Secrets Manager. `FinaliseJob` Lambda receives `CLOUDFRONT_KEY_PAIR_ID` and `CLOUDFRONT_PRIVATE_KEY_SECRET_ARN` as env vars — the SDK `getSignedUrl` call uses the key pair ID (not the key group ARN, which is only needed at the CloudFront distribution level)
- **NotificationsStack**: EventBridge rule matching Step Functions `SUCCEEDED`/`FAILED`/`TIMED_OUT` → **relay Lambda** (not API Gateway directly — EventBridge cannot inject arbitrary HTTP headers natively). The relay Lambda adds the `x-webhook-secret` header and POSTs the event payload to the Vercel `/api/webhooks/render` URL (stored as a Lambda env var). The `/api/webhooks/render` handler validates the header with `timingSafeEqual`, then: on `SUCCEEDED` closes any open SSE connections for the job; on `FAILED`/`TIMED_OUT` calls `releaseCredits` and updates job status → `failed` (idempotent if `ReleaseCreditsAndFail` Lambda already ran)

### Minimal IAM for Vercel

Scoped to: S3 `PutObject` + multipart on uploads bucket; `states:StartExecution` on the state machine; `sqs:SendMessage` on the social upload queue. CloudFront signing uses `CLOUDFRONT_PRIVATE_KEY_PEM` env var directly — no Secrets Manager permission needed. SSE status polling reads from Neon DB — no `states:DescribeExecution` needed.

**Credential approach**: long-lived IAM user credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) are acceptable for v1 given the narrow IAM scope. Rotate quarterly. Future improvement: replace with Vercel ↔ AWS OIDC federation to eliminate long-lived keys entirely.

### CI/CD

- GitHub Actions: `cdk diff` on PRs, `cdk deploy --all` on merge to `main`
- Remotion site bundle (`deploySite`) deployed separately post-CDK; serve URL stored in Secrets Manager

---

## RC Pricing Formula

```ts
function computeCredits(
  width: number,
  height: number,
  fps: number,
  durationSec: number,
): number {
  const durationMin = durationSec / 60
  // width >= 3840 targets GoPro 2160p output (3840×2160); 1440p and below uses 1.0 (v1 intentional)
  const resFactor = width >= 3840 ? 3.0 : 1.0
  // 60fps is the baseline (fpsFactor=1.0). 30fps is also 1.0 — no discount for below-baseline fps.
  // Only slow-motion / high-fps capture (120+fps) incurs an upcharge.
  const fpsFactor = fps >= 120 ? 1.75 : 1.0
  return Math.ceil(durationMin * resFactor * fpsFactor)
}
```

1 RC = 1 minute of 1080p60 rendering. Note: 1440p content is charged at the 1080p rate in v1 — this is intentional and can be revisited when 1440p usage data is available.

`computeCredits` returns a whole integer (ceil applied inside the function). `rc_cost`, `rc_amount`, `rc_remaining`, and `rc_total` are all `INTEGER`. The client-side quote (from `mp4box.js` metadata + `computeCredits`) and the server-side reservation use the same function, so the displayed value always matches what is charged.

---

## Environment Variables

### Vercel

```
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
DATABASE_URL                        (Neon pooled connection string)
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
S3_UPLOAD_BUCKET
S3_RENDERS_BUCKET
CLOUDFRONT_DOMAIN
STEP_FUNCTIONS_STATE_MACHINE_ARN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_STARTER
STRIPE_PRICE_STANDARD
STRIPE_PRICE_CLUB
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
VIMEO_CLIENT_ID
VIMEO_CLIENT_SECRET
SQS_SOCIAL_UPLOAD_QUEUE_URL
CLOUDFRONT_KEY_PAIR_ID              (used by /jobs/[id] route handler to sign download URLs;
                                     also present in Lambda env vars — both legitimately need it)
CLOUDFRONT_PRIVATE_KEY_PEM          (PEM string injected directly as env var in both Vercel and
                                     Lambda — avoids Secrets Manager latency and extra IAM grant.
                                     Rotate by updating the env var in both places.)
WEBHOOK_SECRET                      (shared secret for EventBridge → /api/webhooks/render;
                                     passed as x-webhook-secret header, validated with
                                     timingSafeEqual before processing)
# CRON_SECRET is injected automatically by Vercel — do not set manually
```

### AWS Lambda (pipeline Lambdas — set via CDK environment props)

```
DATABASE_URL                        (Neon connection string, direct non-pooled)
AWS_REGION
S3_UPLOAD_BUCKET
S3_RENDERS_BUCKET
REMOTION_SERVE_URL                  (from Secrets Manager at deploy time)
REMOTION_FUNCTION_NAME
MEDIACONVERT_ROLE_ARN
CLOUDFRONT_DOMAIN
CLOUDFRONT_KEY_PAIR_ID              (short alphanumeric key pair ID, e.g. APKABC123)
CLOUDFRONT_PRIVATE_KEY_PEM          (PEM string injected directly — no Secrets Manager call needed)
SES_FROM_ADDRESS
```

MediaConvert endpoint is discovered at runtime via `describeEndpoints()` — not an env var.

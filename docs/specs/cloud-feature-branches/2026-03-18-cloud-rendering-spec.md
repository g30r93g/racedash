# feature/cloud-rendering — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-rendering`
**Depends on:** `feature/cloud-db`, `feature/cloud-infra`, `feature/cloud-auth`, `feature/cloud-licensing`

---

## Overview

This branch delivers the end-to-end cloud rendering pipeline from the desktop app to a downloadable output. It implements eight API endpoints for job lifecycle management (creation, upload, execution, listing, status streaming, download, and webhook handling), all seven Lambda handler functions for the Step Functions render pipeline, and the desktop UI changes that let users submit cloud renders, monitor progress via SSE, and download completed outputs. After this branch lands, a user can select "Cloud render" in the Export tab, upload a pre-joined video via S3 multipart upload, watch the pipeline progress in real time through the Cloud Renders tab, and download the finished composite within a 7-day window.

---

## Scope

### In scope

- `apps/api` route modules for all seven endpoints:
  - `POST /jobs` — create job + reserve credits
  - `POST /jobs/:id/start-upload` — presigned S3 multipart URLs
  - `POST /jobs/:id/complete-upload` — complete multipart upload + start Step Functions execution
  - `GET /jobs/:id/status` — SSE stream for live job status
  - `GET /jobs/:id/download` — signed CloudFront URL
  - `POST /api/webhooks/remotion` — Remotion completion webhook
  - `POST /api/webhooks/render` — EventBridge relay webhook for Step Functions terminal states
- Lambda handler source code in `infra/lambdas/`:
  - `wait-for-slot.ts` — WaitForSlot
  - `grant-slot.ts` — GrantSlot
  - `start-render-overlay.ts` — StartRenderOverlay
  - `prepare-composite.ts` — PrepareComposite
  - `finalise-job.ts` — FinaliseJob
  - `notify-user.ts` — NotifyUser
  - `release-credits-and-fail.ts` — ReleaseCreditsAndFail
- Desktop Export tab: cloud render option alongside local render, estimated credit cost display, upload time estimate for large files
- Desktop Cloud Renders tab: full wiring with canonical job status enum, live SSE status, queue position display, per-stage progress indicators, download action with 7-day expiry countdown, failed state with credit-restored message
- Multipart upload from desktop via presigned URLs
- IPC additions for cloud render flow
- Preload script additions for new IPC channels
- Webhook route auth exclusions (add `/api/webhooks/remotion` and `/api/webhooks/render` to Clerk middleware exclusion list, additively alongside existing exclusions from cloud-auth, cloud-licensing, and cloud-youtube)

### Out of scope

- CDK constructs, IAM roles, S3 buckets, Step Functions state machine definition, CloudFront distribution, EventBridge rules — owned by `feature/cloud-infra`
- Database schema, migrations, Drizzle definitions — owned by `feature/cloud-db`
- Credit helpers (`reserveCredits`, `releaseCredits`, `consumeCredits`), `computeCredits`, slot helpers (`claimNextQueuedSlotToken`, `getSlotLimit`, `countActiveRenders`) — owned by `feature/cloud-db`, consumed here
- Clerk auth middleware and API scaffold — owned by `feature/cloud-auth`
- License tier validation, Stripe integration, credit balance UI — owned by `feature/cloud-licensing`
- YouTube/social upload integration — owned by `feature/cloud-youtube`
- Admin dashboard — owned by `feature/cloud-admin`
- Remotion composition code (the overlay template itself) — pre-existing

---

## Functional Requirements

### API Endpoints

1. **FR-1:** `POST /jobs` must validate the authenticated user has an active license (via `@racedash/db` license helpers), calculate the credit cost using `computeCredits`, reserve credits using `reserveCredits`, insert a new job row with `status: 'uploading'` and `rc_cost` set to the computed cost, and return the job ID and upload key. If `reserveCredits` throws `InsufficientCreditsError`, return `402 Payment Required`.
2. **FR-2:** `POST /jobs/:id/start-upload` must verify the job belongs to the authenticated user and is in `'uploading'` status. It must initiate a multipart upload on S3 (`uploads/{jobId}/joined.mp4`) and return presigned URLs for each part based on the `partCount` and `partSize` provided in the request body. The `uploadId` must be stored on the job row.
3. **FR-3:** `POST /jobs/:id/complete-upload` must verify the job belongs to the authenticated user and is in `'uploading'` status. It must complete the S3 multipart upload using the provided `parts` array, transition the job to `status: 'queued'`, and start a Step Functions execution with `{ jobId, userId }` as input. The `sfn_execution_arn` must be stored on the job row. Step Functions is always started immediately — slot enforcement is handled inside the state machine by `WaitForSlot`.
4. **FR-4:** `GET /jobs/:id/status` must verify the job belongs to the authenticated user. It must return an SSE stream (`Content-Type: text/event-stream`) that emits the current job status on connection and subsequent updates as they occur. Each SSE event must include `status`, `progress` (number 0-1 where applicable), `queuePosition` (for `'queued'` jobs), and `errorMessage` (for `'failed'` jobs). The SSE stream must use a polling interval of 2 seconds against the database. The stream must close when the job reaches a terminal state (`'complete'` or `'failed'`).
5. **FR-5:** `GET /jobs/:id/download` must verify the job belongs to the authenticated user, the job status is `'complete'`, and `download_expires_at` is in the future. It must return a signed CloudFront URL for `renders/{jobId}/output.mp4` that is valid for 1 hour (short-lived signed URL within the 7-day download window). If the download window has expired, return `410 Gone`.
6. **FR-6:** `POST /api/webhooks/remotion` must validate the `X-Remotion-Signature` header using HMAC-SHA512 with `REMOTION_WEBHOOK_SECRET`. It must extract the `taskToken` from `customData` in the webhook payload. On `success` type, call `states:SendTaskSuccess` with the task token. On `error` or `timeout` type, call `states:SendTaskFailure`. Invalid signatures must return `401 Unauthorized`. This route must be excluded from Clerk auth middleware.
7. **FR-7:** `POST /api/webhooks/render` must validate the `x-webhook-secret` header using `timingSafeEqual` with the `WEBHOOK_SECRET` environment variable. On Step Functions terminal state events (`SUCCEEDED`, `FAILED`, `TIMED_OUT`, `ABORTED`), the handler uses this as a signal to check for freed slots. For `SUCCEEDED` or `FAILED` terminal states involving a user's job, it calls `claimNextQueuedSlotToken` for that user and, if a token is returned, calls `states:SendTaskSuccess` to wake the next queued job. Invalid signatures must return `401 Unauthorized`. This route must be excluded from Clerk auth middleware.
8. **FR-8:** `GET /jobs` (list jobs) must return all jobs for the authenticated user, ordered by `created_at DESC`, with pagination. Each job includes `id`, `status`, `config`, `createdAt`, `downloadExpiresAt`, `errorMessage`, and `queuePosition` (for queued jobs).

### Lambda Handlers

9. **FR-9:** `WaitForSlot` must receive `{ jobId, userId, taskToken }` from Step Functions. It must store the `taskToken` in `jobs.slot_task_token`. It must then check if a slot is already free by calling `countActiveRenders(db, userId)` and comparing against `getSlotLimit(tier)` (where `tier` is looked up from the user's active license). If `activeRenders < slotLimit`, call `states:SendTaskSuccess` immediately with the task token (no wait needed). Otherwise, return — the execution pauses until a terminal-state Lambda signals via `claimNextQueuedSlotToken`.
10. **FR-10:** `GrantSlot` must receive `{ jobId }` and update the job's status to `'rendering'`.
11. **FR-11:** `StartRenderOverlay` must receive `{ jobId, userId, taskToken }`. It must read the job's `config` to determine overlay parameters. It must call `renderMediaOnLambda()` from `@remotion/lambda` with the Remotion serve URL, function name, composition ID, input props (including overlay config and S3 input key), the webhook URL (`REMOTION_WEBHOOK_URL`), and `customData` containing the `taskToken`. It must store the returned `renderId` in `jobs.remotion_render_id`. The Lambda returns immediately after calling `renderMediaOnLambda()` — the execution pauses until the Remotion webhook fires.
12. **FR-12:** `PrepareComposite` must receive `{ jobId }` and update the job's status to `'compositing'`. It must read the job's source video metadata (resolution) to determine the MediaConvert output bitrate (50 Mbps for width >= 3840, 30 Mbps for width >= 2560, 20 Mbps otherwise). It must construct and return a MediaConvert job configuration with the overlay S3 key (`renders/{jobId}/overlay.mov`) and source video S3 key (`uploads/{jobId}/joined.mp4`) as inputs, the output S3 key (`renders/{jobId}/output.mp4`), and the `MEDIACONVERT_ROLE_ARN`. The returned config is passed directly to the `RunMediaConvert` SDK integration state.
13. **FR-13:** `FinaliseJob` must receive `{ jobId, userId }`. It must call `consumeCredits` to settle the credit reservation. It must update the job's status to `'complete'` and set `download_expires_at` to `now() + 7 days`. It must delete the source upload from S3 (`uploads/{jobId}/joined.mp4`). It must then signal the next queued job by calling `claimNextQueuedSlotToken({ db, userId })` — if a token is returned, call `states:SendTaskSuccess` with it.
14. **FR-14:** `NotifyUser` must receive `{ jobId, userId }`. It must look up the user's email from the `users` table and send a render completion email via SES. The email subject must be "Your RaceDash render is ready" and include a link to download the output (the download link points to the desktop app or a web page, not a direct S3 URL). This is a separate Lambda so that an SES failure does not roll back the completed job.
15. **FR-15:** `ReleaseCreditsAndFail` must receive `{ jobId, userId, error }`. It must call `releaseCredits` to restore the reserved credits. It must update the job's status to `'failed'` and store `error` in `jobs.error_message`. It must send a failure notification email via SES (subject: "Your RaceDash render failed"). It must then signal the next queued job by calling `claimNextQueuedSlotToken({ db, userId })` — if a token is returned, call `states:SendTaskSuccess` with it. SES failure in this Lambda must be caught and logged, not rethrown — the credit release and status update are the critical operations.

### Desktop UI

16. **FR-16:** The Export tab must add a "Render destination" option group with two options: "Local" and "Cloud". When "Cloud" is selected, the output path section is hidden (cloud renders output to S3), and a cloud-specific section appears showing the estimated credit cost (via `computeCredits` from `@racedash/db`), the estimated upload time based on `videoInfo.durationSeconds` and file size heuristics, and a "Submit cloud render" button. The existing local render flow remains unchanged.
17. **FR-17:** When the user clicks "Submit cloud render", the desktop must: (a) join chapter files locally if multiple video paths exist, (b) call `POST /jobs` to create the job and reserve credits, (c) call `POST /jobs/:id/start-upload` to get presigned URLs, (d) upload the joined file to S3 using multipart upload with progress reporting, (e) call `POST /jobs/:id/complete-upload` to finalize. During upload, a progress bar and upload speed indicator must be shown.
18. **FR-18:** The Cloud Renders tab (`CloudRendersList.tsx`) must be fully wired. The `CloudRenderJob` interface must be reconciled to use the canonical status enum (`'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed'`). The `storageUsedGb`/`storageLimitGb` fields and storage bar must be removed (already hidden by `cloud-licensing`; this branch removes the dead code). The `youtubeUrl` field is removed (owned by `cloud-youtube`).
19. **FR-19:** The Cloud Renders tab must group jobs into three sections: "Active" (uploading, queued, rendering, compositing), "Completed" (complete), and "Failed" (failed). Each job card must show the project name, session type, resolution, render mode, status badge, and timestamp.
20. **FR-20:** For `'queued'` jobs, the Cloud Renders tab must display the queue position (e.g., "Position 2 in queue"). Queue position is derived from `created_at` ordering among the user's queued jobs and is provided by the SSE status endpoint or `GET /jobs`.
21. **FR-21:** For `'rendering'` and `'compositing'` jobs, the Cloud Renders tab must show a progress indicator. Rendering progress comes from the SSE stream. Compositing shows an indeterminate progress bar (MediaConvert does not report granular progress to the API).
22. **FR-22:** For `'complete'` jobs, the Cloud Renders tab must show a "Download" button and a countdown displaying time remaining until the download expires (e.g., "Expires in 6 days 12 hours"). When `download_expires_at` is in the past, the download button must be disabled and the label must read "Expired".
23. **FR-23:** For `'failed'` jobs, the Cloud Renders tab must show the error message from the API and a note that credits have been restored to the user's balance.
24. **FR-24:** The Cloud Renders tab must establish an SSE connection to `GET /jobs/:id/status` for each active job (uploading, queued, rendering, compositing) and update the UI in real time as status changes arrive. SSE connections must be closed when a job reaches a terminal state or when the component unmounts.

---

## Non-Functional Requirements

1. **NFR-1:** Multipart upload from the desktop must saturate the user's upstream bandwidth. Parts must be uploaded with a concurrency of 4 (four parts uploading simultaneously). Each part size must be 10 MB (minimum for S3 multipart, except the last part).
2. **NFR-2:** The SSE status stream must have a polling interval of no more than 2 seconds. The response must use `Cache-Control: no-cache` and `Connection: keep-alive`.
3. **NFR-3:** Lambda cold starts for pipeline handlers must remain under 1 second. Handlers must avoid importing heavy SDKs at module scope — use lazy imports for the AWS SDK clients.
4. **NFR-4:** The Remotion webhook handler must respond within 5 seconds. The `SendTaskSuccess`/`SendTaskFailure` call to Step Functions must be fire-and-forget (awaited but with a timeout).
5. **NFR-5:** Presigned URLs for multipart upload parts must expire after 1 hour. This gives the desktop enough time to upload large files without URL expiration during transfer.
6. **NFR-6:** The signed CloudFront download URL must be valid for 1 hour (short-lived, within the 7-day download window). If the user clicks "Download" again after the URL expires, a new signed URL is generated.
7. **NFR-7:** SSE connections must be cleaned up on client disconnect. The API must detect when the client closes the connection and stop polling the database for that job.
8. **NFR-8:** All exported functions and interfaces must have complete TypeScript type signatures (no `any` types).
9. **NFR-9:** Upload progress must be reported to the renderer at least once per second. The IPC progress event must include `bytesUploaded`, `bytesTotal`, and `uploadSpeed` (bytes/sec).
10. **NFR-10:** All API endpoints must follow the error response conventions established by `cloud-auth` (structured JSON error responses with `error` and `message` fields).

---

## API Endpoints

### `POST /jobs`

Create a new cloud render job.

**Auth:** Required (Clerk session token)

**Request body:**
```ts
{
  config: {
    resolution: OutputResolution;      // 'source' | '1080p' | '1440p' | '2160p'
    frameRate: OutputFrameRate;         // 'source' | '30' | '60' | '120'
    renderMode: RenderMode;            // 'overlay+footage' | 'overlay-only'
    overlayStyle: string;              // overlay template identifier
    config: Record<string, unknown>;   // racedash project config (stored as JSONB in jobs.config)
  };
  sourceVideo: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    fileSizeBytes: number;
  };
  projectName: string;
  sessionType: string;
}
```

**Response `201 Created`:**
```ts
{
  jobId: string;
  rcCost: number;
  uploadKey: string;                   // "uploads/{jobId}/joined.mp4"
}
```

**Error responses:**
- `402 Payment Required` — insufficient credits (`{ error: { code: 'INSUFFICIENT_CREDITS', message: '...' } }`)
- `403 Forbidden` — no active license (`{ error: { code: 'LICENSE_REQUIRED', message: '...' } }`)

---

### `POST /jobs/:id/start-upload`

Initiate S3 multipart upload and return presigned URLs.

**Auth:** Required

**Request body:**
```ts
{
  partCount: number;
  partSize: number;                    // bytes (default 10 MB = 10_485_760)
  contentType: string;                 // 'video/mp4'
}
```

**Response `200 OK`:**
```ts
{
  uploadId: string;
  presignedUrls: Array<{
    partNumber: number;
    url: string;                       // presigned PUT URL, expires in 1 hour
  }>;
}
```

**Error responses:**
- `404 Not Found` — job does not exist or does not belong to user
- `409 Conflict` — job is not in `'uploading'` status

---

### `POST /jobs/:id/complete-upload`

Complete the S3 multipart upload and start the render pipeline.

**Auth:** Required

**Request body:**
```ts
{
  parts: Array<{
    partNumber: number;
    etag: string;
  }>;
}
```

**Response `200 OK`:**
```ts
{
  jobId: string;
  status: 'queued';
  executionArn: string;
}
```

**Error responses:**
- `404 Not Found` — job does not exist or does not belong to user
- `409 Conflict` — job is not in `'uploading'` status

---

### `GET /jobs/:id/status`

SSE stream for live job status updates.

**Auth:** Required

**Response:** `Content-Type: text/event-stream`

Each SSE event:
```ts
data: {
  status: JobStatus;
  progress: number;                    // 0-1, meaningful for 'rendering'
  queuePosition: number | null;       // position among user's queued jobs, 1-indexed
  downloadExpiresAt: string | null;    // ISO 8601, set when 'complete'
  errorMessage: string | null;         // set when 'failed'
}
```

The stream emits the current state immediately on connection, then sends updates every 2 seconds while the job is active. The stream closes automatically when the job reaches `'complete'` or `'failed'`.

**Error responses:**
- `404 Not Found` — job does not exist or does not belong to user

---

### `GET /jobs/:id/download`

Get a signed CloudFront URL for the rendered output.

**Auth:** Required

**Response `200 OK`:**
```ts
{
  downloadUrl: string;                 // signed CloudFront URL, valid for 1 hour
  expiresAt: string;                   // ISO 8601, when the download window closes
}
```

**Error responses:**
- `404 Not Found` — job does not exist or does not belong to user
- `409 Conflict` — job is not in `'complete'` status
- `410 Gone` — download window has expired

---

### `GET /jobs`

List all jobs for the authenticated user.

**Auth:** Required

**Query parameters:**
- `cursor` (optional) — job ID for cursor-based pagination
- `limit` (optional) — number of results, default 20, max 100

**Response `200 OK`:**
```ts
{
  jobs: Array<{
    id: string;
    status: JobStatus;
    config: JobConfig;
    projectName: string;
    sessionType: string;
    rcCost: number | null;
    queuePosition: number | null;
    downloadExpiresAt: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  nextCursor: string | null;
}
```

---

### `POST /api/webhooks/remotion`

Remotion Lambda completion webhook.

**Auth:** None (uses `X-Remotion-Signature` HMAC-SHA512 verification)

**Request headers:**
- `X-Remotion-Signature` — HMAC-SHA512 signature of the request body using `REMOTION_WEBHOOK_SECRET`

**Request body (from Remotion):**
```ts
{
  type: 'success' | 'error' | 'timeout';
  renderId: string;
  expectedBucketOwner: string;
  customData: {
    taskToken: string;
    jobId: string;
  };
  outputUrl?: string;
  errors?: Array<{ message: string }>;
}
```

**Response:** `200 OK` (empty body)

**Error responses:**
- `401 Unauthorized` — invalid signature

---

### `POST /api/webhooks/render`

EventBridge relay webhook for Step Functions terminal states.

**Auth:** None (uses `x-webhook-secret` header with `timingSafeEqual`)

**Request headers:**
- `x-webhook-secret` — must match `WEBHOOK_SECRET` environment variable

**Request body (from EventBridge relay Lambda):**
```ts
{
  detail: {
    executionArn: string;
    status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
    input: string;                     // JSON string containing { jobId, userId }
  };
}
```

**Response:** `200 OK` (empty body)

**Behavior:** On receiving a Step Functions terminal state event (`SUCCEEDED`, `FAILED`, `TIMED_OUT`, `ABORTED`), the handler extracts `userId` from the execution input in the event detail, calls `claimNextQueuedSlotToken({ db, userId })`, and if a token is returned, calls `states:SendTaskSuccess` to wake the next queued execution. This is a backup slot-signaling path — `FinaliseJob` and `ReleaseCreditsAndFail` also signal directly, so this handler provides defense-in-depth.

**Error responses:**
- `401 Unauthorized` — invalid webhook secret

---

## Lambda Handlers

All Lambda handlers live in `infra/lambdas/` and are deployed by CDK constructs defined in `feature/cloud-infra`. The handler code is owned by this branch.

### `wait-for-slot.ts` — WaitForSlot

**Input:** `{ jobId: string, userId: string, taskToken: string }`

**Behavior:**
1. Store `taskToken` in `jobs.slot_task_token` for the given `jobId`.
2. Look up the user's license tier from the `licenses` table.
3. Call `countActiveRenders(db, userId)` and `getSlotLimit(tier)`.
4. If `activeRenders < slotLimit`, call `states:SendTaskSuccess({ taskToken, output: '{}' })` immediately.
5. Otherwise, return. The execution pauses at the `.waitForTaskToken` state until a terminal-state handler (FinaliseJob or ReleaseCreditsAndFail) signals via `claimNextQueuedSlotToken`.

**HeartbeatSeconds:** 21600 (6 hours). If no signal arrives within 6 hours, the state times out and routes to `ReleaseCreditsAndFail`.

---

### `grant-slot.ts` — GrantSlot

**Input:** `{ jobId: string }`

**Behavior:**
1. Update `jobs.status` to `'rendering'` and `jobs.updated_at` to `now()` for the given `jobId`.

---

### `start-render-overlay.ts` — StartRenderOverlay

**Input:** `{ jobId: string, userId: string, taskToken: string }`

**Behavior:**
1. Read job config from the `jobs` table.
2. Store `taskToken` in `jobs.render_task_token`.
3. Call `renderMediaOnLambda()` with:
   - `serveUrl`: `REMOTION_SERVE_URL`
   - `functionName`: `REMOTION_FUNCTION_NAME`
   - `composition`: determined by overlay style in config
   - `inputProps`: overlay configuration from job config, S3 input key
   - `codec`: `'prores'` (ProRes 4444 for transparency, 1080p)
   - `webhook`: `{ url: REMOTION_WEBHOOK_URL, secret: REMOTION_WEBHOOK_SECRET, customData: { taskToken, jobId } }`
   - `outName`: `renders/{jobId}/overlay.mov`
4. Store the returned `renderId` in `jobs.remotion_render_id`.
5. Return immediately. The execution pauses until the Remotion webhook fires.

**HeartbeatSeconds:** 900 (15 minutes).

---

### `prepare-composite.ts` — PrepareComposite

**Input:** `{ jobId: string }`

**Behavior:**
1. Update `jobs.status` to `'compositing'`.
2. Read the job's source video resolution from `jobs.config`.
3. Determine output bitrate:
   - `width >= 3840` (2160p / UHD) → 50 Mbps
   - `width >= 2560` (1440p) → 30 Mbps
   - else (1080p and below) → 20 Mbps
4. Construct and return a MediaConvert job configuration:
   ```ts
   {
     mediaConvertRoleArn: MEDIACONVERT_ROLE_ARN,
     mediaConvertSettings: {
       Inputs: [
         { FileInput: `s3://${S3_UPLOAD_BUCKET}/uploads/${jobId}/joined.mp4` },
         { FileInput: `s3://${S3_RENDERS_BUCKET}/renders/${jobId}/overlay.mov` }
       ],
       OutputGroups: [{
         OutputGroupSettings: {
           Type: 'FILE_GROUP_SETTINGS',
           FileGroupSettings: {
             Destination: `s3://${S3_RENDERS_BUCKET}/renders/${jobId}/output`
           }
         },
         Outputs: [{
           VideoDescription: {
             CodecSettings: {
               Codec: 'H_264',
               H264Settings: { Bitrate: bitrateKbps * 1000 }
             }
           },
           ContainerSettings: { Container: 'MP4' }
         }]
       }]
     }
   }
   ```
5. Return the config object. Step Functions passes it to the `RunMediaConvert` SDK integration state.

---

### `finalise-job.ts` — FinaliseJob

**Input:** `{ jobId: string, userId: string }`

**Behavior:**
1. Call `consumeCredits({ db, jobId })` to settle the credit reservation (looks up reservation by the job's ID).
2. Update the job: `status → 'complete'`, `download_expires_at → now() + 7 days`, `output_s3_key → 'renders/{jobId}/output.mp4'`.
3. Delete the source upload from S3: `uploads/{jobId}/joined.mp4`.
4. Call `claimNextQueuedSlotToken({ db, userId })`. If a token is returned, call `states:SendTaskSuccess({ taskToken: token, output: '{}' })` to wake the next queued execution.

---

### `notify-user.ts` — NotifyUser

**Input:** `{ jobId: string, userId: string }`

**Behavior:**
1. Look up the user's email from the `users` table.
2. Look up the job's `projectName` from `jobs.config`.
3. Send an email via SES:
   - From: `SES_FROM_ADDRESS`
   - Subject: "Your RaceDash render is ready"
   - Body: includes project name, render completion confirmation, and a note that the download is available for 7 days.
4. If SES fails, the error propagates to the state machine, which routes to `LogNotifyError` (a Pass state). The job is already `'complete'` — notification failure does not change job status.

---

### `release-credits-and-fail.ts` — ReleaseCreditsAndFail

**Input:** `{ jobId: string, userId: string, error: unknown }`

**Behavior:**
1. Call `releaseCredits({ db, jobId })` to restore the reserved credits.
2. Update the job: `status → 'failed'`, `error_message → serialized error`.
3. Attempt to send a failure notification email via SES:
   - Subject: "Your RaceDash render failed"
   - Body: includes project name and a note that credits have been restored.
   - SES failure is caught and logged — it must not throw.
4. Call `claimNextQueuedSlotToken({ db, userId })`. If a token is returned, call `states:SendTaskSuccess({ taskToken: token, output: '{}' })` to wake the next queued execution.

---

## Desktop UI Changes

### Export Tab — Cloud Render Option

The Export tab (`ExportTab.tsx`) gains a "Render destination" option group at the top of the form (below "Source Video", above "Output Resolution"):

```
┌──────────────────────────────────────────┐
│ Render Destination                       │
│ ┌─────────┐ ┌─────────┐                 │
│ │  Local  │ │  Cloud  │                 │
│ └─────────┘ └─────────┘                 │
└──────────────────────────────────────────┘
```

When **Local** is selected, the existing UI is shown unchanged (output path, render button, etc.).

When **Cloud** is selected:
- The "Output Path" section is hidden (cloud renders output to S3).
- A "Cloud Render" section appears showing:
  - **Estimated cost:** `{rcCost} RC` (computed via `computeCredits` using the selected resolution, frame rate, and source video info)
  - **Estimated upload time:** based on file size and a conservative upstream estimate (displayed as a warning for files > 500 MB: "Large file — upload may take X minutes on a typical connection")
  - **Credit balance:** `{balance} RC remaining` (fetched from `GET /api/credits/balance`)
  - A "Submit cloud render" button (disabled if insufficient credits)
- During upload, the section shows:
  - Upload progress bar with percentage
  - Upload speed (e.g., "12.4 MB/s")
  - Bytes uploaded / total (e.g., "245 MB / 1.2 GB")
  - Cancel button

Cloud render requires authentication. If the user is not signed in, the cloud option shows a "Sign in to use cloud rendering" prompt.

### Cloud Renders Tab — Full Wiring

The `CloudRendersList.tsx` component is rewritten to use real data:

**Reconciled `CloudRenderJob` interface:**
```ts
interface CloudRenderJob {
  id: string;
  projectName: string;
  sessionType: string;
  status: 'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed';
  config: {
    resolution: string;
    frameRate: string;
    renderMode: string;
  };
  rcCost: number | null;
  queuePosition: number | null;
  progress: number;                    // 0-1
  downloadExpiresAt: string | null;    // ISO 8601
  errorMessage: string | null;
  createdAt: string;
}
```

**Removed fields:** `storageUsedGb`, `storageLimitGb`, `youtubeUrl`, `outputUrl`, `timeRemaining`, `startedAt`.

**Section grouping:**
- **Active** — jobs in `'uploading'`, `'queued'`, `'rendering'`, or `'compositing'` status
- **Completed** — jobs in `'complete'` status
- **Failed** — jobs in `'failed'` status

**Job card states:**

| Status | Badge | Detail | Action |
|---|---|---|---|
| `uploading` | "Uploading" (blue) | Upload progress bar | Cancel |
| `queued` | "Queued" (yellow) | "Position {n} in queue" | — |
| `rendering` | "Rendering" (blue) | Progress bar (0-100%) | — |
| `compositing` | "Compositing" (blue) | Indeterminate progress bar | — |
| `complete` | "Complete" (green) | "Expires in {countdown}" | Download |
| `failed` | "Failed" (red) | Error message + "Credits restored" | — |

**Download expiry countdown** is computed client-side from `downloadExpiresAt`. Format: "Expires in X days Y hours" (days + hours granularity). When expired: "Expired" with disabled Download button.

**SSE connections:** The component opens an SSE connection for each active job on mount and closes them on unmount or when the job reaches a terminal state. A `useEffect` cleanup function handles this.

---

## IPC API Additions

New methods on `window.racedash`:

```ts
interface RacedashAPI {
  // ... existing methods ...

  // Cloud render
  cloudRender: {
    /** Create a cloud render job and reserve credits. */
    createJob(opts: CreateCloudJobOpts): Promise<CreateCloudJobResult>;

    /** Start multipart upload and get presigned URLs. */
    startUpload(jobId: string, opts: StartUploadOpts): Promise<StartUploadResult>;

    /** Upload a file part to a presigned URL. Main process handles the HTTP PUT. */
    uploadPart(url: string, filePath: string, partNumber: number, offset: number, size: number): Promise<UploadPartResult>;

    /** Complete multipart upload and start the pipeline. */
    completeUpload(jobId: string, parts: CompletedPart[]): Promise<CompleteUploadResult>;

    /** Cancel an in-progress upload (aborts multipart upload). */
    cancelUpload(jobId: string): Promise<void>;

    /** Get the SSE status URL for a job (renderer opens EventSource directly). */
    getStatusUrl(jobId: string): Promise<string>;

    /** Get a signed download URL for a completed job. */
    getDownloadUrl(jobId: string): Promise<DownloadUrlResult>;

    /** Download a completed render to a local path. */
    downloadRender(jobId: string, outputPath: string): Promise<void>;

    /** List all cloud render jobs. */
    listJobs(cursor?: string): Promise<ListJobsResult>;

    /** Compute estimated credit cost (pure, no network). */
    estimateCost(sourceVideo: VideoInfo, resolution: OutputResolution, frameRate: OutputFrameRate): number;
  };

  // Cloud render upload progress — main → renderer push
  onCloudUploadProgress(cb: (event: CloudUploadProgressEvent) => void): () => void;
  onCloudUploadComplete(cb: (event: { jobId: string }) => void): () => void;
  onCloudUploadError(cb: (event: { jobId: string; message: string }) => void): () => void;
}
```

**Supporting types:**

```ts
interface CreateCloudJobOpts {
  config: {
    resolution: OutputResolution;
    frameRate: OutputFrameRate;
    renderMode: RenderMode;
    overlayStyle: string;
    config: Record<string, unknown>;
  };
  sourceVideo: VideoInfo & { fileSizeBytes: number };
  projectName: string;
  sessionType: string;
}

interface CreateCloudJobResult {
  jobId: string;
  rcCost: number;
  uploadKey: string;
}

interface StartUploadOpts {
  partCount: number;
  partSize: number;
  contentType: string;
}

interface StartUploadResult {
  uploadId: string;
  presignedUrls: Array<{ partNumber: number; url: string }>;
}

interface UploadPartResult {
  partNumber: number;
  etag: string;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

interface CompleteUploadResult {
  jobId: string;
  status: 'queued';
  executionArn: string;
}

interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: string;
}

interface ListJobsResult {
  jobs: CloudRenderJob[];
  nextCursor: string | null;
}

interface CloudUploadProgressEvent {
  jobId: string;
  bytesUploaded: number;
  bytesTotal: number;
  uploadSpeed: number;              // bytes per second
  partNumber: number;
  totalParts: number;
}
```

---

## Success Criteria

1. **SC-1:** A user can select "Cloud" in the Export tab, see the estimated credit cost, and submit a cloud render. Credits are reserved at job creation.
2. **SC-2:** The joined video uploads to S3 via multipart upload with visible progress (percentage, speed, bytes). Upload can be cancelled.
3. **SC-3:** After upload completes, the job appears in the Cloud Renders tab with `'queued'` status and a queue position.
4. **SC-4:** The job progresses through `'rendering'` → `'compositing'` → `'complete'` as the Step Functions pipeline executes, and each transition is visible in the Cloud Renders tab via SSE.
5. **SC-5:** A completed job shows a "Download" button with a 7-day expiry countdown. Clicking "Download" saves the output locally.
6. **SC-6:** A failed job shows the error message and a "Credits restored" note. Credits are verified as released.
7. **SC-7:** Concurrent render limits are enforced: a Plus user's second job waits in `'queued'` until the first completes. A Pro user can have up to 3 concurrent renders.
8. **SC-8:** When an active render completes or fails, the next queued job is automatically promoted to `'rendering'` via slot signaling.
9. **SC-9:** The Remotion webhook correctly drives the `StartRenderOverlay` → `PrepareComposite` transition.
10. **SC-10:** The EventBridge relay webhook correctly triggers slot signaling for terminal states.
11. **SC-11:** Download URLs are CloudFront-signed and expire after 1 hour. The 7-day download window is enforced.
12. **SC-12:** SES emails are sent on render completion and failure. A notification failure does not affect job status.
13. **SC-13:** All webhook routes are excluded from Clerk auth middleware and use their own signature verification.

---

## User Stories

1. **As a Plus user,** I want to render my session overlay in the cloud so I do not have to leave my computer running for a long local render.
2. **As a user,** I want to see the estimated credit cost before submitting a cloud render so I can decide whether to proceed.
3. **As a user,** I want to see upload progress with speed and percentage so I know how long the upload will take.
4. **As a user,** I want to cancel an upload if I change my mind or realize I selected the wrong project.
5. **As a user,** I want to see my cloud render's status update in real time (queued → rendering → compositing → complete) without refreshing.
6. **As a user with a queued render,** I want to see my position in the queue so I know when my render will start.
7. **As a user,** I want to download my completed render within 7 days and see a countdown showing how much time I have left.
8. **As a user whose render failed,** I want to know that my credits have been restored so I can retry without losing credits.
9. **As a Pro user,** I want to submit up to 3 concurrent cloud renders so I can batch-process multiple sessions.
10. **As a user,** I want to receive an email when my render completes or fails so I do not have to keep the desktop app open.

---

## UI Mocks to Produce

Paper mockups using G. Gorzynski / GG initials in all placeholder data:

1. **Export tab — Cloud render option selected:** Shows the "Render destination" toggle set to Cloud, estimated cost ("3 RC"), credit balance, estimated upload time warning, and the "Submit cloud render" button.
2. **Export tab — Upload in progress:** Shows upload progress bar at 64%, "12.4 MB/s", "245 MB / 1.2 GB", and a Cancel button.
3. **Cloud Renders tab — Mixed states:** Shows one job queued ("Position 2 in queue"), one rendering (progress bar at 47%), one complete ("Expires in 6 days 12 hours" with Download button), and one failed ("Render pipeline timeout — Credits restored").
4. **Cloud Renders tab — Download expiry countdown:** Close-up of a completed job card showing the expiry countdown badge and Download button.
5. **Cloud Renders tab — Empty state:** "No cloud renders yet. Submit a render from the Export tab to get started."

---

## Happy Paths

### Happy Path 1: Submit and Complete a Cloud Render

1. G. Gorzynski opens a project and navigates to the Export tab.
2. GG selects "Cloud" as the render destination.
3. The estimated cost shows "3 RC". GG's balance shows "15 RC remaining".
4. GG clicks "Submit cloud render".
5. The desktop joins the chapter files locally (if multiple).
6. `POST /jobs` creates the job and reserves 3 RC. Balance drops to 12 RC.
7. `POST /jobs/:id/start-upload` returns presigned URLs for the multipart upload.
8. The upload progress bar appears: 0% → 25% → 50% → 75% → 100%.
9. `POST /jobs/:id/complete-upload` finalizes the upload and starts the pipeline.
10. The Cloud Renders tab shows the job as "Queued — Position 1 in queue".
11. WaitForSlot finds a free slot (no active renders). The job moves to "Rendering".
12. The progress bar advances as Remotion processes the overlay.
13. The Remotion webhook fires with `type: 'success'`. The job moves to "Compositing".
14. MediaConvert composites the overlay onto the source video.
15. FinaliseJob consumes the 3 RC, sets the job to "Complete", and sets `download_expires_at`.
16. GG receives an email: "Your RaceDash render is ready".
17. The Cloud Renders tab shows "Complete — Expires in 7 days 0 hours" with a Download button.
18. GG clicks "Download" and saves the output to their local machine.

### Happy Path 2: Queued Job Gets Slot After Active Render Completes

1. G. Gorzynski (Plus tier, 1 concurrent slot) has one render in `'rendering'` status.
2. GG submits a second cloud render.
3. The second job is created and upload completes. Step Functions starts.
4. WaitForSlot finds no free slot (`activeRenders = 1, slotLimit = 1`). The job shows "Queued — Position 1 in queue".
5. The first render completes. FinaliseJob calls `claimNextQueuedSlotToken`.
6. The queued job's task token is returned. FinaliseJob calls `SendTaskSuccess`.
7. The second job's WaitForSlot state resolves. GrantSlot sets it to `'rendering'`.
8. The Cloud Renders tab updates in real time via SSE.

### Happy Path 3: Render Failure with Credit Restoration

1. G. Gorzynski submits a cloud render. 5 RC are reserved.
2. The upload completes and the pipeline starts.
3. The Remotion render fails (e.g., composition error).
4. The Remotion webhook fires with `type: 'error'`. Step Functions routes to `ReleaseCreditsAndFail`.
5. `ReleaseCreditsAndFail` calls `releaseCredits` — 5 RC are restored.
6. The job status is set to `'failed'` with the error message.
7. GG receives an email: "Your RaceDash render failed".
8. The Cloud Renders tab shows the job as "Failed" with the error message and "Credits restored".

### Happy Path 4: Download Within 7-Day Window

1. G. Gorzynski's render completed 5 days ago.
2. GG opens the Cloud Renders tab. The job shows "Expires in 1 day 23 hours".
3. GG clicks "Download". `GET /jobs/:id/download` returns a signed CloudFront URL.
4. The file downloads to GG's chosen local path.
5. Two days later, GG tries again. The download window has expired. The button is disabled and shows "Expired".

---

## Security Considerations

1. **Presigned URL scoping:** Presigned URLs for multipart upload are scoped to the exact S3 key (`uploads/{jobId}/joined.mp4`) and expire after 1 hour. The job ID is a UUID, making key enumeration infeasible.
2. **CloudFront signed URLs:** Download URLs are signed using CloudFront key pairs with a 1-hour validity window. The private key PEM is stored as a CDK context parameter (injected via SSM), never in code. The 7-day download window is enforced server-side by checking `download_expires_at` before generating a signed URL.
3. **Remotion webhook signature:** The `/api/webhooks/remotion` endpoint validates the `X-Remotion-Signature` header using HMAC-SHA512. The secret is shared between the Remotion Lambda (via `REMOTION_WEBHOOK_SECRET` environment variable) and the API. The full request body is used as the HMAC input.
4. **EventBridge relay webhook secret:** The `/api/webhooks/render` endpoint validates the `x-webhook-secret` header using `crypto.timingSafeEqual` to prevent timing attacks. The secret is shared between the relay Lambda (via `WEBHOOK_SECRET` environment variable) and the API.
5. **Job ownership:** All job endpoints verify that `jobs.user_id` matches the authenticated user's ID. A user cannot access, download, or view status of another user's jobs.
6. **Webhook auth exclusions:** Both webhook routes (`/api/webhooks/remotion` and `/api/webhooks/render`) are added to the Clerk auth middleware exclusion list. They use their own signature verification instead.
7. **No secrets in renderer:** All S3, CloudFront, and SES operations happen server-side (API or Lambda). No AWS credentials, webhook secrets, or signing keys are exposed to the Electron renderer or preload bundles. The desktop communicates exclusively through authenticated API calls via IPC.
8. **Upload validation:** The API should validate that the uploaded file content type is `video/mp4` and that the file size does not exceed a reasonable maximum (e.g., 10 GB) to prevent abuse.

---

## Infrastructure

Lambda handler code lives in `infra/lambdas/` and is owned by this branch:

```
infra/lambdas/
  wait-for-slot/
    index.ts                           # handler entry point (exports { handler })
  grant-slot/
    index.ts
  start-render-overlay/
    index.ts
  prepare-composite/
    index.ts
  finalise-job/
    index.ts
  notify-user/
    index.ts
  release-credits-and-fail/
    index.ts
  shared/
    db.ts                              # Neon client factory (imports @racedash/db)
    sfn.ts                             # Step Functions client + SendTaskSuccess/Failure helpers
    s3.ts                              # S3 client helpers
    ses.ts                             # SES email sending helper
```

Each handler is in a `{name}/index.ts` directory, matching the CDK construct path `infra/lambdas/{name}/index.handler` defined by `cloud-infra`. CDK constructs that reference these handler paths are owned by `feature/cloud-infra`; this branch provides the actual handler code.

**Environment variables consumed by handlers** (injected by CDK constructs):

| Variable | Used by |
|---|---|
| `DATABASE_URL` | All handlers |
| `S3_UPLOAD_BUCKET` | PrepareComposite, FinaliseJob |
| `S3_RENDERS_BUCKET` | StartRenderOverlay, PrepareComposite, FinaliseJob |
| `REMOTION_SERVE_URL` | StartRenderOverlay |
| `REMOTION_FUNCTION_NAME` | StartRenderOverlay |
| `REMOTION_WEBHOOK_SECRET` | StartRenderOverlay |
| `REMOTION_WEBHOOK_URL` | StartRenderOverlay |
| `MEDIACONVERT_ROLE_ARN` | PrepareComposite |
| `CLOUDFRONT_DOMAIN` | FinaliseJob |
| `CLOUDFRONT_KEY_PAIR_ID` | FinaliseJob |
| `CLOUDFRONT_PRIVATE_KEY_PEM` | FinaliseJob |
| `SES_FROM_ADDRESS` | NotifyUser, ReleaseCreditsAndFail |

**API environment variables** (additional to those from `cloud-auth` and `cloud-licensing`):

| Variable | Purpose |
|---|---|
| `S3_UPLOAD_BUCKET` | Multipart upload operations |
| `S3_RENDERS_BUCKET` | Download URL generation |
| `STEP_FUNCTIONS_STATE_MACHINE_ARN` | Starting Step Functions executions |
| `REMOTION_WEBHOOK_SECRET` | Validating Remotion webhook signatures |
| `WEBHOOK_SECRET` | Validating EventBridge relay webhook |
| `CLOUDFRONT_DOMAIN` | Generating signed download URLs |
| `CLOUDFRONT_KEY_PAIR_ID` | Signing CloudFront URLs |
| `CLOUDFRONT_PRIVATE_KEY_PEM` | Signing CloudFront URLs |

---

## API Contracts

### Shared Types

```ts
// Job status enum — canonical source of truth
type JobStatus = 'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed';

// Job config stored in jobs.config JSONB column
interface JobConfig {
  resolution: OutputResolution;
  frameRate: OutputFrameRate;
  renderMode: RenderMode;
  overlayStyle: string;
  config: Record<string, unknown>;
  sourceVideo: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    fileSizeBytes: number;
  };
  projectName: string;
  sessionType: string;
}

// API error response shape (consistent with cloud-auth conventions)
interface ApiError {
  error: {
    code: string;                      // machine-readable error code
    message: string;                   // human-readable description
  };
}

// SSE event data shape
interface JobStatusEvent {
  status: JobStatus;
  progress: number;
  queuePosition: number | null;
  downloadExpiresAt: string | null;
  errorMessage: string | null;
}
```

### Request/Response Contracts

```ts
// POST /jobs
interface CreateJobRequest {
  config: {
    resolution: OutputResolution;
    frameRate: OutputFrameRate;
    renderMode: RenderMode;
    overlayStyle: string;
    config: Record<string, unknown>;
  };
  sourceVideo: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    fileSizeBytes: number;
  };
  projectName: string;
  sessionType: string;
}

interface CreateJobResponse {
  jobId: string;
  rcCost: number;
  uploadKey: string;
}

// POST /jobs/:id/start-upload
interface StartUploadRequest {
  partCount: number;
  partSize: number;
  contentType: string;
}

interface StartUploadResponse {
  uploadId: string;
  presignedUrls: Array<{
    partNumber: number;
    url: string;
  }>;
}

// POST /jobs/:id/complete-upload
interface CompleteUploadRequest {
  parts: Array<{
    partNumber: number;
    etag: string;
  }>;
}

interface CompleteUploadResponse {
  jobId: string;
  status: 'queued';
  executionArn: string;
}

// GET /jobs/:id/download
interface DownloadResponse {
  downloadUrl: string;
  expiresAt: string;
}

// GET /jobs
interface ListJobsResponse {
  jobs: Array<{
    id: string;
    status: JobStatus;
    config: JobConfig;
    projectName: string;
    sessionType: string;
    rcCost: number | null;
    queuePosition: number | null;
    downloadExpiresAt: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  nextCursor: string | null;
}

// POST /api/webhooks/remotion (incoming from Remotion Lambda)
interface RemotionWebhookPayload {
  type: 'success' | 'error' | 'timeout';
  renderId: string;
  expectedBucketOwner: string;
  customData: {
    taskToken: string;
    jobId: string;
  };
  outputUrl?: string;
  outputFile?: string;
  errors?: Array<{ message: string; stack?: string }>;
}

// POST /api/webhooks/render (incoming from EventBridge relay)
interface RenderWebhookPayload {
  detail: {
    executionArn: string;
    status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
    input: string;
  };
}
```

---

## Tests

### Specification Tests

#### `test/routes/jobs.test.ts`

**`POST /jobs`:**
1. Valid request with sufficient credits — creates job, reserves credits, returns `201` with `jobId`, `rcCost`, and `uploadKey`
2. Insufficient credits — returns `402` with `INSUFFICIENT_CREDITS` error, `available`, and `required` fields
3. No active license — returns `403`
4. Invalid request body (missing `sourceVideo`) — returns `400`
5. Unauthenticated request — returns `401`
6. Job `config` is stored as JSONB with all provided fields
7. Job `status` is `'uploading'` after creation
8. `rcCost` matches `computeCredits` output for the given source video dimensions

**`POST /jobs/:id/start-upload`:**
1. Valid request for own job in `'uploading'` status — returns `200` with `uploadId` and `presignedUrls`
2. Job not found — returns `404`
3. Job belongs to another user — returns `404`
4. Job not in `'uploading'` status — returns `409`
5. Returns correct number of presigned URLs matching `partCount`
6. Each presigned URL includes the correct S3 key prefix (`uploads/{jobId}/joined.mp4`)

**`POST /jobs/:id/complete-upload`:**
1. Valid request — completes multipart upload, transitions to `'queued'`, starts Step Functions, returns `200`
2. Job not found — returns `404`
3. Job belongs to another user — returns `404`
4. Job not in `'uploading'` status — returns `409`
5. `sfn_execution_arn` is stored on the job row
6. Step Functions input contains `{ jobId, userId }`

**`GET /jobs/:id/status`:**
1. Valid request — returns SSE stream with `Content-Type: text/event-stream`
2. First event contains current job status
3. Job not found — returns `404`
4. Job belongs to another user — returns `404`
5. Stream closes when job reaches `'complete'`
6. Stream closes when job reaches `'failed'`
7. Queued job includes `queuePosition` (1-indexed)
8. Failed job includes `errorMessage`
9. Complete job includes `downloadExpiresAt`

**`GET /jobs/:id/download`:**
1. Valid request for completed job within download window — returns `200` with `downloadUrl` and `expiresAt`
2. Job not found — returns `404`
3. Job belongs to another user — returns `404`
4. Job not in `'complete'` status — returns `409`
5. Download window expired — returns `410`
6. Download URL is a CloudFront signed URL containing the correct S3 key

**`GET /jobs`:**
1. Returns jobs for authenticated user, ordered by `created_at DESC`
2. Does not return jobs for other users
3. Pagination with cursor — returns correct page
4. Default limit is 20
5. Max limit is 100
6. Queued jobs include `queuePosition`
7. Empty result — returns empty array with `null` cursor

#### `test/routes/webhooks-remotion.test.ts`

1. Valid `success` webhook — calls `SendTaskSuccess`, returns `200`
2. Valid `error` webhook — calls `SendTaskFailure`, returns `200`
3. Valid `timeout` webhook — calls `SendTaskFailure`, returns `200`
4. Invalid `X-Remotion-Signature` — returns `401`, no Step Functions call
5. Missing `X-Remotion-Signature` header — returns `401`
6. `customData.taskToken` is passed to `SendTaskSuccess`/`SendTaskFailure`
7. HMAC-SHA512 verification uses `REMOTION_WEBHOOK_SECRET` and the raw request body

#### `test/routes/webhooks-render.test.ts`

1. Valid `SUCCEEDED` event — calls `claimNextQueuedSlotToken`, calls `SendTaskSuccess` if token returned, returns `200`
2. Valid `FAILED` event — calls `claimNextQueuedSlotToken`, returns `200`
3. No queued jobs — `claimNextQueuedSlotToken` returns `null`, no `SendTaskSuccess` call, returns `200`
4. Invalid `x-webhook-secret` — returns `401`
5. Missing `x-webhook-secret` header — returns `401`
6. Uses `timingSafeEqual` for secret comparison (verified via spy or implementation check)

#### `test/lambdas/wait-for-slot.test.ts`

1. Slot available — stores task token, calls `SendTaskSuccess` immediately
2. No slot available — stores task token, does not call `SendTaskSuccess`
3. Task token is stored in `jobs.slot_task_token`
4. Correct tier lookup for slot limit (Plus = 1, Pro = 3)
5. Active render count includes `'rendering'` and `'compositing'` statuses only

#### `test/lambdas/grant-slot.test.ts`

1. Updates job status to `'rendering'`
2. Updates `updated_at` timestamp

#### `test/lambdas/start-render-overlay.test.ts`

1. Calls `renderMediaOnLambda` with correct parameters
2. Webhook URL and secret passed in render call
3. Task token passed in `customData`
4. `renderId` stored in `jobs.remotion_render_id`
5. `render_task_token` stored on job row
6. Uses correct Remotion codec (`prores`)

#### `test/lambdas/prepare-composite.test.ts`

1. Updates job status to `'compositing'`
2. Returns MediaConvert config with correct input S3 keys
3. Bitrate selection: width >= 3840 → 50 Mbps
4. Bitrate selection: width >= 2560 → 30 Mbps
5. Bitrate selection: width < 2560 → 20 Mbps
6. Output S3 key is `renders/{jobId}/output.mp4`
7. MediaConvert role ARN is included in config

#### `test/lambdas/finalise-job.test.ts`

1. Calls `consumeCredits` with the job's ID
2. Sets job status to `'complete'`
3. Sets `download_expires_at` to approximately 7 days from now
4. Sets `output_s3_key` to `renders/{jobId}/output.mp4`
5. Deletes source upload from S3 (`uploads/{jobId}/joined.mp4`)
6. Calls `claimNextQueuedSlotToken({ db, userId })`
7. If token returned — calls `SendTaskSuccess` with the token
8. If no token — does not call `SendTaskSuccess`

#### `test/lambdas/notify-user.test.ts`

1. Sends SES email with correct subject ("Your RaceDash render is ready")
2. Sends to the user's email address (looked up from `users` table)
3. Email body includes project name
4. Uses `SES_FROM_ADDRESS` as sender

#### `test/lambdas/release-credits-and-fail.test.ts`

1. Calls `releaseCredits` with the job's ID
2. Sets job status to `'failed'`
3. Stores error message in `jobs.error_message`
4. Sends SES failure email (subject: "Your RaceDash render failed")
5. SES failure is caught and logged — does not throw
6. Calls `claimNextQueuedSlotToken({ db, userId })`
7. If token returned — calls `SendTaskSuccess` with the token
8. If no token — does not call `SendTaskSuccess`

#### `test/desktop/cloud-render.test.ts`

1. Export tab shows "Render destination" option group with Local and Cloud options
2. Selecting "Cloud" hides the output path section
3. Selecting "Cloud" shows estimated credit cost
4. "Submit cloud render" button is disabled when credits are insufficient
5. "Submit cloud render" button is disabled when user is not authenticated
6. Upload progress is displayed with percentage, speed, and bytes
7. Cancel button aborts the upload
8. Cloud Renders tab lists jobs grouped by Active and Completed sections
9. Queued jobs show queue position
10. Complete jobs show download button and expiry countdown
11. Failed jobs show error message and "Credits restored" text
12. Expired downloads show disabled Download button with "Expired" label

### Property-Based Tests

#### `test/properties/jobs.property.test.ts`

Use `fast-check` via Vitest.

1. **Credit conservation across job lifecycle:** For any job that completes, the total credits consumed equals the `rcCost` calculated at creation. For any job that fails, credits are fully released (no net credit change, accounting for pack expiry forfeiture).

2. **Queue position monotonicity:** For any set of N queued jobs belonging to the same user, queue positions form a contiguous sequence from 1 to N ordered by `created_at ASC`.

3. **Bitrate selection determinism:** For any `{ width, height }` combination, `PrepareComposite` always selects the same bitrate. The selection is a pure function of `width`.

4. **HMAC verification symmetry:** For any arbitrary payload and secret, signing with HMAC-SHA512 and verifying with the same secret succeeds. Verifying with a different secret fails.

5. **Presigned URL count matches part count:** For any `partCount` value (1-10000), `start-upload` returns exactly `partCount` presigned URLs with `partNumber` values from 1 to `partCount`.

### Mutation / Genetic Modification Tests

These define critical mutations that the test suite must catch.

1. **Mutation: Remove `timingSafeEqual` from render webhook.** Replace with `===` string comparison. The test must verify that `timingSafeEqual` is used (e.g., by spying on `crypto.timingSafeEqual`).

2. **Mutation: Remove HMAC-SHA512 verification from Remotion webhook.** Accept all requests regardless of signature. Tests must detect that unsigned requests are incorrectly accepted.

3. **Mutation: Skip `claimNextQueuedSlotToken` in `FinaliseJob`.** Tests must detect that the next queued job is never signaled after a render completes.

4. **Mutation: Remove `consumeCredits` call from `FinaliseJob`.** Tests must detect that credits remain in `'reserved'` status after job completion instead of being consumed.

5. **Mutation: Remove `releaseCredits` call from `ReleaseCreditsAndFail`.** Tests must detect that credits are not restored after a job failure.

6. **Mutation: Change slot check in `WaitForSlot` from `<` to `<=`.** Tests must detect that a user at exactly their slot limit is incorrectly given a slot (e.g., Plus user with 1 active render is allowed a second).

7. **Mutation: Remove job ownership check from `GET /jobs/:id/download`.** Tests must detect that a user can download another user's render.

8. **Mutation: Remove `download_expires_at` check from `GET /jobs/:id/download`.** Tests must detect that expired downloads are incorrectly served.

9. **Mutation: Change download window from 7 days to 1 day in `FinaliseJob`.** Tests that assert `download_expires_at` is approximately `now() + 7 days` must fail.

10. **Mutation: Remove SES error catch in `ReleaseCreditsAndFail`.** Tests must detect that an SES failure causes the Lambda to throw, which would prevent credit release from completing.

### Characterisation Tests

1. **MediaConvert config snapshot:** Given a fixed job config (1080p source, overlay style "classic"), snapshot the complete MediaConvert job configuration returned by `PrepareComposite`. Any change to the config structure (input keys, codec settings, container settings) will cause a regression failure.

2. **SSE event shape snapshot:** Snapshot the SSE event data for each job status (`uploading`, `queued`, `rendering`, `compositing`, `complete`, `failed`) to ensure the event shape is stable for the desktop client.

3. **Presigned URL structure snapshot:** Given a fixed job ID and part count, snapshot the structure of the `start-upload` response (number of URLs, part number range, URL prefix pattern). This catches unintended changes to the S3 key structure.

4. **SES email template snapshots:** Snapshot the subject and body template for both the completion email and the failure email. This catches unintended changes to email content.

5. **API error response snapshots:** Snapshot the exact error response for each error condition (402 insufficient credits, 403 no license, 409 wrong status, 410 expired download) to ensure error codes and messages are stable for the desktop client.

6. **CloudRenderJob interface snapshot:** Snapshot the TypeScript interface for `CloudRenderJob` (the reconciled version) to detect any accidental field additions, removals, or type changes that would break the desktop UI.

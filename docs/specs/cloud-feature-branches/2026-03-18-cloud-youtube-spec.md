# feature/cloud-youtube — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-youtube`
**Depends on:** `feature/cloud-db`, `feature/cloud-infra`, `feature/cloud-auth`, `feature/cloud-licensing`

---

## Overview

This branch delivers the direct-to-YouTube upload pipeline for RaceDash Cloud. It adds YouTube OAuth connect/disconnect endpoints to the API, a social upload endpoint that reserves credits and dispatches an SQS message, the SQS dispatch Lambda handler that launches a Fargate task, and the YouTube Fargate task handler that streams a completed render from S3 to YouTube's resumable upload API. On the desktop side it adds a YouTube account connect flow via BrowserWindow, a YouTube upload button on completed cloud renders, an upload metadata dialog, and real-time upload status tracking. YouTube uploads cost a flat 10 RC per upload.

---

## Scope

### In scope

- `apps/api` routes:
  - `GET /api/auth/youtube/connect` — initiates YouTube OAuth consent flow
  - `GET /api/auth/youtube/callback` — handles OAuth redirect, exchanges code for tokens, encrypts and stores in `connected_accounts`
  - `GET /api/auth/youtube/status` — returns whether the user has a connected YouTube account
  - `DELETE /api/auth/youtube/disconnect` — removes the user's YouTube connected account
  - `POST /api/jobs/:id/social-upload` — validates OAuth token, inserts `social_uploads` row, reserves 10 RC, dispatches SQS message
- Token encryption/decryption utility (`apps/api/src/lib/token-crypto.ts`) using AES-256-GCM with a key from the `TOKEN_ENCRYPTION_KEY` environment variable
- SQS dispatch Lambda handler code (`infra/lambdas/social-dispatch/index.ts`) — reads `platform` field, launches the YouTube Fargate task via ECS `RunTask`
- YouTube upload Fargate task handler code (`infra/tasks/youtube-upload/index.ts`) — streams S3 render output to YouTube resumable upload API; handles token refresh on 401; calls `consumeCredits` on success, `releaseCredits` on failure; updates `social_uploads.status`; sends SES failure notification email on error
- Desktop: YouTube connect/disconnect flow via BrowserWindow, upload button on completed cloud renders, upload metadata dialog, upload status tracking in the Cloud Renders tab
- IPC additions for YouTube connect, disconnect, upload, and status operations
- Preload script additions to expose new YouTube IPC channels

### Out of scope

- CDK constructs for ECS Fargate cluster, SQS queue, task definition, SQS dispatch Lambda construct (owned by `cloud-infra`)
- Database schema and migrations — `social_uploads`, `connected_accounts` tables (owned by `cloud-db`)
- Credit helpers — `reserveCredits`, `releaseCredits`, `consumeCredits` (owned by `cloud-db`)
- Cloud rendering pipeline and job management (owned by `cloud-rendering`)
- Clerk authentication setup and `apps/api` scaffold (owned by `cloud-auth`)
- License tier validation and credit balance endpoints (owned by `cloud-licensing`)
- Vimeo or other social platform integrations (deferred — epic mentions Vimeo as an extension point but only YouTube is in scope for launch)
- Dockerfile for the Fargate task image (owned by `cloud-infra`; this branch provides the handler code that gets built into the image)

---

## Functional Requirements

### OAuth Connect

1. **FR-1:** `GET /api/auth/youtube/connect` must generate a YouTube OAuth 2.0 authorization URL with `scope=https://www.googleapis.com/auth/youtube.upload`, a cryptographically random `state` parameter, the configured `YOUTUBE_CLIENT_ID`, and `redirect_uri` pointing to `/api/auth/youtube/callback`. The `state` parameter must be stored server-side (in a short-lived record or signed JWT) and associated with the authenticated user ID.

2. **FR-2:** `GET /api/auth/youtube/connect` must validate that the user has an active license (Plus or Pro) before generating the OAuth URL. Users without an active license must receive `403 Forbidden` with error code `LICENSE_REQUIRED`.

3. **FR-3:** The `GET /api/auth/youtube/callback` route must be excluded from the Clerk auth middleware (it is an OAuth redirect from Google, not an authenticated API call). This route must be added to the middleware exclusion list. The full exclusion list after all branches land is: `/api/health`, `/api/webhooks/clerk` (cloud-auth), `/api/webhooks/stripe` (cloud-licensing), `/api/webhooks/remotion`, `/api/webhooks/render` (cloud-rendering), and `/api/auth/youtube/callback` (this branch). Each branch adds its own exclusions additively.

4. **FR-4:** `GET /api/auth/youtube/callback` must:
   a. Validate the `state` parameter against the stored value to prevent CSRF attacks. Invalid or missing state must return `400 Bad Request`.
   b. Exchange the authorization `code` for an access token and refresh token using the YouTube OAuth token endpoint.
   c. Fetch the YouTube channel name using the YouTube Data API (`channels.list?part=snippet&mine=true`) with the new access token.
   d. Encrypt both tokens using AES-256-GCM with the `TOKEN_ENCRYPTION_KEY` environment variable.
   e. Upsert the `connected_accounts` row: if a row exists for `(user_id, 'youtube')`, update it; otherwise insert a new row. Store `platform='youtube'`, `account_name` (channel name), `account_id` (channel ID), encrypted `access_token`, encrypted `refresh_token`, and `connected_at`.
   f. Redirect to a success page (`/auth/youtube/success`) that the desktop BrowserWindow detects and closes.

5. **FR-5:** `GET /api/auth/youtube/status` must return whether the authenticated user has a connected YouTube account. If connected, it must include `accountName` (channel name) and `connectedAt`. It must NOT return the access or refresh tokens.

6. **FR-6:** `DELETE /api/auth/youtube/disconnect` must delete the user's `connected_accounts` row for `platform='youtube'`. If no YouTube account is connected, it must return `404 Not Found`.

### Social Upload

7. **FR-7:** `POST /api/jobs/:id/social-upload` must:
   a. Validate that the authenticated user owns the job.
   b. Validate that the job status is `'complete'` (only completed renders can be uploaded).
   c. Validate that the user has a connected YouTube account in `connected_accounts`.
   d. Validate that the user has an active license.
   e. Validate the request body: `platform` must be `'youtube'`, `metadata` must include `title` (string, 1-100 chars), `description` (string, 0-5000 chars), and `privacy` (`'public' | 'unlisted' | 'private'`).
   f. Within a single DB transaction: insert a `social_uploads` row with `status: 'queued'` and `rc_cost: 10`, then call `reserveCredits(db, userId, \`su_${socialUploadId}\`, 10)`. If `reserveCredits` throws (insufficient credits), the transaction rolls back (no `social_uploads` row is created) and the endpoint returns `402 Payment Required` with error code `INSUFFICIENT_CREDITS`.
   g. After the transaction commits, send an SQS message to the social upload queue with the payload (see SQS Message Payload section).
   i. Return `201 Created` with the `socialUploadId` and initial status.

8. **FR-8:** `POST /api/jobs/:id/social-upload` must prevent duplicate uploads: if a `social_uploads` row already exists for the same `job_id` and `platform='youtube'` with `status` in `('queued', 'uploading', 'processing', 'live')`, it must return `409 Conflict`.

### Token Encryption/Decryption

9. **FR-9:** The `encryptToken(plaintext: string): string` function must encrypt using AES-256-GCM with a random 12-byte IV. The output format must be `${iv_hex}:${authTag_hex}:${ciphertext_hex}`. The encryption key is derived from the `TOKEN_ENCRYPTION_KEY` environment variable (32-byte hex string).

10. **FR-10:** The `decryptToken(encrypted: string): string` function must parse the `iv:authTag:ciphertext` format, verify the auth tag, and return the plaintext. If decryption fails (tampered data, wrong key), it must throw an error.

### SQS Dispatch Lambda

11. **FR-11:** The SQS dispatch Lambda handler (`infra/lambdas/social-dispatch/index.ts`) must:
    a. Parse the SQS message body as JSON.
    b. Read the `platform` field from the message payload.
    c. If `platform === 'youtube'`, call ECS `RunTask` with the YouTube upload task definition, passing the full message payload as a container environment variable (`UPLOAD_PAYLOAD`).
    d. If `platform` is unrecognised, log an error and let the message go to the DLQ (do not delete from queue).

12. **FR-12:** The dispatch Lambda must update `social_uploads.status` to `'uploading'` after successfully launching the Fargate task.

### YouTube Fargate Task Handler

13. **FR-13:** The YouTube Fargate task handler (`infra/tasks/youtube-upload/index.ts`) must:
    a. Parse the `UPLOAD_PAYLOAD` environment variable as the SQS message payload.
    b. Look up the user's YouTube connected account in `connected_accounts`.
    c. Decrypt the stored `access_token` and `refresh_token` using `decryptToken`.
    d. Determine the file size by calling S3 `HeadObject` on the render output key (`renders/{jobId}/output.mp4`).
    e. Initiate a YouTube resumable upload session using the YouTube Data API v3 (`POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable`).
    f. Stream the S3 object directly to the YouTube resumable upload endpoint in 8 MB chunks (no local disk write).
    g. Update `social_uploads.status` to `'processing'` once the upload bytes have been fully sent.
    h. Poll YouTube's video processing status (the `processing` → `processed` transition) with exponential backoff (initial 10s, max 60s, up to 30 minutes).
    i. On success: update `social_uploads.status` to `'live'`, store `platform_url` (YouTube watch URL), update `social_uploads.updated_at`, call `consumeCredits(db, \`su_${socialUploadId}\`)`, update `connected_accounts.last_used_at`.
    j. On failure: update `social_uploads.status` to `'failed'`, store `error_message`, call `releaseCredits(db, \`su_${socialUploadId}\`)`, send SES failure notification email to the user.

14. **FR-14:** Token refresh on 401: if any YouTube API call returns HTTP 401, the Fargate task must:
    a. Use the stored refresh token to request a new access token from `https://oauth2.googleapis.com/token`.
    b. Encrypt the new access token with `encryptToken`.
    c. Update `connected_accounts.access_token` with the new encrypted token.
    d. Retry the failed API call once with the new access token.
    e. If the refresh also fails (e.g., user revoked access), fail the upload with `error_message: 'YouTube access revoked. Please reconnect your YouTube account in Settings.'`.

15. **FR-15:** The Fargate task must set the YouTube video metadata from the SQS message payload: `title`, `description`, `privacyStatus`. The video `categoryId` must default to `'17'` (Sports).

### Desktop UI

16. **FR-16:** The Account tab (or a "Connected Accounts" subsection within it) must display the user's YouTube connection status:
    - **Connected:** Show the YouTube channel name, a "Connected" badge, and a "Disconnect" button.
    - **Not connected:** Show a "Connect YouTube" button that initiates the OAuth flow.

17. **FR-17:** The "Connect YouTube" button must open a BrowserWindow pointing to `GET /api/auth/youtube/connect`. The window must use `nodeIntegration: false`, `sandbox: true`, and a dedicated session partition (`persist:youtube-oauth`). The window must detect the redirect to `/auth/youtube/success` and close itself, then notify the renderer that the connection succeeded.

18. **FR-18:** The completed job row in `CloudRendersList.tsx` must show a "Upload to YouTube" button (replacing the current stub that only shows when `youtubeUrl` is set). The button must be visible on all completed jobs where the user has a connected YouTube account and no active/live upload exists for that job.

19. **FR-19:** Clicking "Upload to YouTube" must open a dialog with fields for:
    - Title (pre-filled with `{projectName} - {sessionType}`, max 100 chars)
    - Description (empty, max 5000 chars)
    - Privacy (`'public'`, `'unlisted'`, `'private'` — default `'unlisted'`)
    - Credit cost display: "This upload will use 10 RC"
    - Current credit balance display
    - "Upload" and "Cancel" buttons

20. **FR-20:** After the user confirms the upload, the renderer must call `window.racedash.youtube.upload(jobId, metadata)` and the job row must update to show upload status: `'queued'` -> `'uploading'` -> `'processing'` -> `'live'` or `'failed'`.

21. **FR-21:** When upload status is `'live'`, the job row must show a "View on YouTube" button that opens the `platform_url` in the user's default browser.

22. **FR-22:** When upload status is `'failed'`, the job row must show the error message and a "Retry" button. The "Retry" button opens the upload dialog again (a new upload, not a resume). The credit display must note "10 RC refunded" for the failed upload.

23. **FR-23:** Upload status must be polled by the desktop app via `GET /api/jobs/:id/social-uploads` (returns all social upload records for a job). Polling interval: every 10 seconds while any upload is in `'queued'` or `'uploading'` or `'processing'` state. Polling stops when all uploads reach a terminal state (`'live'` or `'failed'`).

---

## Non-Functional Requirements

1. **NFR-1:** The YouTube Fargate task must complete the upload phase within 15 minutes. YouTube processing polling (FR-13h) runs for up to 30 additional minutes after upload completes. The total Fargate task timeout is 45 minutes. The SQS visibility timeout must be set accordingly (2700 seconds). Tasks exceeding these durations must fail gracefully with an appropriate error message.

2. **NFR-2:** OAuth tokens (access and refresh) must be encrypted at rest in the database using AES-256-GCM. Tokens must never be logged, included in API responses (except the callback internal flow), or stored in plain text.

3. **NFR-3:** The YouTube Fargate task must stream the S3 object to YouTube without writing to local disk. The 1 GB Fargate task memory must be sufficient for the 8 MB upload buffer plus runtime overhead.

4. **NFR-4:** The SQS dispatch Lambda must complete within 30 seconds (its configured timeout). Launching a Fargate task via `RunTask` typically takes 1-3 seconds.

5. **NFR-5:** The OAuth state parameter must expire after 10 minutes to limit the CSRF attack window.

6. **NFR-6:** The `POST /api/jobs/:id/social-upload` endpoint must respond within 3 seconds (credit reservation + SQS send).

7. **NFR-7:** All new API endpoints must follow the error response conventions established by `cloud-auth` (`ApiError` shape with `error.code` and `error.message`).

8. **NFR-8:** All exported functions and interfaces must have complete TypeScript type signatures (no `any` types).

9. **NFR-9:** Failed uploads must release reserved credits within the Fargate task execution. If the Fargate task crashes without releasing credits, the SQS DLQ handler (future work) can be used to reconcile. For launch, an admin dashboard query can identify orphaned reservations.

---

## API Endpoints

### `GET /api/auth/youtube/connect`

Generates a YouTube OAuth 2.0 authorization URL and redirects the user to Google's consent screen.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `302 Found` (redirect to Google OAuth consent) |
| Errors | `401 Unauthorized`, `403 LICENSE_REQUIRED` |

The `state` parameter encodes the user ID in a signed JWT (signed with `TOKEN_ENCRYPTION_KEY`, 10-minute expiry) to avoid server-side state storage.

### `GET /api/auth/youtube/callback`

Handles the OAuth redirect from Google. Excluded from Clerk auth middleware.

| Field | Value |
|---|---|
| Auth | None (OAuth redirect) |
| Query params | `code`, `state` |
| Response | `302 Found` (redirect to `/auth/youtube/success`) |
| Errors | `400 INVALID_OAUTH_STATE`, `400 OAUTH_TOKEN_EXCHANGE_FAILED` |

### `GET /api/auth/youtube/status`

Returns the user's YouTube connection status.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized` |

**Response body (connected):**

```json
{
  "connected": true,
  "account": {
    "accountName": "G. Gorzynski Racing",
    "accountId": "UC...",
    "connectedAt": "2026-03-18T12:00:00.000Z"
  }
}
```

**Response body (not connected):**

```json
{
  "connected": false,
  "account": null
}
```

### `DELETE /api/auth/youtube/disconnect`

Removes the user's YouTube connected account.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized`, `404 YOUTUBE_NOT_CONNECTED` |

**Response body:**

```json
{
  "disconnected": true
}
```

### `POST /api/jobs/:id/social-upload`

Creates a YouTube upload job, reserves credits, and dispatches to SQS.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Request | JSON body |
| Response | `201 Created` |
| Errors | `400 INVALID_REQUEST`, `401 Unauthorized`, `402 INSUFFICIENT_CREDITS`, `403 LICENSE_REQUIRED`, `403 JOB_NOT_OWNED`, `404 JOB_NOT_FOUND`, `404 YOUTUBE_NOT_CONNECTED`, `409 UPLOAD_ALREADY_EXISTS`, `422 JOB_NOT_COMPLETE` |

**Request body:**

```json
{
  "platform": "youtube",
  "metadata": {
    "title": "2026 Club100 Rd.3 - Race",
    "description": "Full race onboard with live timing overlay",
    "privacy": "unlisted"
  }
}
```

**Response body:**

```json
{
  "socialUploadId": "uuid",
  "status": "queued",
  "platform": "youtube",
  "rcCost": 10
}
```

### `GET /api/jobs/:id/social-uploads`

Returns all social upload records for a job. Used by the desktop to poll upload status.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized`, `403 JOB_NOT_OWNED`, `404 JOB_NOT_FOUND` |

**Response body:**

```json
{
  "uploads": [
    {
      "id": "uuid",
      "platform": "youtube",
      "status": "live",
      "metadata": { "title": "...", "description": "...", "privacy": "unlisted" },
      "rcCost": 10,
      "platformUrl": "https://youtube.com/watch?v=xxx",
      "errorMessage": null,
      "createdAt": "2026-03-18T12:00:00.000Z",
      "updatedAt": "2026-03-18T12:05:00.000Z"
    }
  ]
}
```

---

## SQS Dispatch Lambda

**File:** `infra/lambdas/social-dispatch/index.ts`

The SQS dispatch Lambda is triggered by the `racedash-social-uploads-{env}` SQS queue. The CDK construct (queue trigger, IAM) is owned by `cloud-infra`; this branch provides the handler code.

### Behavior

1. Receive SQS event (batch size 1 — configured in CDK).
2. Parse the message body as `SocialUploadPayload`.
3. Read `platform` field.
4. If `platform === 'youtube'`:
   a. Call ECS `RunTask` with the YouTube upload task definition ARN (from `YOUTUBE_TASK_DEFINITION_ARN` env var), passing `UPLOAD_PAYLOAD` as a container override environment variable containing the full serialized message payload.
   b. Update `social_uploads.status` to `'uploading'` in the database.
   c. Delete the message from the queue (implicit — successful Lambda return).
5. If `platform` is not `'youtube'`:
   a. Log an error: `Unsupported platform: ${platform}`.
   b. Throw an error to let the message retry and eventually move to the DLQ.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon direct (non-pooled) connection string |
| `YOUTUBE_TASK_DEFINITION_ARN` | ARN of the YouTube upload ECS task definition |
| `ECS_CLUSTER_ARN` | ARN of the Fargate cluster |
| `TASK_SUBNETS` | Comma-separated subnet IDs for Fargate task networking |
| `TASK_SECURITY_GROUP` | Security group ID for Fargate task |

---

## Fargate Task Handler

**File:** `infra/tasks/youtube-upload/index.ts`

The YouTube upload Fargate task handler streams a completed render from S3 to YouTube's resumable upload API. The CDK task definition (memory, CPU, IAM, ECR image) is owned by `cloud-infra`; this branch provides the handler code.

### Upload Flow

```
1. Parse UPLOAD_PAYLOAD env var → SocialUploadPayload
2. Look up connected_accounts row for (userId, 'youtube')
3. Decrypt access_token and refresh_token
4. HeadObject on S3 to get file size
5. POST /upload/youtube/v3/videos?uploadType=resumable
   → Headers: Authorization, Content-Type, Content-Length, X-Upload-Content-Length
   → Body: { snippet: { title, description, categoryId }, status: { privacyStatus } }
   → Response: Location header with resumable upload URI
6. Stream S3 GetObject body → PUT to resumable upload URI in 8 MB chunks
   → Track bytes uploaded for progress
7. On 401 at any step → refresh token (FR-14) → retry once
8. On complete upload response:
   → Extract video ID from response
   → Update social_uploads.status = 'processing'
9. Poll GET /youtube/v3/videos?id={videoId}&part=status
   → Check status.uploadStatus === 'processed'
   → Exponential backoff: 10s, 20s, 40s, 60s, 60s, ... (max 30 minutes total)
10. On 'processed':
    → social_uploads.status = 'live'
    → social_uploads.platform_url = 'https://youtube.com/watch?v={videoId}'
    → consumeCredits(db, reservationKey)
    → connected_accounts.last_used_at = now()
11. On failure at any step:
    → social_uploads.status = 'failed'
    → social_uploads.error_message = descriptive message
    → releaseCredits(db, reservationKey)
    → Send SES failure email to user
    → Exit with code 0 (prevent ECS retry — SQS DLQ handles retries)
```

### Error Handling

| Error | Action |
|---|---|
| YouTube 401 (expired token) | Refresh token, retry once |
| YouTube 401 after refresh (revoked) | Fail with "YouTube access revoked. Please reconnect your YouTube account in Settings." |
| YouTube 403 (quota exceeded) | Fail with "YouTube API quota exceeded. Please try again tomorrow." |
| YouTube 400 (invalid metadata) | Fail with "Invalid video metadata: {error detail}" |
| S3 GetObject error | Fail with "Render output not found. The download window may have expired." |
| Upload timeout (>15 min) | Fail with "Upload timed out. Please try again with a smaller file." |
| Processing timeout (>30 min) | Fail with "YouTube processing timed out. The video may still be processing — check your YouTube Studio." |
| Network error during upload | Fail with "Network error during upload. Please try again." |

### Environment Variables

| Variable | Description |
|---|---|
| `UPLOAD_PAYLOAD` | JSON-serialized `SocialUploadPayload` (injected as container override) |
| `DATABASE_URL` | Neon direct (non-pooled) connection string |
| `S3_RENDERS_BUCKET` | S3 bucket containing render outputs |
| `YOUTUBE_CLIENT_ID` | YouTube OAuth client ID (for token refresh) |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth client secret (for token refresh) |
| `SES_FROM_ADDRESS` | Sender email for failure notifications |
| `TOKEN_ENCRYPTION_KEY` | AES-256 key for decrypting stored OAuth tokens |

---

## Desktop UI Changes

### Account Tab — Connected Accounts

**File:** `apps/desktop/src/renderer/src/components/app/AccountDetails.tsx` (modified)

A "Connected Accounts" subsection is added below the existing subscription section:

```tsx
// Connected state
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <YoutubeIcon className="h-4 w-4 text-red-500" />
    <span className="text-sm">G. Gorzynski Racing</span>
    <Badge variant="outline" className="text-[10px]">Connected</Badge>
  </div>
  <Button variant="ghost" size="sm" className="text-xs text-destructive">
    Disconnect
  </Button>
</div>

// Not connected state
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <YoutubeIcon className="h-4 w-4 text-muted-foreground" />
    <span className="text-sm text-muted-foreground">YouTube</span>
  </div>
  <Button variant="outline" size="sm" className="text-xs">
    Connect
  </Button>
</div>
```

### CloudRendersList.tsx — Upload Button and Status

**File:** `apps/desktop/src/renderer/src/components/app/CloudRendersList.tsx` (modified)

1. The `CloudRenderJob` interface gains an `uploads` field:
   ```ts
   interface CloudRenderJob {
     // ... existing fields ...
     uploads?: SocialUploadStatus[]
   }

   interface SocialUploadStatus {
     id: string
     platform: 'youtube'
     status: 'queued' | 'uploading' | 'processing' | 'live' | 'failed'
     platformUrl?: string
     errorMessage?: string
   }
   ```

2. The completed job actions section (lines 111-118) is updated:
   ```tsx
   {job.status === 'complete' && (
     <div className="mt-1 flex gap-2">
       {job.downloadExpiresAt && new Date(job.downloadExpiresAt) > new Date() && (
         <Button variant="outline" size="sm" className="text-xs">Download</Button>
       )}
       {youtubeUpload?.status === 'live' && (
         <Button variant="outline" size="sm" className="text-xs"
           onClick={() => window.open(youtubeUpload.platformUrl)}>
           View on YouTube
         </Button>
       )}
       {youtubeUpload?.status === 'failed' && (
         <div className="flex flex-col gap-1">
           <p className="text-[10px] text-destructive">{youtubeUpload.errorMessage}</p>
           <div className="flex gap-2">
             <Button variant="outline" size="sm" className="text-xs"
               onClick={openUploadDialog}>
               Retry Upload
             </Button>
             <span className="text-[10px] text-muted-foreground">10 RC refunded</span>
           </div>
         </div>
       )}
       {youtubeUpload && ['queued', 'uploading', 'processing'].includes(youtubeUpload.status) && (
         <div className="flex items-center gap-2">
           <Spinner className="h-3 w-3" />
           <span className="text-[10px] text-muted-foreground capitalize">
             {youtubeUpload.status === 'queued' ? 'Queued...' :
              youtubeUpload.status === 'uploading' ? 'Uploading to YouTube...' :
              'Processing on YouTube...'}
           </span>
         </div>
       )}
       {!youtubeUpload && youtubeConnected && (
         <Button variant="outline" size="sm" className="text-xs"
           onClick={openUploadDialog}>
           Upload to YouTube
         </Button>
       )}
     </div>
   )}
   ```

### YouTube Upload Dialog

**File:** `apps/desktop/src/renderer/src/components/app/YouTubeUploadDialog.tsx` (new)

A dialog component for entering YouTube upload metadata:

- Title input (pre-filled with `{projectName} - {sessionType}`, max 100 chars)
- Description textarea (empty, max 5000 chars)
- Privacy select: Public, Unlisted (default), Private
- Credit cost: "This upload will use 10 RC"
- Current balance: "Your balance: {balance} RC"
- Insufficient credits warning (if balance < 10): "You need at least 10 RC to upload. Top up credits in the Account tab."
- Upload button (disabled if insufficient credits or title is empty)
- Cancel button

---

## IPC API Additions

New methods added to the `RacedashAPI` interface in `apps/desktop/src/types/ipc.ts`:

```ts
// ── YouTube types ──────────────────────────────────────────────────────────

export interface YouTubeAccount {
  accountName: string
  accountId: string
  connectedAt: string // ISO 8601
}

export interface YouTubeConnectionStatus {
  connected: boolean
  account: YouTubeAccount | null
}

export interface YouTubeUploadMetadata {
  title: string
  description: string
  privacy: 'public' | 'unlisted' | 'private'
}

export interface YouTubeUploadResult {
  socialUploadId: string
  status: 'queued'
  rcCost: number
}

export interface SocialUploadStatus {
  id: string
  platform: 'youtube'
  status: 'queued' | 'uploading' | 'processing' | 'live' | 'failed'
  metadata: YouTubeUploadMetadata
  rcCost: number
  platformUrl: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}
```

New methods on `RacedashAPI`:

```ts
export interface RacedashAPI {
  // ... existing methods ...

  // YouTube
  youtube: {
    /** Open YouTube OAuth consent window, return connection status on success. */
    connect(): Promise<YouTubeConnectionStatus>
    /** Remove YouTube connected account. */
    disconnect(): Promise<void>
    /** Get current YouTube connection status. */
    getStatus(): Promise<YouTubeConnectionStatus>
    /** Upload a completed render to YouTube. */
    upload(jobId: string, metadata: YouTubeUploadMetadata): Promise<YouTubeUploadResult>
    /** Get social upload statuses for a job. */
    getUploads(jobId: string): Promise<SocialUploadStatus[]>
  }
}
```

**IPC channels:**

| Channel | Direction | Purpose |
|---|---|---|
| `racedash:youtube:connect` | renderer -> main | Initiate YouTube OAuth flow |
| `racedash:youtube:disconnect` | renderer -> main | Remove YouTube connection |
| `racedash:youtube:getStatus` | renderer -> main | Check YouTube connection status |
| `racedash:youtube:upload` | renderer -> main | Submit YouTube upload |
| `racedash:youtube:getUploads` | renderer -> main | Poll upload statuses for a job |

---

## Success Criteria

1. **SC-1:** A user can connect their YouTube account from the Account tab, see their channel name displayed with a "Connected" badge, and disconnect the account.
2. **SC-2:** A user with a connected YouTube account and sufficient credits (>=10 RC) can click "Upload to YouTube" on a completed cloud render, fill in metadata, and see the upload progress through `queued` -> `uploading` -> `processing` -> `live`.
3. **SC-3:** After a successful upload, the job row shows a "View on YouTube" button that opens the correct YouTube URL.
4. **SC-4:** When an upload fails, credits (10 RC) are released back to the user's balance, the error message is displayed, and the user can retry with a new upload.
5. **SC-5:** Token refresh works transparently: if the YouTube access token expires during an upload, the Fargate task refreshes it and completes the upload without user intervention.
6. **SC-6:** If the user revokes YouTube access (via Google account settings), the upload fails with a clear message instructing the user to reconnect.
7. **SC-7:** A user without an active license cannot connect YouTube (receives `403`).
8. **SC-8:** A user with insufficient credits sees the warning in the upload dialog and cannot submit the upload.
9. **SC-9:** Duplicate uploads for the same job are prevented (returns `409`).
10. **SC-10:** OAuth tokens are encrypted at rest in the database and never appear in API responses or logs.

---

## User Stories

1. **US-1 (End user — connect YouTube):** As a RaceDash Cloud subscriber, I want to connect my YouTube account so that I can upload my rendered race videos directly from the app.
2. **US-2 (End user — upload to YouTube):** As a user with a completed cloud render, I want to upload it to YouTube with a title, description, and privacy setting so that I can share my race footage without downloading and re-uploading manually.
3. **US-3 (End user — track upload):** As a user who has submitted a YouTube upload, I want to see the upload progress (queued, uploading, processing, live) so that I know when my video is ready.
4. **US-4 (End user — view on YouTube):** As a user whose upload has completed, I want a "View on YouTube" button so that I can quickly check my published video.
5. **US-5 (End user — failed upload):** As a user whose upload failed, I want to see a clear error message and be able to retry so that I don't lose my progress or credits.
6. **US-6 (End user — disconnect YouTube):** As a user who no longer wants YouTube integration, I want to disconnect my account so that my tokens are removed.
7. **US-7 (End user — credit awareness):** As a user considering a YouTube upload, I want to see the credit cost (10 RC) and my current balance before confirming so that I can make an informed decision.
8. **US-8 (End user — revoked access):** As a user who revoked YouTube access through Google, I want a clear error message telling me to reconnect so that I understand what went wrong.

---

## UI Mocks to Produce

The following Paper mockups should be created before implementation begins. All placeholder names must use "G. Gorzynski" with "GG" initials.

1. **Account tab — YouTube connected:** Shows "Connected Accounts" section with YouTube icon, "G. Gorzynski Racing" channel name, "Connected" badge, and "Disconnect" button.
2. **Account tab — YouTube not connected:** Shows "Connected Accounts" section with greyed-out YouTube icon and "Connect" button.
3. **CloudRendersList — completed job with YouTube button:** Shows a completed job row with "Download" and "Upload to YouTube" buttons side by side.
4. **YouTube upload dialog:** Modal dialog with title, description, privacy fields, credit cost display ("This upload will use 10 RC"), balance display ("Your balance: 85 RC"), and Upload/Cancel buttons.
5. **YouTube upload dialog — insufficient credits:** Same dialog but with a warning banner ("You need at least 10 RC to upload. Top up credits in the Account tab.") and disabled Upload button.
6. **CloudRendersList — upload in progress:** Job row showing spinner with "Uploading to YouTube..." status text.
7. **CloudRendersList — upload live:** Job row showing "View on YouTube" button.
8. **CloudRendersList — upload failed:** Job row showing error message in red, "Retry Upload" button, and "10 RC refunded" note.
9. **YouTube OAuth BrowserWindow:** Google's OAuth consent screen in a 500x700 modal window titled "Connect YouTube".

---

## Happy Paths

### HP-1: Connect YouTube Account

1. User navigates to the Account tab.
2. Under "Connected Accounts", YouTube shows as "Not connected" with a "Connect" button.
3. User clicks "Connect".
4. A BrowserWindow opens showing Google's OAuth consent screen.
5. User signs in to Google and authorises RaceDash to upload videos.
6. Google redirects to `/api/auth/youtube/callback`.
7. API exchanges the code for tokens, encrypts them, stores in `connected_accounts`.
8. API redirects to `/auth/youtube/success`.
9. BrowserWindow detects the success page and closes.
10. Account tab updates to show the YouTube channel name with a "Connected" badge.

### HP-2: Upload to YouTube

1. User has a completed cloud render in the Cloud Renders tab and a connected YouTube account.
2. User clicks "Upload to YouTube" on the completed job row.
3. Upload dialog opens with the title pre-filled as "{projectName} - {sessionType}".
4. User edits the title and description, selects privacy "unlisted".
5. Dialog shows "This upload will use 10 RC" and "Your balance: 85 RC".
6. User clicks "Upload".
7. Renderer calls `window.racedash.youtube.upload(jobId, metadata)`.
8. API reserves 10 RC, inserts `social_uploads` row, dispatches SQS message.
9. Job row updates to show "Queued..." spinner.
10. SQS dispatch Lambda launches Fargate task; status becomes "Uploading to YouTube...".
11. Fargate task streams S3 file to YouTube; status becomes "Processing on YouTube...".
12. YouTube finishes processing; status becomes "live".
13. Job row shows "View on YouTube" button.
14. User clicks "View on YouTube" — default browser opens `https://youtube.com/watch?v=xxx`.

### HP-3: Handle Token Expiry During Upload

1. User's YouTube access token has expired (>1 hour since last refresh).
2. Fargate task attempts YouTube API call, receives 401.
3. Fargate task uses the refresh token to obtain a new access token.
4. Fargate task encrypts and stores the new access token.
5. Fargate task retries the API call with the new token.
6. Upload proceeds successfully. User sees no error.

### HP-4: Failed Upload — Credit Refund

1. User uploads to YouTube, but YouTube API returns a quota error.
2. Fargate task updates `social_uploads.status` to `'failed'` with error message.
3. Fargate task calls `releaseCredits` to refund the 10 RC reservation.
4. Fargate task sends SES failure notification email.
5. Desktop polls and sees the failed status.
6. Job row shows the error message and "Retry Upload" button with "10 RC refunded" note.
7. User can retry later (a new upload with a new credit reservation).

### HP-5: Disconnect YouTube Account

1. User navigates to the Account tab.
2. Under "Connected Accounts", YouTube shows as connected.
3. User clicks "Disconnect".
4. Confirmation prompt: "Disconnect YouTube? Any in-progress uploads will continue, but you won't be able to start new ones."
5. User confirms.
6. API deletes the `connected_accounts` row for `(userId, 'youtube')`.
7. Account tab updates to show "Connect" button.
8. "Upload to YouTube" buttons disappear from completed job rows.

---

## Security Considerations

1. **OAuth token encryption:** Access and refresh tokens are encrypted with AES-256-GCM before storage in the `connected_accounts` table. The encryption key (`TOKEN_ENCRYPTION_KEY`) is a 32-byte hex string stored as an environment variable in both the API Lambda and the Fargate task. Tokens are decrypted only in-memory, at the moment they are needed for API calls.

2. **CSRF protection via state parameter:** The OAuth `state` parameter is a signed JWT containing the user ID and a 10-minute expiry. The JWT is signed with `TOKEN_ENCRYPTION_KEY` using HS256. The callback handler verifies the signature and expiry before processing the code exchange. This prevents CSRF attacks where an attacker tricks a user into connecting the attacker's YouTube account.

3. **Callback route authentication:** The `/api/auth/youtube/callback` route is excluded from Clerk auth middleware because it is an inbound redirect from Google. Authentication is established via the signed `state` parameter (which was generated in the authenticated `/connect` endpoint).

4. **Token scope limitation:** The YouTube OAuth scope is limited to `youtube.upload`. This grants the minimum permission needed (upload videos). It does not grant access to read the user's existing videos, manage playlists, or delete content.

5. **Refresh token handling:** When a token refresh fails (user revoked access), the upload fails gracefully and the error message instructs the user to reconnect. The invalid tokens remain encrypted in the database until the user disconnects or reconnects (which triggers an upsert).

6. **SQS message integrity:** The SQS message is dispatched by the authenticated API endpoint and consumed by the Lambda/Fargate within the AWS VPC. The message payload includes `userId` and `socialUploadId` which are verified against the database on the consumer side.

7. **No tokens in responses:** The `GET /api/auth/youtube/status` endpoint returns the channel name and connection timestamp but never the access or refresh tokens. The only time tokens leave the API boundary is within the Fargate task's internal memory.

8. **Fargate task isolation:** The YouTube upload Fargate task runs in an isolated container with no inbound network access. It has outbound access to S3, YouTube API, Neon database, and SES only.

9. **IPC security:** The `racedash:youtube:upload` IPC handler in the main process must validate the `jobId` format (UUID) before forwarding to the API. The `fetchWithAuth` IPC method (from `cloud-auth`) handles token injection.

---

## Infrastructure

This branch provides handler code for infrastructure constructs defined by `cloud-infra`. No new CDK constructs are created.

### Handler code owned by this branch

| File | Deploys as | CDK construct owner |
|---|---|---|
| `infra/lambdas/social-dispatch/index.ts` | SQS dispatch Lambda | `cloud-infra` (SocialStack) |
| `infra/tasks/youtube-upload/index.ts` | YouTube Fargate task | `cloud-infra` (SocialStack) |
| `infra/tasks/youtube-upload/package.json` | — | This branch |

### Environment variables consumed by this branch

**`apps/api` (additional to existing):**

| Variable | Description |
|---|---|
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth client secret |
| `SQS_SOCIAL_UPLOAD_QUEUE_URL` | SQS queue URL for social upload dispatch |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex string for AES-256-GCM token encryption (new env var introduced by this branch — not in the epic's env var list, which says tokens are "stored encrypted" without specifying the mechanism) |

**`infra/lambdas/social-dispatch/` (Lambda):**

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon direct (non-pooled) connection string |
| `YOUTUBE_TASK_DEFINITION_ARN` | ECS task definition ARN |
| `ECS_CLUSTER_ARN` | Fargate cluster ARN |
| `TASK_SUBNETS` | Subnet IDs for Fargate networking |
| `TASK_SECURITY_GROUP` | Security group for Fargate task |

**`infra/tasks/youtube-upload/` (Fargate):**

| Variable | Description |
|---|---|
| `UPLOAD_PAYLOAD` | Serialized SQS message (container override) |
| `DATABASE_URL` | Neon direct (non-pooled) connection string |
| `S3_RENDERS_BUCKET` | S3 bucket for render outputs |
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID (for token refresh) |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth client secret (for token refresh) |
| `SES_FROM_ADDRESS` | Sender email for failure notifications |
| `TOKEN_ENCRYPTION_KEY` | AES-256 key for token decryption |

---

## API Contracts

### Shared types (`apps/api/src/types.ts` — additions)

```ts
// ── YouTube OAuth ──────────────────────────────────────────────────────────

export interface YouTubeAccount {
  accountName: string
  accountId: string
  connectedAt: string // ISO 8601
}

export interface YouTubeStatusResponse {
  connected: boolean
  account: YouTubeAccount | null
}

export interface YouTubeDisconnectResponse {
  disconnected: true
}

// ── Social Upload ──────────────────────────────────────────────────────────

export interface SocialUploadRequest {
  platform: 'youtube'
  metadata: YouTubeUploadMetadata
}

export interface YouTubeUploadMetadata {
  title: string       // 1-100 chars
  description: string // 0-5000 chars
  privacy: 'public' | 'unlisted' | 'private'
}

export interface SocialUploadResponse {
  socialUploadId: string
  status: 'queued'
  platform: 'youtube'
  rcCost: number
}

export interface SocialUploadStatusEntry {
  id: string
  platform: 'youtube'
  status: 'queued' | 'uploading' | 'processing' | 'live' | 'failed'
  metadata: YouTubeUploadMetadata
  rcCost: number
  platformUrl: string | null
  errorMessage: string | null
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export interface SocialUploadsListResponse {
  uploads: SocialUploadStatusEntry[]
}

// ── SQS Message Payload ──────────────────────────────────────────────────

export interface SocialUploadPayload {
  socialUploadId: string
  reservationKey: string // `su_${socialUploadId}`
  jobId: string
  userId: string
  platform: 'youtube'
  outputS3Key: string   // `renders/${jobId}/output.mp4`
  metadata: YouTubeUploadMetadata
}

// ── Token Encryption ─────────────────────────────────────────────────────

export interface TokenCrypto {
  encryptToken(plaintext: string): string
  decryptToken(encrypted: string): string
}
```

### Error codes (additions)

| HTTP Status | `error.code` | When |
|---|---|---|
| `400` | `INVALID_REQUEST` | Missing or invalid request body fields |
| `400` | `INVALID_OAUTH_STATE` | OAuth state parameter missing, expired, or tampered |
| `400` | `OAUTH_TOKEN_EXCHANGE_FAILED` | Google rejected the authorization code |
| `402` | `INSUFFICIENT_CREDITS` | User has fewer than 10 RC available |
| `403` | `LICENSE_REQUIRED` | User has no active license |
| `403` | `JOB_NOT_OWNED` | Authenticated user does not own the job |
| `404` | `JOB_NOT_FOUND` | Job ID does not exist |
| `404` | `YOUTUBE_NOT_CONNECTED` | No YouTube connected account for user |
| `409` | `UPLOAD_ALREADY_EXISTS` | An active/live YouTube upload already exists for this job |
| `422` | `JOB_NOT_COMPLETE` | Job status is not `'complete'` |

---

## Package Structure

```
apps/api/src/
  routes/
    youtube-auth.ts                   # GET /api/auth/youtube/connect, callback, status
    youtube-disconnect.ts             # DELETE /api/auth/youtube/disconnect
    social-upload.ts                  # POST /api/jobs/:id/social-upload
    social-uploads-list.ts            # GET /api/jobs/:id/social-uploads
  lib/
    token-crypto.ts                   # encryptToken, decryptToken (AES-256-GCM)
    youtube-client.ts                 # YouTube API helper (channel info, upload initiation)
  types.ts                           # (modified) add YouTube + social upload types
  plugins/
    clerk-auth.ts                     # (modified) add /api/auth/youtube/callback to exclusion list
  test/
    routes/
      youtube-auth.test.ts
      social-upload.test.ts
      social-uploads-list.test.ts
    lib/
      token-crypto.test.ts
    properties/
      social-upload.property.test.ts
    snapshots/
      youtube-status.snap.ts
      social-upload.snap.ts

infra/
  lambdas/
    social-dispatch/
      index.ts                        # SQS dispatch Lambda handler (replaces placeholder)
  tasks/
    youtube-upload/
      index.ts                        # YouTube Fargate task handler
      package.json                    # Dependencies: @aws-sdk/client-s3, @aws-sdk/client-ses, @racedash/db
      tsconfig.json
  test/
    lambdas/
      social-dispatch.test.ts
    tasks/
      youtube-upload.test.ts

apps/desktop/src/
  main/
    youtube.ts                        # YouTube IPC handlers (connect, disconnect, upload, status)
  preload/
    index.ts                          # (modified) expose youtube IPC channels
  types/
    ipc.ts                            # (modified) add YouTube types and methods
  renderer/src/
    hooks/
      useYouTube.ts                   # React hook for YouTube connection + upload state
    components/app/
      AccountDetails.tsx              # (modified) add Connected Accounts section
      CloudRendersList.tsx            # (modified) upload button, status, view link
      YouTubeUploadDialog.tsx         # (new) upload metadata dialog
```

---

## Tests

### Specification Tests

Unit tests using Vitest. Each test targets a specific functional requirement.

**`apps/api/test/routes/youtube-auth.test.ts`**

| Test | FR |
|---|---|
| `GET /connect` returns 302 redirect to Google OAuth URL with correct scope and state | FR-1 |
| `GET /connect` returns 403 when user has no active license | FR-2 |
| `GET /connect` returns 401 when not authenticated | FR-1 |
| `GET /callback` exchanges code for tokens and stores encrypted tokens in connected_accounts | FR-4 |
| `GET /callback` returns 400 for missing state parameter | FR-4a |
| `GET /callback` returns 400 for expired state parameter (>10 min) | FR-4a |
| `GET /callback` returns 400 for tampered state parameter (invalid JWT signature) | FR-4a |
| `GET /callback` upserts existing connected_accounts row on reconnect | FR-4e |
| `GET /callback` does not require Clerk auth (excluded from middleware) | FR-3 |
| `GET /callback` stores channel name and channel ID from YouTube API | FR-4c |
| `GET /status` returns connected=true with account details when YouTube is connected | FR-5 |
| `GET /status` returns connected=false when no YouTube account is connected | FR-5 |
| `GET /status` does not include access or refresh tokens in response | FR-5 |
| `DELETE /disconnect` removes connected_accounts row | FR-6 |
| `DELETE /disconnect` returns 404 when no YouTube account is connected | FR-6 |

**`apps/api/test/routes/social-upload.test.ts`**

| Test | FR |
|---|---|
| `POST /social-upload` creates social_uploads row and returns 201 with queued status | FR-7 |
| `POST /social-upload` reserves 10 RC via reserveCredits | FR-7g |
| `POST /social-upload` sends SQS message with correct payload shape | FR-7h |
| `POST /social-upload` returns 402 when user has insufficient credits | FR-7g |
| `POST /social-upload` returns 404 when job does not exist | FR-7 |
| `POST /social-upload` returns 403 when user does not own the job | FR-7a |
| `POST /social-upload` returns 422 when job status is not complete | FR-7b |
| `POST /social-upload` returns 404 when YouTube is not connected | FR-7c |
| `POST /social-upload` returns 403 when user has no active license | FR-7d |
| `POST /social-upload` returns 409 when active upload already exists for job | FR-8 |
| `POST /social-upload` returns 400 when title exceeds 100 chars | FR-7e |
| `POST /social-upload` returns 400 when title is empty | FR-7e |
| `POST /social-upload` returns 400 when privacy is invalid value | FR-7e |
| `POST /social-upload` does not insert social_uploads row when credits are insufficient | FR-7g |
| `POST /social-upload` allows re-upload after previous upload failed | FR-8 |

**`apps/api/test/routes/social-uploads-list.test.ts`**

| Test | FR |
|---|---|
| `GET /social-uploads` returns all upload records for a job | FR-23 |
| `GET /social-uploads` returns empty array when no uploads exist | FR-23 |
| `GET /social-uploads` returns 403 when user does not own the job | FR-23 |
| `GET /social-uploads` returns 404 when job does not exist | FR-23 |

**`apps/api/test/lib/token-crypto.test.ts`**

| Test | FR |
|---|---|
| encryptToken produces different ciphertext for same input (random IV) | FR-9 |
| decryptToken recovers original plaintext | FR-10 |
| decryptToken throws on tampered ciphertext | FR-10 |
| decryptToken throws on wrong key | FR-10 |
| Encrypted format matches `iv:authTag:ciphertext` hex pattern | FR-9 |
| Round-trip: encryptToken then decryptToken returns original string | FR-9, FR-10 |

**`infra/test/lambdas/social-dispatch.test.ts`**

| Test | FR |
|---|---|
| Launches Fargate task for platform=youtube with correct task definition ARN | FR-11 |
| Passes full payload as UPLOAD_PAYLOAD container override env var | FR-11c |
| Updates social_uploads.status to uploading after successful RunTask | FR-12 |
| Throws error for unrecognised platform (message goes to DLQ) | FR-11d |
| Parses SQS event record body as JSON | FR-11a |

**`infra/test/tasks/youtube-upload.test.ts`**

| Test | FR |
|---|---|
| Streams S3 object to YouTube resumable upload endpoint | FR-13 |
| Sets video metadata (title, description, categoryId, privacyStatus) from payload | FR-15 |
| Updates status to processing after upload bytes sent | FR-13g |
| Updates status to live and stores platform_url on success | FR-13i |
| Calls consumeCredits on successful upload | FR-13i |
| Updates status to failed and stores error_message on failure | FR-13j |
| Calls releaseCredits on failed upload | FR-13j |
| Sends SES failure email on error | FR-13j |
| Refreshes access token on 401 and retries | FR-14 |
| Fails with reconnect message when refresh token is invalid | FR-14e |
| Updates connected_accounts.access_token after successful refresh | FR-14c |
| Updates connected_accounts.last_used_at on success | FR-13i |
| Exits with code 0 on failure (prevent ECS retry) | FR-13j |
| Handles S3 GetObject error gracefully | Error handling table |
| Handles YouTube quota error (403) gracefully | Error handling table |

### Property-Based Tests

**`apps/api/test/properties/social-upload.property.test.ts`**

Using `fast-check`:

1. **Token encryption is symmetric:** For any arbitrary string `s`, `decryptToken(encryptToken(s)) === s`. The round-trip preserves the original value regardless of input length, encoding, or special characters.

2. **Token encryption produces unique ciphertexts:** For any string `s`, calling `encryptToken(s)` twice produces two different ciphertexts (due to random IV), but both decrypt to the same plaintext.

3. **Credit conservation:** For any sequence of social upload create/fail/succeed operations, the sum of `consumed + released + reserved` credits equals the total credits initially reserved. Credits are never lost or duplicated.

4. **Upload state machine:** Given a sequence of status transitions for a social upload, the status always follows valid transitions:
   - `queued` -> `uploading` (dispatch Lambda)
   - `uploading` -> `processing` (Fargate: bytes sent)
   - `uploading` -> `failed` (Fargate: error)
   - `processing` -> `live` (Fargate: YouTube done)
   - `processing` -> `failed` (Fargate: timeout/error)
   - No other transitions are valid.

5. **Metadata validation is total:** For any arbitrary object passed as `metadata` in the social upload request, the validation either accepts it (all fields valid) or rejects it with a 400 error. It never throws an unhandled error or returns a 5xx.

### Mutation / Genetic Modification Tests

The following mutations must be caught by the specification tests above. If a mutation survives, the test suite has a gap.

| Mutation | Target | Must be caught by |
|---|---|---|
| Remove `state` parameter validation in OAuth callback | `routes/youtube-auth.ts` | `youtube-auth.test.ts` — invalid/missing state tests must fail |
| Remove `encryptToken()` call before storing tokens | `routes/youtube-auth.ts` | `token-crypto.test.ts` and `youtube-auth.test.ts` — stored tokens would be plaintext |
| Remove `reserveCredits()` call in social upload endpoint | `routes/social-upload.ts` | `social-upload.test.ts` — credit reservation test must fail |
| Change credit cost from 10 to 0 | `routes/social-upload.ts` | `social-upload.test.ts` — must assert exact 10 RC reservation |
| Remove duplicate upload check (409 guard) | `routes/social-upload.ts` | `social-upload.test.ts` — duplicate upload test must fail |
| Remove `releaseCredits()` call on Fargate task failure | `tasks/youtube-upload/index.ts` | `youtube-upload.test.ts` — release on failure test must fail |
| Remove `consumeCredits()` call on Fargate task success | `tasks/youtube-upload/index.ts` | `youtube-upload.test.ts` — consume on success test must fail |
| Skip token refresh on 401 (immediately fail) | `tasks/youtube-upload/index.ts` | `youtube-upload.test.ts` — token refresh test must fail |
| Remove license validation from `GET /connect` | `routes/youtube-auth.ts` | `youtube-auth.test.ts` — no-license test must fail |
| Remove job ownership check in social upload | `routes/social-upload.ts` | `social-upload.test.ts` — job-not-owned test must fail |
| Remove job status check in social upload | `routes/social-upload.ts` | `social-upload.test.ts` — job-not-complete test must fail |
| Remove callback route from Clerk auth exclusion list | `plugins/clerk-auth.ts` | `youtube-auth.test.ts` — callback would require Bearer token and fail |
| Remove SES failure email on upload error | `tasks/youtube-upload/index.ts` | `youtube-upload.test.ts` — SES email test must fail |
| Return tokens in `GET /status` response | `routes/youtube-auth.ts` | `youtube-auth.test.ts` — no-tokens-in-response test must fail |
| Remove title length validation (allow >100 chars) | `routes/social-upload.ts` | `social-upload.test.ts` — title-too-long test must fail |

### Characterisation Tests

Snapshot tests that lock down the shape of API responses. These prevent accidental breaking changes to the contract.

**`apps/api/test/snapshots/youtube-status.snap.ts`**

```ts
// Snapshot: GET /api/auth/youtube/status (connected)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "connected": true,
    "account": {
      "accountName": Any<String>,
      "accountId": Any<String>,
      "connectedAt": Any<String>,
    },
  }
`)

// Snapshot: GET /api/auth/youtube/status (not connected)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "connected": false,
    "account": null,
  }
`)

// Snapshot: DELETE /api/auth/youtube/disconnect
expect(response.json()).toMatchInlineSnapshot(`
  {
    "disconnected": true,
  }
`)
```

**`apps/api/test/snapshots/social-upload.snap.ts`**

```ts
// Snapshot: POST /api/jobs/:id/social-upload response
expect(response.json()).toMatchInlineSnapshot(`
  {
    "socialUploadId": Any<String>,
    "status": "queued",
    "platform": "youtube",
    "rcCost": 10,
  }
`)

// Snapshot: GET /api/jobs/:id/social-uploads response (with one upload)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "uploads": [
      {
        "id": Any<String>,
        "platform": "youtube",
        "status": Any<String>,
        "metadata": {
          "title": Any<String>,
          "description": Any<String>,
          "privacy": Any<String>,
        },
        "rcCost": 10,
        "platformUrl": Any<String | null>,
        "errorMessage": Any<String | null>,
        "createdAt": Any<String>,
        "updatedAt": Any<String>,
      },
    ],
  }
`)

// Snapshot: POST /api/jobs/:id/social-upload error (insufficient credits)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "INSUFFICIENT_CREDITS",
      "message": Any<String>,
    },
  }
`)

// Snapshot: POST /api/jobs/:id/social-upload error (duplicate upload)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "UPLOAD_ALREADY_EXISTS",
      "message": Any<String>,
    },
  }
`)
```

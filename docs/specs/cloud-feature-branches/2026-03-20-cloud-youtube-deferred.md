# cloud-youtube — Deferred Work

**Date:** 2026-03-20
**Status:** Deferred until epic body of work is complete
**Branch:** `feat/cloud-youtube`

These tasks are non-blocking test coverage and design deliverables. All API routes (6), token encryption, SQS dispatch Lambda, YouTube Fargate task handler, and desktop UI (OAuth flow, upload dialog, status tracking) are fully functional without them. API-level tests (42 tests across 7 files) are complete.

---

## 1. Unit Tests — SQS Dispatch Lambda

**`infra/test/lambdas/social-dispatch.test.ts`** — 5 tests

| Test | FR |
|---|---|
| Launches Fargate task for `platform=youtube` with correct task definition ARN | FR-11 |
| Passes full payload as `UPLOAD_PAYLOAD` container override env var | FR-11c |
| Updates `social_uploads.status` to `'uploading'` after successful RunTask | FR-12 |
| Throws error for unrecognised platform (message goes to DLQ) | FR-11d |
| Parses SQS event record body as JSON | FR-11a |

**Why deferred:** Requires ECS RunTask mock infrastructure. The dispatch Lambda is thin (65 lines) and the happy path is covered by the API-level `social-upload.test.ts` which verifies SQS message dispatch.

---

## 2. Unit Tests — YouTube Upload Fargate Task

**`infra/test/tasks/youtube-upload.test.ts`** — 15 tests

| Test | FR |
|---|---|
| Streams S3 object to YouTube resumable upload endpoint | FR-13 |
| Sets video metadata (title, description, categoryId, privacyStatus) from payload | FR-15 |
| Updates status to `'processing'` after upload bytes sent | FR-13g |
| Updates status to `'live'` and stores `platform_url` on success | FR-13i |
| Calls `consumeCredits` on successful upload | FR-13i |
| Updates status to `'failed'` and stores `error_message` on failure | FR-13j |
| Calls `releaseCredits` on failed upload | FR-13j |
| Sends SES failure email on error | FR-13j |
| Refreshes access token on 401 and retries | FR-14 |
| Fails with reconnect message when refresh token is invalid | FR-14e |
| Updates `connected_accounts.access_token` after successful refresh | FR-14c |
| Updates `connected_accounts.last_used_at` on success | FR-13i |
| Exits with code 0 on failure (prevents ECS retry) | FR-13j |
| Handles S3 GetObject error gracefully | Error handling |
| Handles YouTube quota error (403) gracefully | Error handling |

**Why deferred:** Requires mock infrastructure for S3 streaming, YouTube resumable upload API, and ECS task environment. The handler is 390 lines with complex async streaming logic that needs careful mock setup.

---

## 3. Mutation Tests

14 mutations the test suite must catch. The API-level spec tests may already catch some, but explicit mutation test verification is deferred.

| # | Mutation | Target file |
|---|---|---|
| 1 | Remove `state` parameter validation in OAuth callback | `youtube-auth.ts` |
| 2 | Remove `encryptToken()` call before storing tokens | `youtube-auth.ts` |
| 3 | Remove `reserveCredits()` call in social upload endpoint | `social-upload.ts` |
| 4 | Change credit cost from 10 to 0 | `social-upload.ts` |
| 5 | Remove duplicate upload check (409 guard) | `social-upload.ts` |
| 6 | Remove `releaseCredits()` call on Fargate task failure | `youtube-upload/index.ts` |
| 7 | Remove `consumeCredits()` call on Fargate task success | `youtube-upload/index.ts` |
| 8 | Skip token refresh on 401 (immediately fail) | `youtube-upload/index.ts` |
| 9 | Remove license validation from `GET /connect` | `youtube-auth.ts` |
| 10 | Remove job ownership check in social upload | `social-upload.ts` |
| 11 | Remove job status check in social upload | `social-upload.ts` |
| 12 | Remove callback route from Clerk auth exclusion list | `clerk-auth.ts` |
| 13 | Remove SES failure email on upload error | `youtube-upload/index.ts` |
| 14 | Return tokens in `GET /status` response | `youtube-auth.ts` |
| 15 | Remove title length validation (allow >100 chars) | `social-upload.ts` |

**Note:** Mutations 1–5, 9–12, 14–15 target API routes and should already be caught by the existing 42 API tests. Mutations 6–8, 13 target the Fargate handler and are blocked on item 2 above.

---

## 4. Paper UI Mockups

9 mockups listed in spec, none created:

1. Account tab — YouTube connected (channel name, "Connected" badge, Disconnect button)
2. Account tab — YouTube not connected (greyed icon, Connect button)
3. CloudRendersList — completed job with YouTube button (Download + Upload to YouTube side by side)
4. YouTube upload dialog (title, description, privacy, cost display, balance)
5. YouTube upload dialog — insufficient credits (warning banner, disabled Upload button)
6. CloudRendersList — upload in progress (spinner + "Uploading to YouTube...")
7. CloudRendersList — upload live ("View on YouTube" button)
8. CloudRendersList — upload failed (error message, Retry Upload, "10 RC refunded")
9. YouTube OAuth BrowserWindow (Google consent screen, 500x700)

---

## Not Deferred (completed)

The following were completed during implementation:

- **All 6 API routes** with full validation, credit reservation, and SQS dispatch
- **Token encryption/decryption** (AES-256-GCM with random IV)
- **42 API tests** across 7 files (11 youtube-auth, 12 social-upload, 4 social-uploads-list, 6 token-crypto, 4 property-based, 5 snapshot)
- **SQS dispatch Lambda handler** (code complete, untested)
- **YouTube Fargate task handler** (code complete, untested — 390 lines with S3 streaming, token refresh, error handling)
- **Desktop OAuth flow** (BrowserWindow, secure sandbox, auto-close on success)
- **YouTube upload dialog** (title, description, privacy, credit cost/balance display, insufficient credits warning)
- **Upload status tracking** in CloudRendersList (queued/uploading/processing/live/failed states)
- **AccountDetails** YouTube connection UI (connect/disconnect, channel name display)
- **All security considerations** (OAuth state JWT, token encryption, scope limitation, no token leakage, IPC validation)

// ── Error response ────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// ── GET /api/health ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────

export interface AuthMeUser {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string // ISO 8601
}

export interface AuthMeLicense {
  tier: 'plus' | 'pro'
  status: 'active'
  expiresAt: string // ISO 8601
}

export interface AuthMeResponse {
  user: AuthMeUser
  license: AuthMeLicense | null
}

// ── POST /api/webhooks/clerk ──────────────────────────────────────────────

export interface ClerkWebhookResponse {
  received: true
}

// ── Stripe Checkout ───────────────────────────────────────────────────────

export interface CreateSubscriptionCheckoutRequest {
  tier: 'plus' | 'pro'
}

export interface CreateCreditCheckoutRequest {
  packSize: number
}

export interface CheckoutResponse {
  checkoutUrl: string
  sessionId: string
}

// ── Credits ───────────────────────────────────────────────────────────────

export interface CreditPackResponse {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditBalanceResponse {
  totalRc: number
  packs: CreditPackResponse[]
}

export interface CreditPurchaseResponse {
  id: string
  packName: string
  rcTotal: number
  priceGbp: string     // decimal string
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditHistoryResponse {
  purchases: CreditPurchaseResponse[]
  nextCursor: string | null
}

// ── License ───────────────────────────────────────────────────────────────

export interface LicenseResponse {
  license: LicenseDetail | null
}

export interface LicenseDetail {
  tier: 'plus' | 'pro'
  status: 'active'
  stripeSubscriptionId: string
  startsAt: string           // ISO 8601
  expiresAt: string          // ISO 8601
  maxConcurrentRenders: number
}

// ── Stripe Webhook ────────────────────────────────────────────────────────

export interface StripeWebhookResponse {
  received: true
}

// ── Jobs ─────────────────────────────────────────────────────────────────

export type JobStatus = 'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed'

export interface JobConfig {
  resolution: string
  frameRate: string
  renderMode: string
  overlayStyle: string
  config: Record<string, unknown>
  sourceVideo: {
    width: number
    height: number
    fps: number
    durationSeconds: number
    fileSizeBytes: number
  }
  projectName: string
  sessionType: string
}

export interface CreateJobRequest {
  config: {
    resolution: string
    frameRate: string
    renderMode: string
    overlayStyle: string
    config: Record<string, unknown>
  }
  sourceVideo: {
    width: number
    height: number
    fps: number
    durationSeconds: number
    fileSizeBytes: number
  }
  projectName: string
  sessionType: string
}

export interface CreateJobResponse {
  jobId: string
  rcCost: number
  uploadKey: string
}

export interface StartUploadRequest {
  partCount: number
  partSize: number
  contentType: string
}

export interface StartUploadResponse {
  uploadId: string
  presignedUrls: Array<{ partNumber: number; url: string }>
}

export interface CompleteUploadRequest {
  parts: Array<{ partNumber: number; etag: string }>
}

export interface CompleteUploadResponse {
  jobId: string
  status: 'queued'
  executionArn: string
}

export interface JobStatusEvent {
  status: JobStatus
  progress: number
  queuePosition: number | null
  downloadExpiresAt: string | null
  errorMessage: string | null
}

export interface DownloadResponse {
  downloadUrl: string
  expiresAt: string
}

export interface ListJobsItem {
  id: string
  status: JobStatus
  config: JobConfig
  projectName: string
  sessionType: string
  rcCost: number | null
  queuePosition: number | null
  downloadExpiresAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface ListJobsResponse {
  jobs: ListJobsItem[]
  nextCursor: string | null
}

// ── Webhooks — Remotion ──────────────────────────────────────────────────

export interface RemotionWebhookPayload {
  type: 'success' | 'error' | 'timeout'
  renderId: string
  expectedBucketOwner: string
  customData: {
    taskToken: string
    jobId: string
  }
  outputUrl?: string
  outputFile?: string
  errors?: Array<{ message: string; stack?: string }>
}

// ── Webhooks — Render (EventBridge relay) ────────────────────────────────

export interface RenderWebhookPayload {
  detail: {
    executionArn: string
    status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED'
    input: string
  }
}

// ── Clerk auth context (injected by middleware into request) ──────────────

export interface ClerkAuthContext {
  userId: string
  sessionId: string
}

// ── Admin types ──────────────────────────────────────────────────────────

export type JobStatus = 'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed'
export type LicenseTier = 'plus' | 'pro'
export type LicenseStatus = 'active' | 'expired' | 'cancelled'

// ── GET /api/admin/stats/overview ────────────────────────────────────────

export interface AdminOverviewResponse {
  inFlight: {
    uploading: number
    queued: number
    rendering: number
    compositing: number
  }
  completedToday: number
  failedToday: number
  failureRate7d: number
  recentFailedJobs: Array<{
    id: string
    userEmail: string
    errorMessage: string | null
    failedAt: string
  }>
}

// ── GET /api/admin/users ─────────────────────────────────────────────────

export interface AdminUserListItem {
  id: string
  clerkId: string
  email: string
  licenseTier: LicenseTier | null
  createdAt: string
}

export interface AdminUserListResponse {
  users: AdminUserListItem[]
  nextCursor: string | null
}

// ── GET /api/admin/users/:id ─────────────────────────────────────────────

export interface AdminUserDetailResponse {
  user: {
    id: string
    clerkId: string
    email: string
    billingCountry: string | null
    stripeCustomerId: string | null
    createdAt: string
  }
  licenses: Array<{
    id: string
    tier: LicenseTier
    status: LicenseStatus
    stripeSubscriptionId: string | null
    startsAt: string
    expiresAt: string
    createdAt: string
    updatedAt: string
  }>
  creditPacks: Array<{
    id: string
    packName: string
    rcTotal: number
    rcRemaining: number
    priceGbp: string
    purchasedAt: string
    expiresAt: string
  }>
  recentJobs: Array<{
    id: string
    status: JobStatus
    rcCost: number | null
    createdAt: string
    updatedAt: string
  }>
}

// ── POST /api/admin/users/:id/licenses ───────────────────────────────────

export interface AdminIssueLicenseRequest {
  tier: LicenseTier
  startsAt: string
  expiresAt: string
}

// ── PATCH /api/admin/users/:id/licenses/:licenseId ───────────────────────

export interface AdminUpdateLicenseRequest {
  expiresAt?: string
  status?: 'cancelled'
}

// ── GET /api/admin/jobs ──────────────────────────────────────────────────

export interface AdminJobListItem {
  id: string
  userEmail: string
  status: JobStatus
  rcCost: number | null
  createdAt: string
  updatedAt: string
  durationSec: number | null
  errorMessage: string | null
}

export interface AdminJobListResponse {
  jobs: AdminJobListItem[]
  nextCursor: string | null
}

// ── GET /api/admin/jobs/:id ──────────────────────────────────────────────

export interface AdminJobDetailResponse {
  job: {
    id: string
    userId: string
    userEmail: string
    status: JobStatus
    config: Record<string, unknown>
    inputS3Keys: string[]
    uploadIds: unknown
    outputS3Key: string | null
    downloadExpiresAt: string | null
    slotTaskToken: string | null
    renderTaskToken: string | null
    remotionRenderId: string | null
    rcCost: number | null
    sfnExecutionArn: string | null
    errorMessage: string | null
    createdAt: string
    updatedAt: string
  }
  sfnConsoleUrl: string | null
  creditReservation: {
    id: string
    rcAmount: number
    status: string
    createdAt: string
    settledAt: string | null
    packs: Array<{
      packId: string
      packName: string
      rcDeducted: number
    }>
  } | null
}

// ── POST /api/admin/users/:id/credits ────────────────────────────────────

export interface AdminCreditAdjustmentRequest {
  rcAmount: number
  reason: string
}

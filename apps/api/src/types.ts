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

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

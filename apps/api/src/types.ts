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

// ── Clerk auth context (injected by middleware into request) ──────────────

export interface ClerkAuthContext {
  userId: string
  sessionId: string
}

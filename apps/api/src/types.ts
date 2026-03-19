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

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

// ── Clerk auth context (injected by middleware into request) ──────────────

export interface ClerkAuthContext {
  userId: string
  sessionId: string
}

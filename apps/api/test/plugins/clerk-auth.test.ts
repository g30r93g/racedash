import { describe, it, expect } from 'vitest'

// These tests require mocking Clerk's verifyToken.
// They are marked as .todo until the test infrastructure is set up.

describe('clerk-auth middleware', () => {
  it.todo('rejects request with no Authorization header → 401')
  it.todo('rejects request with malformed Bearer token → 401')
  it.todo('rejects request with expired JWT → 401')
  it.todo('allows request with valid JWT, populates request.clerk')
  it.todo('skips auth for GET /api/health')
  it.todo('skips auth for POST /api/webhooks/clerk')
})

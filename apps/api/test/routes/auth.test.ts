import { describe, it, expect } from 'vitest'

// These tests require mocking Clerk SDK and a test database.
// They are marked as .todo until the test infrastructure is set up.

describe('GET /api/auth/me', () => {
  it.todo('returns user profile and active license for authenticated user')
  it.todo('returns license: null when user has no active license')
  it.todo('returns license: null when license is expired')
  it.todo('returns 401 when not authenticated')
  it.todo('returns 404 when Clerk user has no DB row')
})

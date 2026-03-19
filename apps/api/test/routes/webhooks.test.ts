import { describe, it, expect } from 'vitest'

// These tests require mocking Svix verification and a test database.
// They are marked as .todo until the test infrastructure is set up.

describe('POST /api/webhooks/clerk', () => {
  it.todo('creates DB user on valid user.created event with valid signature')
  it.todo('returns 200 and does nothing for unknown event types')
  it.todo('returns 400 for missing svix headers')
  it.todo('returns 400 for invalid svix signature')
  it.todo('returns 400 for replayed request (stale timestamp)')
  it.todo('is idempotent: duplicate user.created with same clerk_id does not error')
})

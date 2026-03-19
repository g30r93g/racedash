import { describe, it } from 'vitest'

// All slot signaling tests require a PostgreSQL connection with
// the jobs table populated. These are marked as .todo until the
// test database infrastructure is set up.

describe.todo('claimNextQueuedSlotToken', () => {
  it.todo('claims the oldest queued job token (ordered by created_at ASC)')
  it.todo('returns the pre-update slot_task_token value (not NULL)')
  it.todo('sets slot_task_token to NULL on the claimed job')
  it.todo('returns null when no queued jobs exist for the user')
  it.todo('returns null when queued jobs exist but slot_task_token is NULL')
  it.todo('only claims tokens for the specified user')
  it.todo('skips locked rows (FOR UPDATE SKIP LOCKED)')
  it.todo('is safe under concurrent execution — at most one caller gets each token')
})

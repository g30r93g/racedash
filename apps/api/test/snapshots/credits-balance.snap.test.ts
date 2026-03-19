import { describe, it } from 'vitest'

/**
 * Snapshot tests for GET /api/credits/balance response shape.
 * Ensures the response structure remains stable across code changes.
 *
 * All .todo — requires DB seeding with known credit pack data.
 */
describe('Credits balance response snapshots', () => {
  it.todo('Matches snapshot for user with multiple active packs')

  it.todo('Matches snapshot for user with no packs')

  it.todo('Matches snapshot for user with mix of expired and active packs')
})

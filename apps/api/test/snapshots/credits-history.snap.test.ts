import { describe, it } from 'vitest'

/**
 * Snapshot tests for GET /api/credits/history response shape.
 * Ensures pagination structure and purchase entries remain stable.
 *
 * All .todo — requires DB seeding with known credit pack purchase data.
 */
describe('Credits history response snapshots', () => {
  it.todo('Matches snapshot for first page of purchase history')

  it.todo('Matches snapshot for paginated result with nextCursor')

  it.todo('Matches snapshot for empty purchase history')
})

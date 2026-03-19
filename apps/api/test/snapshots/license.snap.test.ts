import { describe, it } from 'vitest'

/**
 * Snapshot tests for GET /api/license response shape.
 * Ensures license detail structure remains stable.
 *
 * All .todo — requires DB seeding with known license data.
 */
describe('License response snapshots', () => {
  it.todo('Matches snapshot for active Plus license')

  it.todo('Matches snapshot for active Pro license')

  it.todo('Matches snapshot for null license (no active license)')
})

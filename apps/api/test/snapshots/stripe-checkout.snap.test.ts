import { describe, it } from 'vitest'

/**
 * Snapshot tests for POST /api/stripe/checkout and POST /api/stripe/credits/checkout
 * response shapes. Ensures checkout URL and session ID structure remains stable.
 *
 * All .todo — requires Stripe mock returning predictable session data.
 */
describe('Stripe subscription checkout response snapshots', () => {
  it.todo('Matches snapshot for Plus tier checkout response')

  it.todo('Matches snapshot for Pro tier checkout response')
})

describe('Stripe credit checkout response snapshots', () => {
  it.todo('Matches snapshot for 50 RC pack checkout response')

  it.todo('Matches snapshot for 500 RC pack checkout response')
})

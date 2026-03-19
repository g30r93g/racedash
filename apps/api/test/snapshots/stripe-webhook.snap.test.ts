import { describe, it } from 'vitest'

/**
 * Snapshot tests for POST /api/webhooks/stripe response shapes
 * and side-effect data (license rows, credit pack rows).
 *
 * All .todo — requires DB + Stripe mock infrastructure for deterministic snapshots.
 */
describe('Stripe webhook response snapshots', () => {
  it.todo('Matches snapshot for subscription.created license row')

  it.todo('Matches snapshot for subscription.updated license row')

  it.todo('Matches snapshot for subscription.deleted licence row')

  it.todo('Matches snapshot for checkout.session.completed credit pack row')

  it.todo('Matches snapshot for { received: true } acknowledgement')
})

import { describe, it } from 'vitest'

describe('GET /api/license', () => {
  it.todo('Returns active license with tier, status, subscription ID, dates, and max concurrent renders')

  it.todo('Returns maxConcurrentRenders: 1 for Plus tier')

  it.todo('Returns maxConcurrentRenders: 3 for Pro tier')

  it.todo('Returns { license: null } when user has no active license')

  it.todo('Returns { license: null } when license is expired')

  it.todo('Returns { license: null } when license is cancelled')

  it.todo('Returns 401 when not authenticated')
})

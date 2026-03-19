import { describe, it } from 'vitest'

describe('GET /api/credits/balance', () => {
  it.todo('Returns total RC balance summing all non-expired packs with remaining credits')

  it.todo('Excludes expired packs from balance')

  it.todo('Excludes fully depleted packs')

  it.todo('Orders packs by expires_at ASC')

  it.todo('Returns empty packs array and totalRc 0 when user has no packs')

  it.todo('Returns 401 when not authenticated')
})

describe('GET /api/credits/history', () => {
  it.todo('Returns paginated purchase history in purchased_at DESC order')

  it.todo('Respects cursor-based pagination')

  it.todo('Respects limit parameter (default 20, max 100)')

  it.todo('Returns nextCursor: null on last page')

  it.todo('Returns 401 when not authenticated')
})

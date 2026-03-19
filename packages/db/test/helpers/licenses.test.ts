import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getSlotLimit, countActiveRenders, validateLicenseTier, checkLicenseExpiry } from '../../src/helpers/licenses'
import { users } from '../../src/schema/users'
import { licenses } from '../../src/schema/licenses'
import { jobs } from '../../src/schema/jobs'
import { getTestDb, isDbAvailable } from '../db-helper'

describe('getSlotLimit', () => {
  it('returns 1 for plus tier', () => {
    expect(getSlotLimit('plus')).toBe(1)
  })

  it('returns 3 for pro tier', () => {
    expect(getSlotLimit('pro')).toBe(3)
  })

  it('throws for unrecognized tier', () => {
    // @ts-expect-error — testing invalid input
    expect(() => getSlotLimit('free')).toThrow('Unrecognized license tier')
  })
})

const describeDb = isDbAvailable() ? describe : describe.skip

describeDb('countActiveRenders', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      clerkId: 'test_renders_user',
      email: 'renders@test.com',
    }).returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(jobs).where(eq(jobs.userId, userId))
  })

  afterAll(async () => {
    await db.delete(jobs).where(eq(jobs.userId, userId))
    await db.delete(users).where(eq(users.id, userId))

  })

  it('returns 0 when user has no jobs', async () => {
    const count = await countActiveRenders(db as any, userId)
    expect(count).toBe(0)
  })

  it('counts rendering jobs', async () => {
    await db.insert(jobs).values({
      userId,
      status: 'rendering',
      config: {},
      inputS3Keys: ['key'],
    })
    const count = await countActiveRenders(db as any, userId)
    expect(count).toBe(1)
  })

  it('counts compositing jobs', async () => {
    await db.insert(jobs).values({
      userId,
      status: 'compositing',
      config: {},
      inputS3Keys: ['key'],
    })
    const count = await countActiveRenders(db as any, userId)
    expect(count).toBe(1)
  })

  it('counts both rendering and compositing', async () => {
    await db.insert(jobs).values([
      { userId, status: 'rendering', config: {}, inputS3Keys: ['key'] },
      { userId, status: 'compositing', config: {}, inputS3Keys: ['key'] },
    ])
    const count = await countActiveRenders(db as any, userId)
    expect(count).toBe(2)
  })

  it('excludes uploading, queued, complete, and failed', async () => {
    await db.insert(jobs).values([
      { userId, status: 'uploading', config: {}, inputS3Keys: ['key'] },
      { userId, status: 'queued', config: {}, inputS3Keys: ['key'] },
      { userId, status: 'complete', config: {}, inputS3Keys: ['key'] },
      { userId, status: 'failed', config: {}, inputS3Keys: ['key'] },
      { userId, status: 'rendering', config: {}, inputS3Keys: ['key'] },
    ])
    const count = await countActiveRenders(db as any, userId)
    expect(count).toBe(1)
  })
})

describeDb('validateLicenseTier', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      clerkId: 'test_tier_user',
      email: 'tier@test.com',
    }).returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(licenses).where(eq(licenses.userId, userId))
  })

  afterAll(async () => {
    await db.delete(licenses).where(eq(licenses.userId, userId))
    await db.delete(users).where(eq(users.id, userId))

  })

  it('returns valid=true for active Plus when Plus required', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'plus',
      status: 'active',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'plus' })
    expect(result.valid).toBe(true)
    expect(result.activeLicense?.tier).toBe('plus')
  })

  it('returns valid=true for Pro when Plus required (Pro >= Plus)', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'pro',
      status: 'active',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'plus' })
    expect(result.valid).toBe(true)
  })

  it('returns valid=false for Plus when Pro required', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'plus',
      status: 'active',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'pro' })
    expect(result.valid).toBe(false)
  })

  it('returns valid=false and activeLicense=null with no licenses', async () => {
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'plus' })
    expect(result.valid).toBe(false)
    expect(result.activeLicense).toBeNull()
  })

  it('returns valid=false for expired license', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'pro',
      status: 'active',
      startsAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'plus' })
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for cancelled license', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'pro',
      status: 'cancelled',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    const result = await validateLicenseTier({ db: db as any, userId, requiredTier: 'plus' })
    expect(result.valid).toBe(false)
  })
})

describeDb('checkLicenseExpiry', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      clerkId: 'test_expiry_user',
      email: 'expiry@test.com',
    }).returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(licenses).where(eq(licenses.userId, userId))
  })

  afterAll(async () => {
    await db.delete(licenses).where(eq(licenses.userId, userId))
    await db.delete(users).where(eq(users.id, userId))

  })

  it('returns hasActiveLicense=true for active non-expired', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'pro',
      status: 'active',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
    const result = await checkLicenseExpiry({ db: db as any, userId })
    expect(result.hasActiveLicense).toBe(true)
    expect(result.license?.tier).toBe('pro')
  })

  it('returns hasActiveLicense=false for expired', async () => {
    await db.insert(licenses).values({
      userId,
      tier: 'plus',
      status: 'active',
      startsAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
    const result = await checkLicenseExpiry({ db: db as any, userId })
    expect(result.hasActiveLicense).toBe(false)
    expect(result.license).toBeTruthy() // license still returned for display
  })

  it('returns hasActiveLicense=false and license=null with no licenses', async () => {
    const result = await checkLicenseExpiry({ db: db as any, userId })
    expect(result.hasActiveLicense).toBe(false)
    expect(result.license).toBeNull()
  })
})

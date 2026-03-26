import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { reserveCredits, releaseCredits, consumeCredits } from '../../src/helpers/credits'
import { InsufficientCreditsError } from '../../src/errors'
import { getSlotLimit } from '../../src/helpers/licenses'
import { users } from '../../src/schema/users'
import { creditPacks } from '../../src/schema/credit-packs'
import { creditReservations } from '../../src/schema/credit-reservations'
import { creditReservationPacks } from '../../src/schema/credit-reservation-packs'
import { getTestDb, isDbAvailable } from '../db-helper'

const describeDb = isDbAvailable() ? describe : describe.skip

describeDb('reserveCredits', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        clerkId: 'test_reserve_user',
        email: 'reserve@test.com',
      })
      .returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
  })

  afterAll(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it('single pack, exact amount — reserves all remaining', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    const result = await reserveCredits({ db: db as any, userId, jobId: 'job-1', rcAmount: 50 })
    expect(result.packBreakdown).toHaveLength(1)
    expect(result.packBreakdown[0].rcDeducted).toBe(50)

    const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    expect(pack.rcRemaining).toBe(0)
  })

  it('single pack, partial amount — leaves remainder', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 100,
      rcRemaining: 100,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    await reserveCredits({ db: db as any, userId, jobId: 'job-2', rcAmount: 30 })

    const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    expect(pack.rcRemaining).toBe(70)
  })

  it('multiple packs, FIFO order — depletes soonest-expiring first', async () => {
    const soonExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const laterExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    const [packA] = await db
      .insert(creditPacks)
      .values({
        userId,
        packName: 'Pack A (soon)',
        rcTotal: 5,
        rcRemaining: 5,
        priceGbp: '5.00',
        expiresAt: soonExpiry,
      })
      .returning()

    const [packB] = await db
      .insert(creditPacks)
      .values({
        userId,
        packName: 'Pack B (later)',
        rcTotal: 100,
        rcRemaining: 100,
        priceGbp: '20.00',
        expiresAt: laterExpiry,
      })
      .returning()

    const result = await reserveCredits({ db: db as any, userId, jobId: 'job-3', rcAmount: 8 })

    expect(result.packBreakdown).toHaveLength(2)
    expect(result.packBreakdown[0]).toEqual({ packId: packA.id, rcDeducted: 5 })
    expect(result.packBreakdown[1]).toEqual({ packId: packB.id, rcDeducted: 3 })

    const packs = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    const a = packs.find((p) => p.id === packA.id)!
    const b = packs.find((p) => p.id === packB.id)!
    expect(a.rcRemaining).toBe(0)
    expect(b.rcRemaining).toBe(97)
  })

  it('insufficient balance — throws InsufficientCreditsError', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Small',
      rcTotal: 5,
      rcRemaining: 5,
      priceGbp: '5.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    await expect(reserveCredits({ db: db as any, userId, jobId: 'job-4', rcAmount: 20 })).rejects.toThrow(
      InsufficientCreditsError,
    )
  })

  it('expired packs are excluded', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Expired',
      rcTotal: 100,
      rcRemaining: 100,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
    })

    await expect(reserveCredits({ db: db as any, userId, jobId: 'job-5', rcAmount: 1 })).rejects.toThrow(
      InsufficientCreditsError,
    )
  })

  it('returns reservationId and packBreakdown', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    const result = await reserveCredits({ db: db as any, userId, jobId: 'job-6', rcAmount: 10 })
    expect(result.reservationId).toBeDefined()
    expect(typeof result.reservationId).toBe('string')
    expect(result.packBreakdown).toBeInstanceOf(Array)
    expect(result.packBreakdown[0].packId).toBeDefined()
    expect(result.packBreakdown[0].rcDeducted).toBe(10)
  })
})

describeDb('releaseCredits', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        clerkId: 'test_release_user',
        email: 'release@test.com',
      })
      .returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
  })

  afterAll(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it('restores credits to a non-expired pack', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    const { reservationId } = await reserveCredits({ db: db as any, userId, jobId: 'rel-1', rcAmount: 10 })
    await releaseCredits({ db: db as any, jobId: 'rel-1' })

    const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    expect(pack.rcRemaining).toBe(50)

    const [reservation] = await db.select().from(creditReservations).where(eq(creditReservations.id, reservationId))
    expect(reservation.status).toBe('released')
    expect(reservation.settledAt).toBeTruthy()
  })

  it('idempotent — calling twice has no effect', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    await reserveCredits({ db: db as any, userId, jobId: 'rel-2', rcAmount: 10 })
    await releaseCredits({ db: db as any, jobId: 'rel-2' })
    await releaseCredits({ db: db as any, jobId: 'rel-2' }) // second call

    const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    expect(pack.rcRemaining).toBe(50) // not 60
  })

  it('non-existent jobId — returns without error', async () => {
    await expect(releaseCredits({ db: db as any, jobId: 'nonexistent' })).resolves.toBeUndefined()
  })
})

describeDb('consumeCredits', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        clerkId: 'test_consume_user',
        email: 'consume@test.com',
      })
      .returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
  })

  afterAll(async () => {
    await db.delete(creditReservationPacks)
    await db.delete(creditReservations)
    await db.delete(creditPacks).where(eq(creditPacks.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it('sets reservation status to consumed and settledAt', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    const { reservationId } = await reserveCredits({ db: db as any, userId, jobId: 'con-1', rcAmount: 10 })
    await consumeCredits({ db: db as any, jobId: 'con-1' })

    const [reservation] = await db.select().from(creditReservations).where(eq(creditReservations.id, reservationId))
    expect(reservation.status).toBe('consumed')
    expect(reservation.settledAt).toBeTruthy()
  })

  it('does not modify pack rc_remaining', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    await reserveCredits({ db: db as any, userId, jobId: 'con-2', rcAmount: 10 })
    const [packBefore] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))
    await consumeCredits({ db: db as any, jobId: 'con-2' })
    const [packAfter] = await db.select().from(creditPacks).where(eq(creditPacks.userId, userId))

    expect(packAfter.rcRemaining).toBe(packBefore.rcRemaining) // unchanged at 40
  })

  it('idempotent — calling twice has no effect', async () => {
    await db.insert(creditPacks).values({
      userId,
      packName: 'Starter',
      rcTotal: 50,
      rcRemaining: 50,
      priceGbp: '10.00',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    })

    await reserveCredits({ db: db as any, userId, jobId: 'con-3', rcAmount: 10 })
    await consumeCredits({ db: db as any, jobId: 'con-3' })
    await consumeCredits({ db: db as any, jobId: 'con-3' }) // second call — no error

    const [reservation] = await db.select().from(creditReservations).where(eq(creditReservations.jobId, 'con-3'))
    expect(reservation.status).toBe('consumed')
  })

  it('non-existent jobId — returns without error', async () => {
    await expect(consumeCredits({ db: db as any, jobId: 'nonexistent' })).resolves.toBeUndefined()
  })
})

// Pure function tests — always run
describe('getSlotLimit', () => {
  it('returns 1 for plus tier', () => {
    expect(getSlotLimit('plus')).toBe(1)
  })

  it('returns 3 for pro tier', () => {
    expect(getSlotLimit('pro')).toBe(3)
  })
})

describe('InsufficientCreditsError', () => {
  it('includes available and requested amounts', () => {
    const err = new InsufficientCreditsError(10, 25)
    expect(err.available).toBe(10)
    expect(err.requested).toBe(25)
    expect(err.name).toBe('InsufficientCreditsError')
    expect(err.message).toContain('25')
    expect(err.message).toContain('10')
  })

  it('is an instance of Error', () => {
    const err = new InsufficientCreditsError(0, 5)
    expect(err).toBeInstanceOf(Error)
  })
})

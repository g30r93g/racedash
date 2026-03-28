import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { claimNextQueuedSlotToken } from '../../src/helpers/slots'
import { users } from '../../src/schema/users'
import { jobs } from '../../src/schema/jobs'
import { getTestDb, isDbAvailable } from '../db-helper'

const describeDb = isDbAvailable() ? describe : describe.skip

describeDb('claimNextQueuedSlotToken', () => {
  const db = getTestDb()
  let userId: string

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        clerkId: 'test_slot_user',
        email: 'slot@test.com',
      })
      .returning()
    userId = user.id
  })

  beforeEach(async () => {
    await db.delete(jobs).where(eq(jobs.userId, userId))
  })

  afterAll(async () => {
    await db.delete(jobs).where(eq(jobs.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it('claims the oldest queued job token', async () => {
    await db.insert(jobs).values([
      {
        userId,
        status: 'queued',
        config: {},
        inputS3Keys: ['key'],
        slotTaskToken: 'token-newer',
        createdAt: new Date('2026-03-19T10:00:00Z'),
      },
      {
        userId,
        status: 'queued',
        config: {},
        inputS3Keys: ['key'],
        slotTaskToken: 'token-older',
        createdAt: new Date('2026-03-19T09:00:00Z'),
      },
    ])

    const token = await claimNextQueuedSlotToken({ db: db as any, userId })
    expect(token).toBe('token-older')
  })

  it('sets slot_task_token to NULL on the claimed job', async () => {
    const [job] = await db
      .insert(jobs)
      .values({
        userId,
        status: 'queued',
        config: {},
        inputS3Keys: ['key'],
        slotTaskToken: 'token-abc',
      })
      .returning()

    await claimNextQueuedSlotToken({ db: db as any, userId })

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id))
    expect(updated.slotTaskToken).toBeNull()
  })

  it('returns null when no queued jobs exist', async () => {
    const token = await claimNextQueuedSlotToken({ db: db as any, userId })
    expect(token).toBeNull()
  })

  it('returns null when queued jobs have null slot_task_token', async () => {
    await db.insert(jobs).values({
      userId,
      status: 'queued',
      config: {},
      inputS3Keys: ['key'],
      slotTaskToken: null,
    })

    const token = await claimNextQueuedSlotToken({ db: db as any, userId })
    expect(token).toBeNull()
  })

  it('only claims tokens for the specified user', async () => {
    const [otherUser] = await db
      .insert(users)
      .values({
        clerkId: 'other_slot_user',
        email: 'other-slot@test.com',
      })
      .returning()

    await db.insert(jobs).values({
      userId: otherUser.id,
      status: 'queued',
      config: {},
      inputS3Keys: ['key'],
      slotTaskToken: 'other-token',
    })

    const token = await claimNextQueuedSlotToken({ db: db as any, userId })
    expect(token).toBeNull()

    // cleanup
    await db.delete(jobs).where(eq(jobs.userId, otherUser.id))
    await db.delete(users).where(eq(users.id, otherUser.id))
  })
})

import { eq, and, gt, asc, sql } from 'drizzle-orm'
import { creditPacks } from '../schema/credit-packs'
import { creditReservations } from '../schema/credit-reservations'
import { creditReservationPacks } from '../schema/credit-reservation-packs'
import { InsufficientCreditsError } from '../errors'
import type { DrizzleDb } from '../client'

export interface ReserveCreditsInput {
  db: DrizzleDb
  userId: string
  jobId: string
  rcAmount: number
}

export interface ReserveCreditsResult {
  reservationId: string
  packBreakdown: Array<{ packId: string; rcDeducted: number }>
}

export async function reserveCredits(input: ReserveCreditsInput): Promise<ReserveCreditsResult> {
  const { db, userId, jobId, rcAmount } = input

  return await db.transaction(async (tx) => {
    const packs = await tx
      .select()
      .from(creditPacks)
      .where(
        and(
          eq(creditPacks.userId, userId),
          gt(creditPacks.rcRemaining, 0),
          gt(creditPacks.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(creditPacks.expiresAt))
      .for('update')

    const totalAvailable = packs.reduce((sum, p) => sum + p.rcRemaining, 0)
    if (totalAvailable < rcAmount) {
      throw new InsufficientCreditsError(totalAvailable, rcAmount)
    }

    let remaining = rcAmount
    const breakdown: Array<{ packId: string; rcDeducted: number }> = []

    for (const pack of packs) {
      if (remaining === 0) break
      const deduct = Math.min(remaining, pack.rcRemaining)

      await tx
        .update(creditPacks)
        .set({ rcRemaining: pack.rcRemaining - deduct })
        .where(eq(creditPacks.id, pack.id))

      breakdown.push({ packId: pack.id, rcDeducted: deduct })
      remaining -= deduct
    }

    const [reservation] = await tx
      .insert(creditReservations)
      .values({ jobId, userId, rcAmount })
      .returning()

    await tx.insert(creditReservationPacks).values(
      breakdown.map(({ packId, rcDeducted }) => ({
        reservationId: reservation.id,
        packId,
        rcDeducted,
      })),
    )

    return {
      reservationId: reservation.id,
      packBreakdown: breakdown,
    }
  })
}

export interface ReleaseCreditsInput {
  db: DrizzleDb
  jobId: string
}

export async function releaseCredits(input: ReleaseCreditsInput): Promise<void> {
  const { db, jobId } = input

  const [reservation] = await db
    .select()
    .from(creditReservations)
    .where(eq(creditReservations.jobId, jobId))
    .limit(1)

  if (!reservation || reservation.status !== 'reserved') return

  const packEntries = await db
    .select({
      packId: creditReservationPacks.packId,
      rcDeducted: creditReservationPacks.rcDeducted,
      packExpiresAt: creditPacks.expiresAt,
    })
    .from(creditReservationPacks)
    .innerJoin(creditPacks, eq(creditReservationPacks.packId, creditPacks.id))
    .where(eq(creditReservationPacks.reservationId, reservation.id))

  await db.transaction(async (tx) => {
    for (const entry of packEntries) {
      if (entry.packExpiresAt > new Date()) {
        await tx
          .update(creditPacks)
          .set({ rcRemaining: sql`rc_remaining + ${entry.rcDeducted}` })
          .where(eq(creditPacks.id, entry.packId))
      }
    }

    await tx
      .update(creditReservations)
      .set({ status: 'released', settledAt: new Date() })
      .where(eq(creditReservations.id, reservation.id))
  })
}

export interface ConsumeCreditsInput {
  db: DrizzleDb
  jobId: string
}

export async function consumeCredits(input: ConsumeCreditsInput): Promise<void> {
  const { db, jobId } = input

  const [reservation] = await db
    .select()
    .from(creditReservations)
    .where(eq(creditReservations.jobId, jobId))
    .limit(1)

  if (!reservation || reservation.status !== 'reserved') return

  await db
    .update(creditReservations)
    .set({ status: 'consumed', settledAt: new Date() })
    .where(eq(creditReservations.id, reservation.id))
}

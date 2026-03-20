import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, asc, sql } from 'drizzle-orm'
import { users, creditPacks, logAdminAction, type CreditPack } from '@racedash/db'
import { getDb } from '../../lib/db'
import type { AdminCreditAdjustmentRequest } from '../../types'

const creditsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/admin/users/:id/credits
  fastify.post<{
    Params: { id: string }
    Body: AdminCreditAdjustmentRequest
  }>('/api/admin/users/:id/credits', async (request, reply) => {
    const db = getDb()
    const { id: userId } = request.params
    const { rcAmount, reason } = request.body
    const adminClerkId = request.clerk.userId

    if (!Number.isInteger(rcAmount) || rcAmount === 0) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'rcAmount must be a non-zero integer' },
      })
    }

    if (!reason || reason.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'reason is required' },
      })
    }

    if (reason.length > 500) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'reason must not exceed 500 characters' },
      })
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      return reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    if (rcAmount > 0) {
      // Grant: create a new credit pack
      const now = new Date()
      const expiresAt = new Date(now)
      expiresAt.setMonth(expiresAt.getMonth() + 12)

      const [pack] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(creditPacks)
          .values({
            userId,
            packName: 'Admin Grant',
            rcTotal: rcAmount,
            rcRemaining: rcAmount,
            priceGbp: '0',
            purchasedAt: now,
            expiresAt,
          })
          .returning()

        await logAdminAction(tx, {
          adminClerkId,
          action: 'credits.grant',
          targetUserId: userId,
          targetResourceType: 'credit_pack',
          targetResourceId: created.id,
          payload: { rcAmount, reason },
        })

        return [created]
      })

      return reply.status(201).send({
        adjustment: {
          type: 'grant',
          rcAmount,
          reason,
          creditPack: {
            id: pack.id,
            packName: pack.packName,
            rcTotal: pack.rcTotal,
            rcRemaining: pack.rcRemaining,
            priceGbp: pack.priceGbp,
            purchasedAt: pack.purchasedAt.toISOString(),
            expiresAt: pack.expiresAt.toISOString(),
          },
        },
      })
    } else {
      // Correction: deduct from packs FIFO
      const absAmount = Math.abs(rcAmount)

      const result = await db.transaction(async (tx) => {
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
        if (totalAvailable < absAmount) {
          return { error: 'INSUFFICIENT_CREDITS', totalAvailable }
        }

        let remaining = absAmount
        const packsAffected: Array<{ packId: string; packName: string; rcDeducted: number }> = []

        for (const pack of packs) {
          if (remaining === 0) break
          const deduct = Math.min(remaining, pack.rcRemaining)

          await tx
            .update(creditPacks)
            .set({ rcRemaining: sql`${creditPacks.rcRemaining} - ${deduct}` })
            .where(eq(creditPacks.id, pack.id))

          packsAffected.push({ packId: pack.id, packName: pack.packName, rcDeducted: deduct })
          remaining -= deduct
        }

        await logAdminAction(tx, {
          adminClerkId,
          action: 'credits.correction',
          targetUserId: userId,
          targetResourceType: 'credit_pack',
          payload: { rcAmount, reason, packsAffected },
        })

        return { packsAffected, rcDeducted: absAmount }
      })

      if ('error' in result) {
        return reply.status(400).send({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: `User only has ${result.totalAvailable} RC available`,
          },
        })
      }

      return reply.status(201).send({
        adjustment: {
          type: 'correction',
          rcAmount,
          reason,
          rcDeducted: result.rcDeducted,
          packsAffected: result.packsAffected,
        },
      })
    }
  })
}

export default creditsRoutes

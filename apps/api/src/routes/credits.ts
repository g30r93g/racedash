import { creditPacks, users } from '@racedash/db'
import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm'
import { FastifyPluginAsync } from 'fastify'
import { getDb } from '../lib/db'
import type { ApiError, CreditBalanceResponse, CreditHistoryResponse } from '../types'

const creditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/credits/balance
  fastify.get<{ Reply: CreditBalanceResponse | ApiError }>('/api/credits/balance', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      })
      return
    }

    const packs = await db
      .select()
      .from(creditPacks)
      .where(
        and(eq(creditPacks.userId, user.id), gt(creditPacks.rcRemaining, 0), gt(creditPacks.expiresAt, new Date())),
      )
      .orderBy(asc(creditPacks.expiresAt))

    const totalRc = packs.reduce((sum, p) => sum + p.rcRemaining, 0)

    return {
      totalRc,
      packs: packs.map((p) => ({
        id: p.id,
        packName: p.packName,
        rcTotal: p.rcTotal,
        rcRemaining: p.rcRemaining,
        purchasedAt: p.purchasedAt.toISOString(),
        expiresAt: p.expiresAt.toISOString(),
      })),
    }
  })

  // GET /api/credits/history
  fastify.get<{
    Querystring: { cursor?: string; limit?: string }
    Reply: CreditHistoryResponse | ApiError
  }>('/api/credits/history', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      })
      return
    }

    const limitParam = Math.min(Math.max(parseInt(request.query.limit ?? '20', 10) || 20, 1), 100)
    const cursor = request.query.cursor

    let query = db
      .select()
      .from(creditPacks)
      .where(eq(creditPacks.userId, user.id))
      .orderBy(desc(creditPacks.purchasedAt), desc(creditPacks.id))
      .limit(limitParam + 1) // fetch one extra for nextCursor

    if (cursor) {
      // Composite keyset pagination on (purchased_at DESC, id DESC) to handle tied timestamps
      const [cursorPack] = await db
        .select({ purchasedAt: creditPacks.purchasedAt, id: creditPacks.id })
        .from(creditPacks)
        .where(eq(creditPacks.id, cursor))
        .limit(1)

      if (cursorPack) {
        query = db
          .select()
          .from(creditPacks)
          .where(
            and(
              eq(creditPacks.userId, user.id),
              or(
                lt(creditPacks.purchasedAt, cursorPack.purchasedAt),
                and(eq(creditPacks.purchasedAt, cursorPack.purchasedAt), lt(creditPacks.id, cursorPack.id)),
              ),
            ),
          )
          .orderBy(desc(creditPacks.purchasedAt), desc(creditPacks.id))
          .limit(limitParam + 1)
      }
    }

    const rows = await query

    const hasMore = rows.length > limitParam
    const purchases = rows.slice(0, limitParam)
    const nextCursor = hasMore ? purchases[purchases.length - 1].id : null

    return {
      purchases: purchases.map((p) => ({
        id: p.id,
        packName: p.packName,
        rcTotal: p.rcTotal,
        priceGbp: p.priceGbp,
        purchasedAt: p.purchasedAt.toISOString(),
        expiresAt: p.expiresAt.toISOString(),
      })),
      nextCursor,
    }
  })
}

export default creditRoutes

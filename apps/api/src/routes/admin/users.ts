import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, asc, desc, sql, ilike } from 'drizzle-orm'
import { users, licenses, creditPacks, jobs } from '@racedash/db'
import { getDb } from '../../lib/db'
import type { AdminUserListResponse, AdminUserDetailResponse } from '../../types'

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/users
  fastify.get<{
    Querystring: { search?: string; cursor?: string; limit?: string }
    Reply: AdminUserListResponse
  }>('/api/admin/users', async (request) => {
    const db = getDb()
    const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 100)
    const { search, cursor } = request.query

    const conditions = []
    if (search) {
      conditions.push(ilike(users.email, `%${search}%`))
    }
    if (cursor) {
      conditions.push(gt(users.id, cursor))
    }

    const rows = await db
      .select({
        id: users.id,
        clerkId: users.clerkId,
        email: users.email,
        createdAt: users.createdAt,
        licenseTier: sql<string | null>`(
          SELECT ${licenses.tier} FROM ${licenses}
          WHERE ${licenses.userId} = ${users.id}
            AND ${licenses.status} = 'active'
          ORDER BY ${licenses.expiresAt} DESC
          LIMIT 1
        )`,
      })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(users.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const nextCursor = hasMore ? page[page.length - 1].id : null

    return {
      users: page.map((u) => ({
        id: u.id,
        clerkId: u.clerkId,
        email: u.email,
        licenseTier: u.licenseTier as 'plus' | 'pro' | null,
        createdAt: u.createdAt.toISOString(),
      })),
      nextCursor,
    }
  })

  // GET /api/admin/users/:id
  fastify.get<{
    Params: { id: string }
    Reply: AdminUserDetailResponse
  }>('/api/admin/users/:id', async (request, reply) => {
    const db = getDb()
    const { id } = request.params

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      } as any)
      return
    }

    const userLicenses = await db
      .select()
      .from(licenses)
      .where(eq(licenses.userId, id))
      .orderBy(desc(licenses.createdAt))

    const userCreditPacks = await db
      .select()
      .from(creditPacks)
      .where(eq(creditPacks.userId, id))
      .orderBy(asc(creditPacks.expiresAt))

    const recentJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.userId, id))
      .orderBy(desc(jobs.createdAt))
      .limit(10)

    return {
      user: {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        billingCountry: user.billingCountry,
        stripeCustomerId: user.stripeCustomerId,
        createdAt: user.createdAt.toISOString(),
      },
      licenses: userLicenses.map((l) => ({
        id: l.id,
        tier: l.tier,
        status: l.status,
        stripeSubscriptionId: l.stripeSubscriptionId,
        startsAt: l.startsAt.toISOString(),
        expiresAt: l.expiresAt.toISOString(),
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      creditPacks: userCreditPacks.map((p) => ({
        id: p.id,
        packName: p.packName,
        rcTotal: p.rcTotal,
        rcRemaining: p.rcRemaining,
        priceGbp: p.priceGbp,
        purchasedAt: p.purchasedAt.toISOString(),
        expiresAt: p.expiresAt.toISOString(),
      })),
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        status: j.status,
        rcCost: j.status === 'complete' ? j.rcCost : null,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      })),
    }
  })
}

export default usersRoutes

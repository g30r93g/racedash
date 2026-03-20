import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, desc } from 'drizzle-orm'
import { users, licenses, getSlotLimit } from '@racedash/db'
import { getDb } from '../lib/db'
import type { LicenseResponse, ApiError } from '../types'

const licenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: LicenseResponse | ApiError }>('/api/license', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      })
      return
    }

    const [license] = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.userId, user.id),
          eq(licenses.status, 'active'),
          gt(licenses.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    if (!license) {
      return { license: null }
    }

    return {
      license: {
        tier: license.tier,
        status: 'active' as const,
        stripeSubscriptionId: license.stripeSubscriptionId!,
        startsAt: license.startsAt.toISOString(),
        expiresAt: license.expiresAt.toISOString(),
        maxConcurrentRenders: getSlotLimit(license.tier),
      },
    }
  })
}

export default licenseRoutes

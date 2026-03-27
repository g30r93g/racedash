import { FastifyPluginAsync } from 'fastify'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { users, licenses, getSlotLimit } from '@racedash/db'
import { getDb } from '../lib/db'
import type { LicenseResponse, ApiError } from '../types'

const licenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: LicenseResponse | ApiError }>('/api/license', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      })
      return
    }

    const now = new Date()

    // Get most recent active/cancelled license
    const [currentLicense] = await db
      .select()
      .from(licenses)
      .where(and(eq(licenses.userId, user.id), inArray(licenses.status, ['active', 'cancelled'])))
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    // Fall back to most recently expired license
    const [expiredLicense] = currentLicense
      ? [currentLicense]
      : await db
          .select()
          .from(licenses)
          .where(and(eq(licenses.userId, user.id), eq(licenses.status, 'expired')))
          .orderBy(desc(licenses.expiresAt))
          .limit(1)

    const license = currentLicense ?? expiredLicense ?? null

    if (!license) {
      return { license: null }
    }

    const effectiveStatus =
      license.status === 'cancelled' && license.expiresAt < now
        ? 'expired'
        : (license.status as 'active' | 'cancelled' | 'expired')

    return {
      license: {
        tier: license.tier,
        status: effectiveStatus,
        stripeSubscriptionId: license.stripeSubscriptionId!,
        startsAt: license.startsAt.toISOString(),
        expiresAt: license.expiresAt.toISOString(),
        maxConcurrentRenders: getSlotLimit(license.tier),
      },
    }
  })
}

export default licenseRoutes

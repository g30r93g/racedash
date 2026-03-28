import { FastifyPluginAsync } from 'fastify'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { users, licenses } from '@racedash/db'
import { getDb } from '../lib/db'
import { getClerkClient } from '../lib/clerk'
import type { AuthMeResponse, ApiError } from '../types'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: AuthMeResponse | ApiError }>('/api/auth/me', async (request, reply) => {
    const { userId: clerkUserId } = request.clerk
    const db = getDb()

    // Get user from DB
    const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId)).limit(1)

    if (!user) {
      reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User record not found' },
      })
      return
    }

    // Get name and avatar from Clerk
    const clerk = getClerkClient()
    const clerkUser = await clerk.users.getUser(clerkUserId)
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.username || user.email
    const avatarUrl = clerkUser.imageUrl || null

    // Get most recent non-expired active/cancelled license, or the most recent expired one
    const now = new Date()
    const [currentLicense] = await db
      .select()
      .from(licenses)
      .where(and(eq(licenses.userId, user.id), inArray(licenses.status, ['active', 'cancelled'])))
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    // If no active/cancelled license, look for the most recently expired one
    const [expiredLicense] = currentLicense
      ? [currentLicense]
      : await db
          .select()
          .from(licenses)
          .where(and(eq(licenses.userId, user.id), eq(licenses.status, 'expired')))
          .orderBy(desc(licenses.expiresAt))
          .limit(1)

    const license = currentLicense ?? expiredLicense ?? null

    reply.header('Cache-Control', 'no-store')

    // Determine effective status: a cancelled license past its expiry is effectively expired
    const effectiveStatus = license
      ? license.status === 'cancelled' && license.expiresAt < now
        ? 'expired'
        : (license.status as 'active' | 'cancelled' | 'expired')
      : null

    return {
      user: {
        id: user.id,
        clerkId: user.clerkId,
        email: user.email,
        name,
        avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
      license: license
        ? {
            tier: license.tier,
            status: effectiveStatus!,
            expiresAt: license.expiresAt.toISOString(),
          }
        : null,
    }
  })
}

export default authRoutes

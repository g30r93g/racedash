import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, desc } from 'drizzle-orm'
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

    // Get active license
    const [license] = await db
      .select()
      .from(licenses)
      .where(and(eq(licenses.userId, user.id), eq(licenses.status, 'active'), gt(licenses.expiresAt, new Date())))
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    reply.header('Cache-Control', 'no-store')

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
            status: 'active' as const,
            expiresAt: license.expiresAt.toISOString(),
          }
        : null,
    }
  })
}

export default authRoutes

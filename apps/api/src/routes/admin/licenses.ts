import { FastifyPluginAsync } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { users, licenses, logAdminAction } from '@racedash/db'
import { ZodError } from 'zod'
import { getDb } from '../../lib/db'
import { issueLicenseSchema, updateLicenseSchema } from './schemas'

const licensesRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/admin/users/:id/licenses
  fastify.post<{
    Params: { id: string }
    Body: { tier: string; startsAt: string; expiresAt: string }
  }>('/api/admin/users/:id/licenses', async (request, reply) => {
    let tier: 'plus' | 'pro'
    let startsAt: string
    let expiresAt: string

    try {
      const parsed = issueLicenseSchema.parse(request.body)
      tier = parsed.tier
      startsAt = parsed.startsAt
      expiresAt = parsed.expiresAt
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: err.issues.map((e) => e.message).join('; '),
          },
        })
      }
      throw err
    }

    const db = getDb()
    const { id: userId } = request.params
    const adminClerkId = request.clerk.userId
    const startsAtDate = new Date(startsAt)
    const expiresAtDate = new Date(expiresAt)

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return reply.status(404).send({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    const now = new Date()

    const [license] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(licenses)
        .values({
          userId,
          tier,
          status: 'active',
          startsAt: startsAtDate,
          expiresAt: expiresAtDate,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      await logAdminAction(tx, {
        adminClerkId,
        action: 'license.issue',
        targetUserId: userId,
        targetResourceType: 'license',
        targetResourceId: created.id,
        payload: { tier, startsAt, expiresAt },
      })

      return [created]
    })

    return reply.status(201).send({
      license: {
        id: license.id,
        userId: license.userId,
        tier: license.tier,
        status: license.status,
        stripeCustomerId: license.stripeCustomerId,
        stripeSubscriptionId: license.stripeSubscriptionId,
        startsAt: license.startsAt.toISOString(),
        expiresAt: license.expiresAt.toISOString(),
        createdAt: license.createdAt.toISOString(),
        updatedAt: license.updatedAt.toISOString(),
      },
    })
  })

  // PATCH /api/admin/users/:id/licenses/:licenseId
  fastify.patch<{
    Params: { id: string; licenseId: string }
    Body: { expiresAt?: string; status?: string }
  }>('/api/admin/users/:id/licenses/:licenseId', async (request, reply) => {
    let expiresAt: string | undefined
    let _status: 'cancelled' | undefined

    try {
      const parsed = updateLicenseSchema.parse(request.body)
      expiresAt = parsed.expiresAt
      _status = parsed.status
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: err.issues.map((e) => e.message).join('; '),
          },
        })
      }
      throw err
    }

    const db = getDb()
    const { id: userId, licenseId } = request.params
    const adminClerkId = request.clerk.userId

    const now = new Date()
    const updateData: Record<string, unknown> = { updatedAt: now }
    let action: 'license.extend' | 'license.revoke'

    if (expiresAt) {
      updateData.expiresAt = new Date(expiresAt)
      action = 'license.extend'
    } else {
      updateData.status = 'cancelled'
      action = 'license.revoke'
    }

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(licenses)
        .where(and(eq(licenses.id, licenseId), eq(licenses.userId, userId)))
        .limit(1)

      if (!existing) {
        return null
      }

      const [updated] = await tx
        .update(licenses)
        .set(updateData)
        .where(and(eq(licenses.id, licenseId), eq(licenses.userId, userId)))
        .returning()

      await logAdminAction(tx, {
        adminClerkId,
        action,
        targetUserId: userId,
        targetResourceType: 'license',
        targetResourceId: licenseId,
        payload: expiresAt ? { expiresAt } : { status: 'cancelled' },
      })

      return updated
    })

    if (!result) {
      return reply.status(404).send({
        error: { code: 'LICENSE_NOT_FOUND', message: 'License not found' },
      })
    }

    const updated = result

    return {
      license: {
        id: updated.id,
        userId: updated.userId,
        tier: updated.tier,
        status: updated.status,
        stripeCustomerId: updated.stripeCustomerId,
        stripeSubscriptionId: updated.stripeSubscriptionId,
        startsAt: updated.startsAt.toISOString(),
        expiresAt: updated.expiresAt.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }
  })
}

export default licensesRoutes

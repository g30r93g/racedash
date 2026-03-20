import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, gte, sql, desc, inArray } from 'drizzle-orm'
import { jobs, users, creditReservations, creditReservationPacks, creditPacks } from '@racedash/db'
import { getDb } from '../../lib/db'
import type { AdminJobListResponse, AdminJobDetailResponse, JobStatus } from '../../types'

const AWS_REGION = process.env.AWS_REGION ?? 'eu-west-2'

function buildSfnConsoleUrl(arn: string): string {
  return `https://${AWS_REGION}.console.aws.amazon.com/states/home?region=${AWS_REGION}#/executions/details/${arn}`
}

const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/jobs
  fastify.get<{
    Querystring: { status?: string; range?: string; cursor?: string; limit?: string }
    Reply: AdminJobListResponse
  }>('/api/admin/jobs', async (request) => {
    const db = getDb()
    const limit = Math.min(Math.max(parseInt(request.query.limit ?? '50', 10) || 50, 1), 100)
    const { status, range = '7d', cursor } = request.query

    const conditions = []

    if (status) {
      const statuses = status.split(',').filter(Boolean) as JobStatus[]
      if (statuses.length > 0) {
        conditions.push(inArray(jobs.status, statuses))
      }
    }

    if (range === '7d') {
      conditions.push(gte(jobs.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
    } else if (range === '30d') {
      conditions.push(gte(jobs.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    }

    if (cursor) {
      conditions.push(gt(jobs.id, cursor))
    }

    const rows = await db
      .select({
        id: jobs.id,
        userEmail: users.email,
        status: jobs.status,
        rcCost: jobs.rcCost,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        errorMessage: jobs.errorMessage,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const nextCursor = hasMore ? page[page.length - 1].id : null

    return {
      jobs: page.map((j) => {
        const isTerminal = j.status === 'complete' || j.status === 'failed'
        const durationSec = isTerminal
          ? Math.round((j.updatedAt.getTime() - j.createdAt.getTime()) / 1000)
          : null

        return {
          id: j.id,
          userEmail: j.userEmail,
          status: j.status,
          rcCost: j.status === 'complete' ? j.rcCost : null,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
          durationSec,
          errorMessage: j.errorMessage,
        }
      }),
      nextCursor,
    }
  })

  // GET /api/admin/jobs/:id
  fastify.get<{
    Params: { id: string }
    Reply: AdminJobDetailResponse
  }>('/api/admin/jobs/:id', async (request, reply) => {
    const db = getDb()
    const { id } = request.params

    const [row] = await db
      .select({
        id: jobs.id,
        userId: jobs.userId,
        userEmail: users.email,
        status: jobs.status,
        config: jobs.config,
        inputS3Keys: jobs.inputS3Keys,
        uploadIds: jobs.uploadIds,
        outputS3Key: jobs.outputS3Key,
        downloadExpiresAt: jobs.downloadExpiresAt,
        slotTaskToken: jobs.slotTaskToken,
        renderTaskToken: jobs.renderTaskToken,
        remotionRenderId: jobs.remotionRenderId,
        rcCost: jobs.rcCost,
        sfnExecutionArn: jobs.sfnExecutionArn,
        errorMessage: jobs.errorMessage,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .where(eq(jobs.id, id))
      .limit(1)

    if (!row) {
      return reply.status(404).send({
        error: { code: 'JOB_NOT_FOUND', message: 'Job not found' },
      } as any)
    }

    // Fetch credit reservation if exists
    let creditReservation: AdminJobDetailResponse['creditReservation'] = null

    const [reservation] = await db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.jobId, id))
      .limit(1)

    if (reservation) {
      const packBreakdown = await db
        .select({
          packId: creditReservationPacks.packId,
          packName: creditPacks.packName,
          rcDeducted: creditReservationPacks.rcDeducted,
        })
        .from(creditReservationPacks)
        .innerJoin(creditPacks, eq(creditReservationPacks.packId, creditPacks.id))
        .where(eq(creditReservationPacks.reservationId, reservation.id))

      creditReservation = {
        id: reservation.id,
        rcAmount: reservation.rcAmount,
        status: reservation.status,
        createdAt: reservation.createdAt.toISOString(),
        settledAt: reservation.settledAt?.toISOString() ?? null,
        packs: packBreakdown.map((p) => ({
          packId: p.packId,
          packName: p.packName,
          rcDeducted: p.rcDeducted,
        })),
      }
    }

    return {
      job: {
        id: row.id,
        userId: row.userId,
        userEmail: row.userEmail,
        status: row.status,
        config: row.config as Record<string, unknown>,
        inputS3Keys: row.inputS3Keys,
        uploadIds: row.uploadIds,
        outputS3Key: row.outputS3Key,
        downloadExpiresAt: row.downloadExpiresAt?.toISOString() ?? null,
        slotTaskToken: row.slotTaskToken,
        renderTaskToken: row.renderTaskToken,
        remotionRenderId: row.remotionRenderId,
        rcCost: row.rcCost,
        sfnExecutionArn: row.sfnExecutionArn,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      sfnConsoleUrl: row.sfnExecutionArn ? buildSfnConsoleUrl(row.sfnExecutionArn) : null,
      creditReservation,
    }
  })
}

export default jobsRoutes

import { FastifyPluginAsync } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { users, jobs, socialUploads } from '@racedash/db'
import { getDb } from '../lib/db'
import type { SocialUploadsListResponse, YouTubeUploadMetadata } from '../types'

const socialUploadsListRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/jobs/:id/social-uploads
  fastify.get<{
    Params: { id: string }
    Reply: SocialUploadsListResponse
  }>('/api/jobs/:id/social-uploads', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk
    const jobId = request.params.id

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1)

    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
      return
    }

    const [job] = await db
      .select({ id: jobs.id, userId: jobs.userId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) {
      reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } } as any)
      return
    }

    if (job.userId !== user.id) {
      reply.status(403).send({ error: { code: 'JOB_NOT_OWNED', message: 'You do not own this job' } } as any)
      return
    }

    const uploads = await db
      .select()
      .from(socialUploads)
      .where(eq(socialUploads.jobId, jobId))
      .orderBy(desc(socialUploads.createdAt))

    return {
      uploads: uploads.map((u) => ({
        id: u.id,
        platform: u.platform as 'youtube',
        status: u.status,
        metadata: (u.metadata ?? { title: '', description: '', privacy: 'unlisted' }) as YouTubeUploadMetadata,
        rcCost: u.rcCost,
        platformUrl: u.platformUrl,
        errorMessage: u.errorMessage,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
    }
  })
}

export default socialUploadsListRoutes

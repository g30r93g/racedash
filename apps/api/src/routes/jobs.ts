import { FastifyPluginAsync } from 'fastify'
import { eq, and, desc, sql } from 'drizzle-orm'
import {
  users, jobs, licenses,
  reserveCredits, computeCredits, checkLicenseExpiry,
  InsufficientCreditsError,
} from '@racedash/db'
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StartExecutionCommand } from '@aws-sdk/client-sfn'
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer'
import { getDb } from '../lib/db'
import { s3, sfn } from '../lib/aws'
import type {
  CreateJobRequest, CreateJobResponse,
  StartUploadRequest, StartUploadResponse,
  CompleteUploadRequest, CompleteUploadResponse,
  DownloadResponse,
  ListJobsResponse, ListJobsItem,
  JobStatusEvent, JobConfig,
} from '../types'

async function resolveUser(clerkUserId: string) {
  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1)
  return user ?? null
}

async function findOwnedJob(userId: string, jobId: string) {
  const db = getDb()
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1)
  return job ?? null
}

function computeQueuePositions(queuedJobIds: string[], allQueuedJobs: Array<{ id: string; createdAt: Date }>): Map<string, number> {
  const sorted = [...allQueuedJobs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const map = new Map<string, number>()
  sorted.forEach((j, i) => {
    if (queuedJobIds.includes(j.id)) map.set(j.id, i + 1)
  })
  return map
}

const jobRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/jobs — create a new cloud render job
  fastify.post<{ Body: CreateJobRequest; Reply: CreateJobResponse }>(
    '/api/jobs',
    async (request, reply) => {
      const db = getDb()
      const user = await resolveUser(request.clerk.userId)
      if (!user) {
        reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
        return
      }

      // Check license
      const licenseResult = await checkLicenseExpiry({ db, userId: user.id })
      if (!licenseResult.hasActiveLicense) {
        reply.status(403).send({
          error: { code: 'LICENSE_REQUIRED', message: 'An active license is required for cloud rendering' },
        } as any)
        return
      }

      const { config: reqConfig, sourceVideo, projectName, sessionType } = request.body
      if (!sourceVideo || !reqConfig) {
        reply.status(400).send({
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields: config and sourceVideo' },
        } as any)
        return
      }

      const rcCost = computeCredits({
        width: sourceVideo.width,
        height: sourceVideo.height,
        fps: sourceVideo.fps,
        durationSec: sourceVideo.durationSeconds,
      })

      // Store full config as JSONB
      const jobConfig: JobConfig = {
        resolution: reqConfig.resolution,
        frameRate: reqConfig.frameRate,
        renderMode: reqConfig.renderMode,
        overlayStyle: reqConfig.overlayStyle,
        config: reqConfig.config,
        sourceVideo,
        projectName,
        sessionType,
      }

      // Insert job first to get the ID
      const [job] = await db
        .insert(jobs)
        .values({
          userId: user.id,
          status: 'uploading',
          config: jobConfig,
          inputS3Keys: [],
          rcCost,
        })
        .returning()

      // Reserve credits
      try {
        await reserveCredits({ db, userId: user.id, jobId: job.id, rcAmount: rcCost })
      } catch (err) {
        // Clean up the job row on credit failure
        await db.delete(jobs).where(eq(jobs.id, job.id))
        if (err instanceof InsufficientCreditsError) {
          reply.status(402).send({
            error: {
              code: 'INSUFFICIENT_CREDITS',
              message: `Insufficient credits: ${err.available} available, ${err.required} required`,
            },
          } as any)
          return
        }
        throw err
      }

      const uploadKey = `uploads/${job.id}/joined.mp4`
      await db
        .update(jobs)
        .set({ inputS3Keys: [uploadKey] })
        .where(eq(jobs.id, job.id))

      reply.status(201).send({ jobId: job.id, rcCost, uploadKey })
    },
  )

  // POST /api/jobs/:id/start-upload — presigned multipart URLs
  fastify.post<{
    Params: { id: string }
    Body: StartUploadRequest
    Reply: StartUploadResponse
  }>('/api/jobs/:id/start-upload', async (request, reply) => {
    const user = await resolveUser(request.clerk.userId)
    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
      return
    }

    const job = await findOwnedJob(user.id, request.params.id)
    if (!job) {
      reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } } as any)
      return
    }
    if (job.status !== 'uploading') {
      reply.status(409).send({ error: { code: 'INVALID_JOB_STATUS', message: `Job is in '${job.status}' status, expected 'uploading'` } } as any)
      return
    }

    const bucket = process.env.S3_UPLOAD_BUCKET
    if (!bucket) throw new Error('S3_UPLOAD_BUCKET is required')

    const key = `uploads/${job.id}/joined.mp4`
    const { partCount, contentType } = request.body

    const { UploadId } = await s3.send(new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'video/mp4',
    }))

    if (!UploadId) throw new Error('Failed to create multipart upload')

    // Store uploadId on the job
    const db = getDb()
    await db
      .update(jobs)
      .set({ uploadIds: { uploadId: UploadId } })
      .where(eq(jobs.id, job.id))

    // Generate presigned URLs for each part
    const presignedUrls: Array<{ partNumber: number; url: string }> = []
    for (let i = 1; i <= partCount; i++) {
      const url = await getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
          PartNumber: i,
        }),
        { expiresIn: 3600 },
      )
      presignedUrls.push({ partNumber: i, url })
    }

    return { uploadId: UploadId, presignedUrls }
  })

  // POST /api/jobs/:id/complete-upload — complete multipart and start pipeline
  fastify.post<{
    Params: { id: string }
    Body: CompleteUploadRequest
    Reply: CompleteUploadResponse
  }>('/api/jobs/:id/complete-upload', async (request, reply) => {
    const user = await resolveUser(request.clerk.userId)
    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
      return
    }

    const job = await findOwnedJob(user.id, request.params.id)
    if (!job) {
      reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } } as any)
      return
    }
    if (job.status !== 'uploading') {
      reply.status(409).send({ error: { code: 'INVALID_JOB_STATUS', message: `Job is in '${job.status}' status, expected 'uploading'` } } as any)
      return
    }

    const bucket = process.env.S3_UPLOAD_BUCKET
    if (!bucket) throw new Error('S3_UPLOAD_BUCKET is required')

    const uploadIds = job.uploadIds as { uploadId: string } | null
    if (!uploadIds?.uploadId) {
      reply.status(409).send({ error: { code: 'UPLOAD_NOT_STARTED', message: 'Multipart upload was not started' } } as any)
      return
    }

    const key = `uploads/${job.id}/joined.mp4`
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadIds.uploadId,
      MultipartUpload: {
        Parts: request.body.parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        })),
      },
    }))

    // Start Step Functions execution
    const stateMachineArn = process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN
    if (!stateMachineArn) throw new Error('STEP_FUNCTIONS_STATE_MACHINE_ARN is required')

    const { executionArn } = await sfn.send(new StartExecutionCommand({
      stateMachineArn,
      name: `job-${job.id}-${Date.now()}`,
      input: JSON.stringify({ jobId: job.id, userId: user.id }),
    }))

    const db = getDb()
    await db
      .update(jobs)
      .set({
        status: 'queued',
        sfnExecutionArn: executionArn,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id))

    return { jobId: job.id, status: 'queued' as const, executionArn: executionArn! }
  })

  // GET /api/jobs/:id/status — SSE stream
  fastify.get<{ Params: { id: string } }>(
    '/api/jobs/:id/status',
    async (request, reply) => {
      const user = await resolveUser(request.clerk.userId)
      if (!user) {
        reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
        return
      }

      const job = await findOwnedJob(user.id, request.params.id)
      if (!job) {
        reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } } as any)
        return
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      const db = getDb()
      let closed = false

      request.raw.on('close', () => { closed = true })

      const sendEvent = (data: JobStatusEvent) => {
        if (closed) return
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      const poll = async () => {
        const [current] = await db
          .select()
          .from(jobs)
          .where(eq(jobs.id, job.id))
          .limit(1)
        if (!current) return null

        let queuePosition: number | null = null
        if (current.status === 'queued') {
          const queuedJobs = await db
            .select({ id: jobs.id, createdAt: jobs.createdAt })
            .from(jobs)
            .where(and(eq(jobs.userId, user.id), eq(jobs.status, 'queued')))

          const positions = computeQueuePositions([current.id], queuedJobs)
          queuePosition = positions.get(current.id) ?? null
        }

        const event: JobStatusEvent = {
          status: current.status as JobStatusEvent['status'],
          progress: current.status === 'rendering' ? 0 : current.status === 'complete' ? 1 : 0,
          queuePosition,
          downloadExpiresAt: current.downloadExpiresAt?.toISOString() ?? null,
          errorMessage: current.errorMessage,
        }
        sendEvent(event)

        return current.status
      }

      // Send initial status
      const initialStatus = await poll()
      if (initialStatus === 'complete' || initialStatus === 'failed') {
        reply.raw.end()
        return
      }

      // Poll every 2 seconds
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          return
        }
        const status = await poll()
        if (status === 'complete' || status === 'failed' || status === null) {
          clearInterval(interval)
          reply.raw.end()
        }
      }, 2000)

      request.raw.on('close', () => { clearInterval(interval) })

      // Keep the connection open — don't return a value (SSE is streaming)
      await reply
    },
  )

  // GET /api/jobs/:id/download — signed CloudFront URL
  fastify.get<{ Params: { id: string }; Reply: DownloadResponse }>(
    '/api/jobs/:id/download',
    async (request, reply) => {
      const user = await resolveUser(request.clerk.userId)
      if (!user) {
        reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
        return
      }

      const job = await findOwnedJob(user.id, request.params.id)
      if (!job) {
        reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } } as any)
        return
      }
      if (job.status !== 'complete') {
        reply.status(409).send({ error: { code: 'INVALID_JOB_STATUS', message: 'Job is not complete' } } as any)
        return
      }
      if (!job.downloadExpiresAt || job.downloadExpiresAt < new Date()) {
        reply.status(410).send({ error: { code: 'DOWNLOAD_EXPIRED', message: 'Download window has expired' } } as any)
        return
      }

      const domain = process.env.CLOUDFRONT_DOMAIN
      const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID
      const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY_PEM
      if (!domain || !keyPairId || !privateKey) {
        throw new Error('CloudFront signing configuration is required')
      }

      const resourceUrl = `https://${domain}/renders/${job.id}/output.mp4`
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)

      const downloadUrl = getCloudFrontSignedUrl({
        url: resourceUrl,
        keyPairId,
        privateKey,
        dateLessThan: oneHourFromNow.toISOString(),
      })

      return { downloadUrl, expiresAt: job.downloadExpiresAt.toISOString() }
    },
  )

  // GET /api/jobs — list jobs with pagination
  fastify.get<{
    Querystring: { cursor?: string; limit?: string }
    Reply: ListJobsResponse
  }>('/api/jobs', async (request, reply) => {
    const db = getDb()
    const user = await resolveUser(request.clerk.userId)
    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } } as any)
      return
    }

    const limitParam = Math.min(Math.max(parseInt(request.query.limit ?? '20', 10) || 20, 1), 100)
    const cursor = request.query.cursor

    let rows
    if (cursor) {
      const [cursorJob] = await db
        .select({ createdAt: jobs.createdAt, id: jobs.id })
        .from(jobs)
        .where(eq(jobs.id, cursor))
        .limit(1)

      if (cursorJob) {
        rows = await db
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.userId, user.id),
              sql`(${jobs.createdAt}, ${jobs.id}) < (${cursorJob.createdAt}, ${cursorJob.id})`,
            ),
          )
          .orderBy(desc(jobs.createdAt), desc(jobs.id))
          .limit(limitParam + 1)
      } else {
        rows = []
      }
    } else {
      rows = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, user.id))
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(limitParam + 1)
    }

    const hasMore = rows.length > limitParam
    const items = rows.slice(0, limitParam)
    const nextCursor = hasMore ? items[items.length - 1].id : null

    // Compute queue positions for queued jobs
    const queuedJobIds = items.filter((j) => j.status === 'queued').map((j) => j.id)
    let queuePositions = new Map<string, number>()
    if (queuedJobIds.length > 0) {
      const allQueued = await db
        .select({ id: jobs.id, createdAt: jobs.createdAt })
        .from(jobs)
        .where(and(eq(jobs.userId, user.id), eq(jobs.status, 'queued')))
      queuePositions = computeQueuePositions(queuedJobIds, allQueued)
    }

    const jobItems: ListJobsItem[] = items.map((j) => {
      const config = j.config as JobConfig
      return {
        id: j.id,
        status: j.status as ListJobsItem['status'],
        config,
        projectName: config.projectName,
        sessionType: config.sessionType,
        rcCost: j.rcCost,
        queuePosition: queuePositions.get(j.id) ?? null,
        downloadExpiresAt: j.downloadExpiresAt?.toISOString() ?? null,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt.toISOString(),
        updatedAt: j.updatedAt.toISOString(),
      }
    })

    return { jobs: jobItems, nextCursor }
  })
}

export default jobRoutes

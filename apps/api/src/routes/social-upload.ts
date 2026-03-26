import { FastifyPluginAsync } from 'fastify'
import { eq, and, gt, desc, inArray } from 'drizzle-orm'
import {
  users,
  licenses,
  jobs,
  connectedAccounts,
  socialUploads,
  reserveCredits,
  releaseCredits,
  InsufficientCreditsError,
} from '@racedash/db'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { getDb } from '../lib/db'
import type {
  SocialUploadRequest,
  SocialUploadResponse,
  SocialUploadPayload,
  YouTubeUploadMetadata,
  ApiError,
} from '../types'

const sqs = new SQSClient({})

function validateMetadata(
  metadata: unknown,
): { valid: true; data: YouTubeUploadMetadata } | { valid: false; message: string } {
  if (!metadata || typeof metadata !== 'object') {
    return { valid: false, message: 'metadata is required' }
  }

  const m = metadata as Record<string, unknown>

  if (typeof m.title !== 'string' || m.title.length === 0) {
    return { valid: false, message: 'metadata.title is required and must be a non-empty string' }
  }
  if (m.title.length > 100) {
    return { valid: false, message: 'metadata.title must be 100 characters or fewer' }
  }

  if (typeof m.description !== 'string') {
    return { valid: false, message: 'metadata.description is required and must be a string' }
  }
  if (m.description.length > 5000) {
    return { valid: false, message: 'metadata.description must be 5000 characters or fewer' }
  }

  if (!['public', 'unlisted', 'private'].includes(m.privacy as string)) {
    return { valid: false, message: 'metadata.privacy must be one of: public, unlisted, private' }
  }

  return {
    valid: true,
    data: { title: m.title, description: m.description, privacy: m.privacy as 'public' | 'unlisted' | 'private' },
  }
}

const socialUploadRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/jobs/:id/social-upload
  fastify.post<{
    Params: { id: string }
    Body: SocialUploadRequest
    Reply: SocialUploadResponse | ApiError
  }>('/api/jobs/:id/social-upload', async (request, reply) => {
    const db = getDb()
    const { userId: clerkUserId } = request.clerk
    const jobId = request.params.id

    // Look up user
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkUserId)).limit(1)

    if (!user) {
      reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User record not found' } })
      return
    }

    // Validate active license
    const [license] = await db
      .select({ id: licenses.id })
      .from(licenses)
      .where(and(eq(licenses.userId, user.id), eq(licenses.status, 'active'), gt(licenses.expiresAt, new Date())))
      .orderBy(desc(licenses.expiresAt))
      .limit(1)

    if (!license) {
      reply.status(403).send({ error: { code: 'LICENSE_REQUIRED', message: 'An active license is required' } })
      return
    }

    // Validate job exists
    const [job] = await db
      .select({ id: jobs.id, userId: jobs.userId, status: jobs.status, outputS3Key: jobs.outputS3Key })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) {
      reply.status(404).send({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } })
      return
    }

    // Validate ownership
    if (job.userId !== user.id) {
      reply.status(403).send({ error: { code: 'JOB_NOT_OWNED', message: 'You do not own this job' } })
      return
    }

    // Validate job is complete
    if (job.status !== 'complete') {
      reply
        .status(422)
        .send({ error: { code: 'JOB_NOT_COMPLETE', message: 'Only completed jobs can be uploaded to YouTube' } })
      return
    }

    // Validate YouTube connected
    const [youtubeAccount] = await db
      .select({ id: connectedAccounts.id })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, user.id), eq(connectedAccounts.platform, 'youtube')))
      .limit(1)

    if (!youtubeAccount) {
      reply.status(404).send({
        error: {
          code: 'YOUTUBE_NOT_CONNECTED',
          message: 'No YouTube account connected. Connect YouTube in the Account tab.',
        },
      })
      return
    }

    // Validate request body
    const body = request.body
    if (body.platform !== 'youtube') {
      reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: 'platform must be "youtube"' } })
      return
    }

    const metadataResult = validateMetadata(body.metadata)
    if (!metadataResult.valid) {
      reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: metadataResult.message } })
      return
    }

    // Check for duplicate active uploads
    const [existingUpload] = await db
      .select({ id: socialUploads.id })
      .from(socialUploads)
      .where(
        and(
          eq(socialUploads.jobId, jobId),
          eq(socialUploads.platform, 'youtube'),
          inArray(socialUploads.status, ['queued', 'uploading', 'processing', 'live']),
        ),
      )
      .limit(1)

    if (existingUpload) {
      reply.status(409).send({
        error: {
          code: 'UPLOAD_ALREADY_EXISTS',
          message: 'An active or completed YouTube upload already exists for this job',
        },
      })
      return
    }

    // Transaction: insert social_uploads + reserve credits
    const rcCost = 10
    let socialUploadId: string

    try {
      socialUploadId = await db.transaction(async (tx) => {
        const [upload] = await tx
          .insert(socialUploads)
          .values({
            jobId,
            userId: user.id,
            platform: 'youtube',
            status: 'queued',
            metadata: metadataResult.data,
            rcCost,
          })
          .returning({ id: socialUploads.id })

        const reservationKey = `su_${upload.id}`
        const reservation = await reserveCredits({
          db: tx,
          userId: user.id,
          jobId: reservationKey,
          rcAmount: rcCost,
        })

        await tx
          .update(socialUploads)
          .set({ creditReservationId: reservation.reservationId })
          .where(eq(socialUploads.id, upload.id))

        return upload.id
      })
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        reply.status(402).send({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits. You need at least 10 RC to upload to YouTube.',
          },
        })
        return
      }
      throw err
    }

    // Send SQS message — if this fails, clean up the DB row and release credits
    const outputS3Key = job.outputS3Key ?? `renders/${jobId}/output.mp4`
    const sqsPayload: SocialUploadPayload = {
      socialUploadId,
      reservationKey: `su_${socialUploadId}`,
      jobId,
      userId: user.id,
      platform: 'youtube',
      outputS3Key,
      metadata: metadataResult.data,
    }

    const queueUrl = process.env.SQS_SOCIAL_UPLOAD_QUEUE_URL
    if (!queueUrl) throw new Error('SQS_SOCIAL_UPLOAD_QUEUE_URL is required')

    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(sqsPayload),
        }),
      )
    } catch (sqsErr) {
      // Compensate: mark upload as failed and release credits
      await db
        .update(socialUploads)
        .set({ status: 'failed', errorMessage: 'Failed to dispatch upload job', updatedAt: new Date() })
        .where(eq(socialUploads.id, socialUploadId))
      await releaseCredits({ db, jobId: `su_${socialUploadId}` })
      throw sqsErr
    }

    reply.status(201)
    return {
      socialUploadId,
      status: 'queued' as const,
      platform: 'youtube' as const,
      rcCost,
    }
  })
}

export default socialUploadRoutes

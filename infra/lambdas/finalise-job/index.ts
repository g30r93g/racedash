import { eq } from 'drizzle-orm'
import { jobs, consumeCredits, claimNextQueuedSlotToken } from '@racedash/db'
import { getDb } from '../shared/db'
import { sendTaskSuccess } from '../shared/sfn'
import { deleteObject } from '../shared/s3'

interface FinaliseJobEvent {
  jobId: string
  userId: string
}

export const handler = async (event: FinaliseJobEvent): Promise<void> => {
  const { jobId, userId } = event
  const db = getDb()

  // Consume the reserved credits
  await consumeCredits({ db, jobId })

  // Update job to complete with download window
  const downloadExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db
    .update(jobs)
    .set({
      status: 'complete',
      outputS3Key: `renders/${jobId}/output.mp4`,
      downloadExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))

  // Clean up source upload
  const uploadBucket = process.env.S3_UPLOAD_BUCKET
  if (uploadBucket) {
    await deleteObject(uploadBucket, `uploads/${jobId}/joined.mp4`)
  }

  // Signal next queued job
  const token = await claimNextQueuedSlotToken({ db, userId })
  if (token) {
    await sendTaskSuccess(token)
  }
}

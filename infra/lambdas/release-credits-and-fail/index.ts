import { eq } from 'drizzle-orm'
import { jobs, users, releaseCredits, claimNextQueuedSlotToken } from '@racedash/db'
import { getDb } from '../shared/db'
import { sendTaskSuccess } from '../shared/sfn'
import { sendEmail } from '../shared/ses'

interface ReleaseCreditsAndFailEvent {
  jobId: string
  userId: string
  error: unknown
}

export const handler = async (event: ReleaseCreditsAndFailEvent): Promise<void> => {
  const { jobId, userId, error } = event
  const db = getDb()

  // Release the reserved credits
  await releaseCredits({ db, jobId })

  // Mark job as failed
  const errorMessage =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Unknown error'

  await db
    .update(jobs)
    .set({
      status: 'failed',
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))

  // Send failure notification — SES errors must not throw
  try {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)

    if (user) {
      const [job] = await db.select({ config: jobs.config }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

      const projectName = (job?.config as any)?.projectName ?? 'your project'

      await sendEmail({
        to: user.email,
        subject: 'Your RaceDash render failed',
        body: [
          `Hi,`,
          ``,
          `Unfortunately, your cloud render for "${projectName}" has failed.`,
          ``,
          `Error: ${errorMessage}`,
          ``,
          `Your credits have been restored to your account balance. You can retry the render from the Export tab in the desktop app.`,
          ``,
          `— RaceDash`,
        ].join('\n'),
      })
    }
  } catch (sesErr) {
    console.error('Failed to send failure notification email:', sesErr)
  }

  // Signal next queued job
  const token = await claimNextQueuedSlotToken({ db, userId })
  if (token) {
    await sendTaskSuccess(token)
  }
}

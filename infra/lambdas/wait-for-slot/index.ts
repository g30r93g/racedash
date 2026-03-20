import { eq, and, gt, desc } from 'drizzle-orm'
import { jobs, licenses, countActiveRenders, getSlotLimit } from '@racedash/db'
import { getDb } from '../shared/db'
import { sendTaskSuccess, sendTaskFailure } from '../shared/sfn'

interface WaitForSlotEvent {
  jobId: string
  userId: string
  taskToken: string
}

export const handler = async (event: WaitForSlotEvent): Promise<void> => {
  const { jobId, userId, taskToken } = event
  const db = getDb()

  // Store taskToken on the job
  await db
    .update(jobs)
    .set({ slotTaskToken: taskToken, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))

  // Look up user's license tier
  const [license] = await db
    .select({ tier: licenses.tier })
    .from(licenses)
    .where(
      and(
        eq(licenses.userId, userId),
        eq(licenses.status, 'active'),
        gt(licenses.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(licenses.expiresAt))
    .limit(1)

  if (!license) {
    await sendTaskFailure(taskToken, 'NO_ACTIVE_LICENSE', 'No active license found for user')
    return
  }

  const slotLimit = getSlotLimit(license.tier)
  const activeRenders = await countActiveRenders(db, userId)

  if (activeRenders < slotLimit) {
    await sendTaskSuccess(taskToken)
  }
}

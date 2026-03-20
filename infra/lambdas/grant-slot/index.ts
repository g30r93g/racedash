import { eq } from 'drizzle-orm'
import { jobs } from '@racedash/db'
import { getDb } from '../shared/db'

interface GrantSlotEvent {
  jobId: string
}

export const handler = async (event: GrantSlotEvent): Promise<void> => {
  const { jobId } = event
  const db = getDb()

  await db
    .update(jobs)
    .set({ status: 'rendering', updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
}

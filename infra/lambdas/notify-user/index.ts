import { eq } from 'drizzle-orm'
import { jobs, users } from '@racedash/db'
import { getDb } from '../shared/db'
import { sendEmail } from '../shared/ses'

interface NotifyUserEvent {
  jobId: string
  userId: string
}

export const handler = async (event: NotifyUserEvent): Promise<void> => {
  const { jobId, userId } = event
  const db = getDb()

  // Look up user email
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)

  if (!user) throw new Error(`User ${userId} not found`)

  // Look up project name from job config
  const [job] = await db.select({ config: jobs.config }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

  const projectName = (job?.config as any)?.projectName ?? 'your project'

  await sendEmail({
    to: user.email,
    subject: 'Your RaceDash render is ready',
    body: [
      `Hi,`,
      ``,
      `Your cloud render for "${projectName}" is complete and ready for download.`,
      ``,
      `The download will be available for 7 days. Open the RaceDash desktop app and navigate to the Cloud Renders tab to download your video.`,
      ``,
      `— RaceDash`,
    ].join('\n'),
  })
}

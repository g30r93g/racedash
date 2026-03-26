import { eq } from 'drizzle-orm'
import { jobs } from '@racedash/db'
import { getDb } from '../shared/db'

interface StartRenderOverlayEvent {
  jobId: string
  userId: string
  taskToken: string
}

interface JobConfig {
  resolution: string
  frameRate: string
  renderMode: string
  overlayStyle: string
  config: Record<string, unknown>
  sourceVideo: {
    width: number
    height: number
    fps: number
    durationSeconds: number
    fileSizeBytes: number
  }
  projectName: string
  sessionType: string
}

export const handler = async (event: StartRenderOverlayEvent): Promise<void> => {
  const { jobId, taskToken } = event
  const db = getDb()

  // Store render task token
  await db.update(jobs).set({ renderTaskToken: taskToken, updatedAt: new Date() }).where(eq(jobs.id, jobId))

  // Read job config
  const [job] = await db.select({ config: jobs.config }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

  if (!job) throw new Error(`Job ${jobId} not found`)

  const config = job.config as JobConfig

  // Lazy import Remotion to keep cold starts fast
  const { renderMediaOnLambda } = await import('@remotion/lambda/client')

  const serveUrl = process.env.REMOTION_SERVE_URL
  const functionName = process.env.REMOTION_FUNCTION_NAME
  const webhookUrl = process.env.REMOTION_WEBHOOK_URL
  const webhookSecret = process.env.REMOTION_WEBHOOK_SECRET

  if (!serveUrl || !functionName || !webhookUrl || !webhookSecret) {
    throw new Error('Remotion environment variables are required')
  }

  const { renderId } = await renderMediaOnLambda({
    serveUrl,
    functionName,
    composition: config.overlayStyle,
    inputProps: {
      ...config.config,
      sourceVideoKey: `uploads/${jobId}/joined.mp4`,
      overlayConfig: config,
    },
    codec: 'prores',
    webhook: {
      url: webhookUrl,
      secret: webhookSecret,
      customData: { taskToken, jobId },
    },
    outName: `renders/${jobId}/overlay.mov`,
    region: (process.env.AWS_REGION as any) ?? 'eu-west-2',
  })

  await db.update(jobs).set({ remotionRenderId: renderId, updatedAt: new Date() }).where(eq(jobs.id, jobId))
}

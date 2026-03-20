import type { SQSEvent } from 'aws-lambda'
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs'
import { createDb } from '@racedash/db'
import { socialUploads } from '@racedash/db'
import { eq } from 'drizzle-orm'

const ecs = new ECSClient({})

interface SocialUploadPayload {
  socialUploadId: string
  reservationKey: string
  jobId: string
  userId: string
  platform: string
  outputS3Key: string
  metadata: Record<string, unknown>
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const payload: SocialUploadPayload = JSON.parse(record.body)

    if (payload.platform !== 'youtube') {
      console.error(`Unsupported platform: ${payload.platform}`)
      throw new Error(`Unsupported platform: ${payload.platform}`)
    }

    const taskDefinitionArn = process.env.YOUTUBE_TASK_DEFINITION_ARN!
    const clusterArn = process.env.ECS_CLUSTER_ARN!
    const subnets = process.env.TASK_SUBNETS!.split(',').map((s) => s.trim())
    const securityGroup = process.env.TASK_SECURITY_GROUP!

    await ecs.send(new RunTaskCommand({
      taskDefinition: taskDefinitionArn,
      cluster: clusterArn,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets,
          securityGroups: [securityGroup],
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [{
          name: 'YouTubeUploadContainer',
          environment: [{
            name: 'UPLOAD_PAYLOAD',
            value: record.body,
          }],
        }],
      },
    }))

    // Update status to uploading
    const databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
      const db = createDb(databaseUrl)
      await db
        .update(socialUploads)
        .set({ status: 'uploading', updatedAt: new Date() })
        .where(eq(socialUploads.id, payload.socialUploadId))
    }
  }
}

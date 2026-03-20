import { eq } from 'drizzle-orm'
import { jobs } from '@racedash/db'
import { getDb } from '../shared/db'

interface PrepareCompositeEvent {
  jobId: string
}

interface JobConfig {
  sourceVideo: {
    width: number
    height: number
    fps: number
    durationSeconds: number
    fileSizeBytes: number
  }
}

interface MediaConvertConfig {
  mediaConvertRoleArn: string
  mediaConvertSettings: {
    Inputs: Array<{ FileInput: string }>
    OutputGroups: Array<{
      OutputGroupSettings: {
        Type: string
        FileGroupSettings: { Destination: string }
      }
      Outputs: Array<{
        VideoDescription: {
          CodecSettings: {
            Codec: string
            H264Settings: { Bitrate: number }
          }
        }
        ContainerSettings: { Container: string }
      }>
    }>
  }
}

function selectBitrateKbps(width: number): number {
  if (width >= 3840) return 50_000
  if (width >= 2560) return 30_000
  return 20_000
}

export const handler = async (event: PrepareCompositeEvent): Promise<MediaConvertConfig> => {
  const { jobId } = event
  const db = getDb()

  // Update status to compositing
  await db
    .update(jobs)
    .set({ status: 'compositing', updatedAt: new Date() })
    .where(eq(jobs.id, jobId))

  // Read job config for source video resolution
  const [job] = await db
    .select({ config: jobs.config })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (!job) throw new Error(`Job ${jobId} not found`)

  const config = job.config as JobConfig
  const bitrateKbps = selectBitrateKbps(config.sourceVideo.width)

  const uploadBucket = process.env.S3_UPLOAD_BUCKET
  const rendersBucket = process.env.S3_RENDERS_BUCKET
  const roleArn = process.env.MEDIACONVERT_ROLE_ARN

  if (!uploadBucket || !rendersBucket || !roleArn) {
    throw new Error('S3_UPLOAD_BUCKET, S3_RENDERS_BUCKET, and MEDIACONVERT_ROLE_ARN are required')
  }

  return {
    mediaConvertRoleArn: roleArn,
    mediaConvertSettings: {
      Inputs: [
        { FileInput: `s3://${uploadBucket}/uploads/${jobId}/joined.mp4` },
        { FileInput: `s3://${rendersBucket}/renders/${jobId}/overlay.mov` },
      ],
      OutputGroups: [{
        OutputGroupSettings: {
          Type: 'FILE_GROUP_SETTINGS',
          FileGroupSettings: {
            Destination: `s3://${rendersBucket}/renders/${jobId}/output`,
          },
        },
        Outputs: [{
          VideoDescription: {
            CodecSettings: {
              Codec: 'H_264',
              H264Settings: { Bitrate: bitrateKbps * 1000 },
            },
          },
          ContainerSettings: { Container: 'MP4' },
        }],
      }],
    },
  }
}

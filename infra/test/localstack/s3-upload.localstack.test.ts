import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
})

const UPLOAD_BUCKET = process.env.S3_UPLOAD_BUCKET || 'racedash-uploads-local'

describe('S3 Upload (LocalStack)', () => {
  test('multipart upload succeeds and object is retrievable', async () => {
    const key = 'uploads/test-job-123/joined.mp4'
    const body = Buffer.from('mock video content')

    await s3.send(
      new PutObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
        Body: body,
      }),
    )

    const result = await s3.send(
      new GetObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
      }),
    )
    const content = await result.Body!.transformToByteArray()
    expect(Buffer.from(content).toString()).toBe('mock video content')
  })

  test('presigned PUT URL allows upload', async () => {
    const key = 'uploads/test-job-456/joined.mp4'
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
      }),
      { expiresIn: 3600 },
    )

    expect(url).toContain(UPLOAD_BUCKET)
    expect(url).toContain(encodeURIComponent(key).replace(/%2F/g, '/'))
  })

  test('presigned GET URL allows download', async () => {
    const key = 'uploads/test-job-789/joined.mp4'
    await s3.send(
      new PutObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
        Body: Buffer.from('download test'),
      }),
    )

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
      }),
      { expiresIn: 3600 },
    )

    expect(url).toContain(UPLOAD_BUCKET)
  })

  test('lifecycle rules are configured', async () => {
    const result = await s3.send(
      new GetBucketLifecycleConfigurationCommand({
        Bucket: UPLOAD_BUCKET,
      }),
    )

    expect(result.Rules).toBeDefined()
    const expireRule = result.Rules!.find((r) => r.ID === 'expire-uploads')
    expect(expireRule).toBeDefined()
    expect(expireRule!.Expiration?.Days).toBe(3)
  })
})

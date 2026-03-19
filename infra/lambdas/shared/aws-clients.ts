import { S3Client } from '@aws-sdk/client-s3'
import { SFNClient } from '@aws-sdk/client-sfn'
import { SQSClient } from '@aws-sdk/client-sqs'
import { SESClient } from '@aws-sdk/client-ses'

const endpoint = process.env.AWS_ENDPOINT_URL

export const s3 = new S3Client({ ...(endpoint && { endpoint, forcePathStyle: true }) })
export const sfn = new SFNClient({ ...(endpoint && { endpoint }) })
export const sqs = new SQSClient({ ...(endpoint && { endpoint }) })
export const ses = new SESClient({ ...(endpoint && { endpoint }) })

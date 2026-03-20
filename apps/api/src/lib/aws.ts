import { S3Client } from '@aws-sdk/client-s3'
import { SFNClient } from '@aws-sdk/client-sfn'

const endpoint = process.env.AWS_ENDPOINT_URL

export const s3 = new S3Client({ ...(endpoint && { endpoint, forcePathStyle: true }) })
export const sfn = new SFNClient({ ...(endpoint && { endpoint }) })

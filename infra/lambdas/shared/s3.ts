import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from './aws-clients'

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

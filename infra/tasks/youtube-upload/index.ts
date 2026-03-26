import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { createDb, socialUploads, connectedAccounts, consumeCredits, releaseCredits } from '@racedash/db'
import { eq, and } from 'drizzle-orm'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Readable } from 'node:stream'

// ── Types ─────────────────────────────────────────────────────────────────

interface SocialUploadPayload {
  socialUploadId: string
  reservationKey: string
  jobId: string
  userId: string
  platform: 'youtube'
  outputS3Key: string
  metadata: {
    title: string
    description: string
    privacy: 'public' | 'unlisted' | 'private'
  }
}

// ── Token encryption (duplicated from API — runs in isolated Fargate container) ──

function decryptToken(encrypted: string): string {
  const hex = process.env.TOKEN_ENCRYPTION_KEY!
  const key = Buffer.from(hex, 'hex')
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const ciphertext = Buffer.from(parts[2], 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function encryptToken(plaintext: string): string {
  const hex = process.env.TOKEN_ENCRYPTION_KEY!
  const key = Buffer.from(hex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

// ── AWS clients ───────────────────────────────────────────────────────────

const s3 = new S3Client({})
const ses = new SESClient({})

// ── YouTube API helpers ───────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error('TOKEN_REFRESH_FAILED')
  }

  const data = (await response.json()) as { access_token: string }
  return data.access_token
}

async function youtubeApiFetch(
  url: string,
  opts: RequestInit & { accessToken: string; refreshToken: string; db: any; userId: string },
): Promise<Response> {
  const { accessToken, refreshToken, db, userId, ...fetchOpts } = opts

  let response = await fetch(url, {
    ...fetchOpts,
    headers: { ...(fetchOpts.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` },
  })

  if (response.status === 401) {
    // Try refreshing the token
    let newAccessToken: string
    try {
      newAccessToken = await refreshAccessToken(refreshToken)
    } catch {
      throw new Error('YouTube access revoked. Please reconnect your YouTube account in Settings.')
    }

    // Store new encrypted token
    const encryptedNewToken = encryptToken(newAccessToken)
    await db
      .update(connectedAccounts)
      .set({ accessToken: encryptedNewToken })
      .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.platform, 'youtube')))

    // Retry with new token
    response = await fetch(url, {
      ...fetchOpts,
      headers: { ...(fetchOpts.headers as Record<string, string>), Authorization: `Bearer ${newAccessToken}` },
    })

    if (response.status === 401) {
      throw new Error('YouTube access revoked. Please reconnect your YouTube account in Settings.')
    }
  }

  return response
}

// ── Failure handling ──────────────────────────────────────────────────────

async function failUpload(
  db: any,
  payload: SocialUploadPayload,
  errorMessage: string,
  userEmail?: string,
): Promise<void> {
  await db
    .update(socialUploads)
    .set({ status: 'failed', errorMessage, updatedAt: new Date() })
    .where(eq(socialUploads.id, payload.socialUploadId))

  await releaseCredits({ db, jobId: payload.reservationKey })

  if (userEmail) {
    try {
      await ses.send(
        new SendEmailCommand({
          Source: process.env.SES_FROM_ADDRESS!,
          Destination: { ToAddresses: [userEmail] },
          Message: {
            Subject: { Data: 'RaceDash Cloud — YouTube Upload Failed' },
            Body: {
              Text: {
                Data: `Your YouTube upload for "${payload.metadata.title}" failed: ${errorMessage}\n\nYour 10 RC have been refunded. You can retry the upload from the Cloud Renders tab in RaceDash Desktop.`,
              },
            },
          },
        }),
      )
    } catch (emailErr) {
      console.error('Failed to send failure notification email:', emailErr)
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const payloadJson = process.env.UPLOAD_PAYLOAD
  if (!payloadJson) {
    console.error('UPLOAD_PAYLOAD environment variable is required')
    process.exit(0)
  }

  const payload: SocialUploadPayload = JSON.parse(payloadJson)
  const db = createDb(process.env.DATABASE_URL!)

  // Look up user email for failure notifications
  const { users } = await import('@racedash/db')
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, payload.userId)).limit(1)
  const userEmail = user?.email

  // Look up YouTube connected account
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, payload.userId), eq(connectedAccounts.platform, 'youtube')))
    .limit(1)

  if (!account) {
    await failUpload(
      db,
      payload,
      'YouTube account not connected. Please reconnect your YouTube account in Settings.',
      userEmail,
    )
    process.exit(0)
  }

  let accessToken: string
  let refreshToken: string

  try {
    accessToken = decryptToken(account.accessToken)
    refreshToken = account.refreshToken ? decryptToken(account.refreshToken) : ''
  } catch {
    await failUpload(
      db,
      payload,
      'Failed to decrypt YouTube credentials. Please reconnect your YouTube account.',
      userEmail,
    )
    process.exit(0)
  }

  // Get file size from S3
  const bucket = process.env.S3_RENDERS_BUCKET!
  let fileSize: number

  try {
    const headResult = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: payload.outputS3Key }))
    fileSize = headResult.ContentLength ?? 0
    if (fileSize <= 0) {
      await failUpload(db, payload, 'Render output file is empty or has unknown size.', userEmail)
      process.exit(0)
    }
  } catch {
    await failUpload(db, payload, 'Render output not found. The download window may have expired.', userEmail)
    process.exit(0)
  }

  try {
    // Initiate resumable upload
    const initResponse = await youtubeApiFetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': String(fileSize),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title: payload.metadata.title,
            description: payload.metadata.description,
            categoryId: '17', // Sports
          },
          status: {
            privacyStatus: payload.metadata.privacy,
          },
        }),
        accessToken,
        refreshToken,
        db,
        userId: payload.userId,
      },
    )

    if (!initResponse.ok) {
      const errBody = await initResponse.text()
      if (initResponse.status === 403) {
        await failUpload(db, payload, 'YouTube API quota exceeded. Please try again tomorrow.', userEmail)
        process.exit(0)
      }
      if (initResponse.status === 400) {
        await failUpload(db, payload, `Invalid video metadata: ${errBody}`, userEmail)
        process.exit(0)
      }
      throw new Error(`YouTube upload init failed: ${initResponse.status} ${errBody}`)
    }

    const uploadUrl: string | null = initResponse.headers.get('Location')
    if (!uploadUrl) throw new Error('No upload URL returned from YouTube')
    const uploadEndpoint: string = uploadUrl

    // Stream S3 object to YouTube in 8 MB chunks
    const CHUNK_SIZE = 8 * 1024 * 1024
    let bytesUploaded = 0
    const uploadStartTime = Date.now()
    const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000

    // Get the S3 object stream
    const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: payload.outputS3Key }))
    const bodyStream = getResult.Body as Readable

    let currentBuffer = Buffer.alloc(0)
    let lastPutResponse: Response | null = null

    async function uploadChunkToYouTube(chunk: Buffer, isFinal: boolean): Promise<Response> {
      if (Date.now() - uploadStartTime > UPLOAD_TIMEOUT_MS) {
        await failUpload(db, payload, 'Upload timed out. Please try again with a smaller file.', userEmail)
        process.exit(0)
      }

      const end = bytesUploaded + chunk.length - 1
      const response = await fetch(uploadEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${bytesUploaded}-${end}/${fileSize}`,
          'Content-Type': 'video/mp4',
        },
        body: chunk,
      })

      if (isFinal) {
        if (response.status !== 200 && response.status !== 201) {
          throw new Error(`YouTube upload final chunk failed: ${response.status}`)
        }
      } else {
        if (response.status !== 308 && response.status !== 200 && response.status !== 201) {
          throw new Error(`YouTube upload chunk failed: ${response.status}`)
        }
      }

      bytesUploaded += chunk.length
      return response
    }

    for await (const chunk of bodyStream) {
      currentBuffer = Buffer.concat([currentBuffer, chunk as Buffer])

      while (currentBuffer.length >= CHUNK_SIZE) {
        const uploadChunk = currentBuffer.subarray(0, CHUNK_SIZE)
        currentBuffer = currentBuffer.subarray(CHUNK_SIZE)

        const isFinal = currentBuffer.length === 0 && bytesUploaded + uploadChunk.length === fileSize
        lastPutResponse = await uploadChunkToYouTube(uploadChunk, isFinal)
      }
    }

    // Upload any remaining bytes
    if (currentBuffer.length > 0) {
      lastPutResponse = await uploadChunkToYouTube(currentBuffer, true)
    }

    if (!lastPutResponse) {
      throw new Error('No upload response received — file may be empty')
    }

    // Extract video ID from the final response
    const uploadResult = (await lastPutResponse.json()) as { id: string }
    const videoId = uploadResult.id

    // Update status to processing
    await db
      .update(socialUploads)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(socialUploads.id, payload.socialUploadId))

    // Poll for processing completion
    let pollDelay = 10_000
    const maxPollTime = 30 * 60 * 1000
    const pollStart = Date.now()

    while (Date.now() - pollStart < maxPollTime) {
      await new Promise((resolve) => setTimeout(resolve, pollDelay))

      const statusResponse = await youtubeApiFetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=status`,
        { accessToken, refreshToken, db, userId: payload.userId },
      )

      if (statusResponse.ok) {
        const statusData = (await statusResponse.json()) as { items: Array<{ status: { uploadStatus: string } }> }
        if (statusData.items?.[0]?.status?.uploadStatus === 'processed') {
          // Success
          const platformUrl = `https://youtube.com/watch?v=${videoId}`

          await db
            .update(socialUploads)
            .set({ status: 'live', platformUrl, updatedAt: new Date() })
            .where(eq(socialUploads.id, payload.socialUploadId))

          await consumeCredits({ db, jobId: payload.reservationKey })

          await db
            .update(connectedAccounts)
            .set({ lastUsedAt: new Date() })
            .where(and(eq(connectedAccounts.userId, payload.userId), eq(connectedAccounts.platform, 'youtube')))

          console.log(`Upload complete: ${platformUrl}`)
          process.exit(0)
        }

        if (statusData.items?.[0]?.status?.uploadStatus === 'failed') {
          await failUpload(
            db,
            payload,
            'YouTube rejected the video during processing. Please check the video format and try again.',
            userEmail,
          )
          process.exit(0)
        }
      }

      pollDelay = Math.min(pollDelay * 2, 60_000)
    }

    // Processing timeout
    await failUpload(
      db,
      payload,
      'YouTube processing timed out. The video may still be processing — check your YouTube Studio.',
      userEmail,
    )
    process.exit(0)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during upload'

    if (message.includes('YouTube access revoked')) {
      await failUpload(db, payload, message, userEmail)
    } else if (message.includes('NetworkError') || message.includes('fetch failed')) {
      await failUpload(db, payload, 'Network error during upload. Please try again.', userEmail)
    } else {
      await failUpload(db, payload, message, userEmail)
    }

    process.exit(0)
  }
}

main().catch((err) => {
  console.error('Unhandled error in YouTube upload task:', err)
  process.exit(0) // Exit 0 to prevent ECS retry — failure is terminal
})

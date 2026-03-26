import { describe, it, expect } from 'vitest'
import type { StartUploadResponse } from '../../src/types'

// Mirrors the presigned URL structure from POST /api/jobs/:id/start-upload

function buildPresignedUrlResponse(opts: { uploadId: string; jobId: string; partCount: number }): StartUploadResponse {
  const presignedUrls: Array<{ partNumber: number; url: string }> = []
  for (let i = 1; i <= opts.partCount; i++) {
    presignedUrls.push({
      partNumber: i,
      url: `https://s3.eu-west-2.amazonaws.com/racedash-uploads/uploads/${opts.jobId}/joined.mp4?partNumber=${i}&uploadId=${opts.uploadId}`,
    })
  }
  return {
    uploadId: opts.uploadId,
    presignedUrls,
  }
}

describe('Presigned URL structure snapshot', () => {
  it('Matches snapshot for fixed jobId and partCount=3', () => {
    const response = buildPresignedUrlResponse({
      uploadId: 'upload-abc-123',
      jobId: 'job-fixed-id',
      partCount: 3,
    })

    expect(response).toMatchInlineSnapshot(`
      {
        "presignedUrls": [
          {
            "partNumber": 1,
            "url": "https://s3.eu-west-2.amazonaws.com/racedash-uploads/uploads/job-fixed-id/joined.mp4?partNumber=1&uploadId=upload-abc-123",
          },
          {
            "partNumber": 2,
            "url": "https://s3.eu-west-2.amazonaws.com/racedash-uploads/uploads/job-fixed-id/joined.mp4?partNumber=2&uploadId=upload-abc-123",
          },
          {
            "partNumber": 3,
            "url": "https://s3.eu-west-2.amazonaws.com/racedash-uploads/uploads/job-fixed-id/joined.mp4?partNumber=3&uploadId=upload-abc-123",
          },
        ],
        "uploadId": "upload-abc-123",
      }
    `)
  })
})

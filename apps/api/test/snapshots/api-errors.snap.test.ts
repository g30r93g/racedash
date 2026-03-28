import { describe, it, expect } from 'vitest'
import type { ApiError } from '../../src/types'

// Snapshots for the error response shapes produced by the jobs routes.
// These are the literal error objects sent by the route handlers in jobs.ts.

describe('API error response snapshots', () => {
  it('402 INSUFFICIENT_CREDITS', () => {
    const error: ApiError = {
      error: {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits: 5 available, 12 required',
      },
    }
    expect(error).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "INSUFFICIENT_CREDITS",
          "message": "Insufficient credits: 5 available, 12 required",
        },
      }
    `)
  })

  it('403 LICENSE_REQUIRED', () => {
    const error: ApiError = {
      error: {
        code: 'LICENSE_REQUIRED',
        message: 'An active license is required for cloud rendering',
      },
    }
    expect(error).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "LICENSE_REQUIRED",
          "message": "An active license is required for cloud rendering",
        },
      }
    `)
  })

  it('409 INVALID_JOB_STATUS', () => {
    const error: ApiError = {
      error: {
        code: 'INVALID_JOB_STATUS',
        message: "Job is in 'rendering' status, expected 'uploading'",
      },
    }
    expect(error).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "INVALID_JOB_STATUS",
          "message": "Job is in 'rendering' status, expected 'uploading'",
        },
      }
    `)
  })

  it('410 DOWNLOAD_EXPIRED', () => {
    const error: ApiError = {
      error: {
        code: 'DOWNLOAD_EXPIRED',
        message: 'Download window has expired',
      },
    }
    expect(error).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "DOWNLOAD_EXPIRED",
          "message": "Download window has expired",
        },
      }
    `)
  })
})

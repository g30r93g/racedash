import { describe, it, expect } from 'vitest'
import type { JobStatusEvent, JobStatus } from '../../src/types'

// Mirrors the SSE event construction from GET /api/jobs/:id/status in jobs.ts

function buildSseEvent(opts: {
  status: JobStatus
  queuePosition?: number | null
  downloadExpiresAt?: string | null
  errorMessage?: string | null
}): JobStatusEvent {
  return {
    status: opts.status,
    progress: opts.status === 'rendering' ? 0 : opts.status === 'complete' ? 1 : 0,
    queuePosition: opts.queuePosition ?? null,
    downloadExpiresAt: opts.downloadExpiresAt ?? null,
    errorMessage: opts.errorMessage ?? null,
  }
}

describe('SSE event shape snapshots', () => {
  it('uploading event', () => {
    expect(buildSseEvent({ status: 'uploading' })).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": null,
        "progress": 0,
        "queuePosition": null,
        "status": "uploading",
      }
    `)
  })

  it('queued event', () => {
    expect(buildSseEvent({ status: 'queued', queuePosition: 3 })).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": null,
        "progress": 0,
        "queuePosition": 3,
        "status": "queued",
      }
    `)
  })

  it('rendering event', () => {
    expect(buildSseEvent({ status: 'rendering' })).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": null,
        "progress": 0,
        "queuePosition": null,
        "status": "rendering",
      }
    `)
  })

  it('compositing event', () => {
    expect(buildSseEvent({ status: 'compositing' })).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": null,
        "progress": 0,
        "queuePosition": null,
        "status": "compositing",
      }
    `)
  })

  it('complete event', () => {
    expect(
      buildSseEvent({
        status: 'complete',
        downloadExpiresAt: '2026-03-27T12:00:00.000Z',
      }),
    ).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": "2026-03-27T12:00:00.000Z",
        "errorMessage": null,
        "progress": 1,
        "queuePosition": null,
        "status": "complete",
      }
    `)
  })

  it('failed event', () => {
    expect(
      buildSseEvent({
        status: 'failed',
        errorMessage: 'Remotion render timeout',
      }),
    ).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": "Remotion render timeout",
        "progress": 0,
        "queuePosition": null,
        "status": "failed",
      }
    `)
  })
})

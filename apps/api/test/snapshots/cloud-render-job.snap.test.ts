import { describe, it, expect } from 'vitest'
import type {
  JobConfig,
  JobStatus,
  JobStatusEvent,
  CreateJobRequest,
  CreateJobResponse,
  StartUploadRequest,
  StartUploadResponse,
  CompleteUploadRequest,
  CompleteUploadResponse,
  DownloadResponse,
  ListJobsItem,
  ListJobsResponse,
} from '../../src/types'

// Snapshot the shape of the CloudRenderJob-related interfaces
// by creating canonical sample objects that conform to the types.

describe('CloudRenderJob interface snapshots', () => {
  it('JobConfig shape', () => {
    const config: JobConfig = {
      resolution: '1920x1080',
      frameRate: '60',
      renderMode: 'overlay',
      overlayStyle: 'minimal',
      config: { theme: 'dark', showSpeed: true },
      sourceVideo: {
        width: 1920,
        height: 1080,
        fps: 60,
        durationSeconds: 120,
        fileSizeBytes: 524_288_000,
      },
      projectName: 'Silverstone GP',
      sessionType: 'race',
    }

    expect(config).toMatchInlineSnapshot(`
      {
        "config": {
          "showSpeed": true,
          "theme": "dark",
        },
        "frameRate": "60",
        "overlayStyle": "minimal",
        "projectName": "Silverstone GP",
        "renderMode": "overlay",
        "resolution": "1920x1080",
        "sessionType": "race",
        "sourceVideo": {
          "durationSeconds": 120,
          "fileSizeBytes": 524288000,
          "fps": 60,
          "height": 1080,
          "width": 1920,
        },
      }
    `)
  })

  it('ListJobsItem shape', () => {
    const item: ListJobsItem = {
      id: 'job-001',
      status: 'complete',
      config: {
        resolution: '1920x1080',
        frameRate: '60',
        renderMode: 'overlay',
        overlayStyle: 'minimal',
        config: {},
        sourceVideo: {
          width: 1920,
          height: 1080,
          fps: 60,
          durationSeconds: 90,
          fileSizeBytes: 400_000_000,
        },
        projectName: 'Brands Hatch',
        sessionType: 'qualifying',
      },
      projectName: 'Brands Hatch',
      sessionType: 'qualifying',
      rcCost: 2,
      queuePosition: null,
      downloadExpiresAt: '2026-03-27T12:00:00.000Z',
      errorMessage: null,
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-20T10:05:00.000Z',
    }

    expect(item).toMatchInlineSnapshot(`
      {
        "config": {
          "config": {},
          "frameRate": "60",
          "overlayStyle": "minimal",
          "projectName": "Brands Hatch",
          "renderMode": "overlay",
          "resolution": "1920x1080",
          "sessionType": "qualifying",
          "sourceVideo": {
            "durationSeconds": 90,
            "fileSizeBytes": 400000000,
            "fps": 60,
            "height": 1080,
            "width": 1920,
          },
        },
        "createdAt": "2026-03-20T10:00:00.000Z",
        "downloadExpiresAt": "2026-03-27T12:00:00.000Z",
        "errorMessage": null,
        "id": "job-001",
        "projectName": "Brands Hatch",
        "queuePosition": null,
        "rcCost": 2,
        "sessionType": "qualifying",
        "status": "complete",
        "updatedAt": "2026-03-20T10:05:00.000Z",
      }
    `)
  })

  it('JobStatusEvent shape', () => {
    const event: JobStatusEvent = {
      status: 'rendering',
      progress: 0,
      queuePosition: null,
      downloadExpiresAt: null,
      errorMessage: null,
    }

    expect(event).toMatchInlineSnapshot(`
      {
        "downloadExpiresAt": null,
        "errorMessage": null,
        "progress": 0,
        "queuePosition": null,
        "status": "rendering",
      }
    `)
  })
})

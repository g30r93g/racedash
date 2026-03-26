import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createWriteStream } from 'node:fs'
import { fetchWithAuth } from './api-client'
import type {
  CreateCloudJobOpts, CreateCloudJobResult,
  StartUploadOpts, StartUploadResult,
  CompletedPart, CompleteUploadResult,
  DownloadUrlResult, ListJobsResult,
  VideoInfo,
} from '../types/ipc'

const API_URL = import.meta.env.VITE_API_URL ?? ''

// Track active uploads for cancellation
const activeUploads = new Map<string, AbortController>()

function computeCreditsLocal(sourceVideo: VideoInfo, _resolution: string, _frameRate: string): number {
  const durationMin = sourceVideo.durationSeconds / 60
  const resFactor = sourceVideo.width >= 3840 ? 3.0 : 1.0
  const fpsFactor = sourceVideo.fps >= 120 ? 1.75 : 1.0
  return Math.ceil(durationMin * resFactor * fpsFactor)
}

export function registerCloudRenderHandlers(): void {
  // Create a cloud render job
  ipcMain.handle(
    'racedash:cloudRender:createJob',
    async (_event, opts: CreateCloudJobOpts): Promise<CreateCloudJobResult> => {
      return fetchWithAuth<CreateCloudJobResult>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(opts),
      })
    },
  )

  // Start multipart upload
  ipcMain.handle(
    'racedash:cloudRender:startUpload',
    async (_event, jobId: string, opts: StartUploadOpts): Promise<StartUploadResult> => {
      return fetchWithAuth<StartUploadResult>(`/api/jobs/${jobId}/start-upload`, {
        method: 'POST',
        body: JSON.stringify(opts),
      })
    },
  )

  // Upload a single part — main process handles the HTTP PUT
  ipcMain.handle(
    'racedash:cloudRender:uploadPart',
    async (_event, jobId: string, url: string, filePath: string, partNumber: number, offset: number, size: number) => {
      // Register an AbortController so cancelUpload can abort in-flight fetches
      let controller = activeUploads.get(jobId)
      if (!controller) {
        controller = new AbortController()
        activeUploads.set(jobId, controller)
      }

      const fd = fs.openSync(filePath, 'r')
      const buffer = Buffer.alloc(size)
      fs.readSync(fd, buffer, 0, size, offset)
      fs.closeSync(fd)

      const response = await fetch(url, {
        method: 'PUT',
        body: buffer,
        headers: { 'Content-Length': String(size) },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Upload part ${partNumber} failed: ${response.status}`)
      }

      const etag = response.headers.get('etag') ?? ''
      return { partNumber, etag }
    },
  )

  // Complete upload and start the pipeline
  ipcMain.handle(
    'racedash:cloudRender:completeUpload',
    async (_event, jobId: string, parts: CompletedPart[]): Promise<CompleteUploadResult> => {
      activeUploads.delete(jobId)
      return fetchWithAuth<CompleteUploadResult>(`/api/jobs/${jobId}/complete-upload`, {
        method: 'POST',
        body: JSON.stringify({ parts }),
      })
    },
  )

  // Cancel upload
  ipcMain.handle(
    'racedash:cloudRender:cancelUpload',
    async (_event, jobId: string): Promise<void> => {
      const controller = activeUploads.get(jobId)
      if (controller) {
        controller.abort()
        activeUploads.delete(jobId)
      }
    },
  )

  // Get SSE status URL
  ipcMain.handle(
    'racedash:cloudRender:getStatusUrl',
    async (_event, jobId: string): Promise<string> => {
      return `${API_URL}/api/jobs/${jobId}/status`
    },
  )

  // Get download URL
  ipcMain.handle(
    'racedash:cloudRender:getDownloadUrl',
    async (_event, jobId: string): Promise<DownloadUrlResult> => {
      return fetchWithAuth<DownloadUrlResult>(`/api/jobs/${jobId}/download`)
    },
  )

  // Download render to a local path
  ipcMain.handle(
    'racedash:cloudRender:downloadRender',
    async (_event, jobId: string, outputPath: string): Promise<void> => {
      const { downloadUrl } = await fetchWithAuth<DownloadUrlResult>(`/api/jobs/${jobId}/download`)

      const response = await fetch(downloadUrl)
      if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.status}`)
      }

      const dir = path.dirname(outputPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      await pipeline(
        Readable.fromWeb(response.body as any),
        createWriteStream(outputPath),
      )
    },
  )

  // List jobs
  ipcMain.handle(
    'racedash:cloudRender:listJobs',
    async (_event, cursor?: string): Promise<ListJobsResult> => {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      const qs = params.toString()
      const url = qs ? `/api/jobs?${qs}` : '/api/jobs'
      const result = await fetchWithAuth<any>(url)
      // Map API response to CloudRenderJob shape
      return {
        jobs: result.jobs.map((j: any) => ({
          id: j.id,
          projectName: j.projectName,
          sessionType: j.sessionType,
          status: j.status,
          config: {
            resolution: j.config?.resolution,
            frameRate: j.config?.frameRate,
            renderMode: j.config?.renderMode,
          },
          rcCost: j.rcCost,
          queuePosition: j.queuePosition,
          progress: 0,
          downloadExpiresAt: j.downloadExpiresAt,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt,
        })),
        nextCursor: result.nextCursor,
      }
    },
  )

  // Get actual file size (used by renderer to compute correct part count)
  ipcMain.handle(
    'racedash:cloudRender:getFileSize',
    (_event, filePath: string): number => {
      return fs.statSync(filePath).size
    },
  )

  // Estimate cost (pure, no network)
  ipcMain.handle(
    'racedash:cloudRender:estimateCost',
    (_event, sourceVideo: VideoInfo, resolution: string, frameRate: string): number => {
      return computeCreditsLocal(sourceVideo, resolution, frameRate)
    },
  )
}

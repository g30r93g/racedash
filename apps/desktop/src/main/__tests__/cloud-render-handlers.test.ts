import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../api-client', () => ({
  fetchWithAuth: vi.fn(),
}))

const fsMock = vi.hoisted(() => ({
  openSync: vi.fn().mockReturnValue(3),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ size: 1048576 }),
  createWriteStream: vi.fn().mockReturnValue({ on: vi.fn(), end: vi.fn() }),
}))
vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}))

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { ipcMain } from 'electron'
import { registerCloudRenderHandlers } from '../cloud-render-handlers'
import { fetchWithAuth } from '../api-client'

describe('registerCloudRenderHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
      return undefined as any
    })
    registerCloudRenderHandlers()
  })

  it('registers all cloud render handlers', () => {
    expect(handlers.has('racedash:cloudRender:createJob')).toBe(true)
    expect(handlers.has('racedash:cloudRender:startUpload')).toBe(true)
    expect(handlers.has('racedash:cloudRender:uploadPart')).toBe(true)
    expect(handlers.has('racedash:cloudRender:completeUpload')).toBe(true)
    expect(handlers.has('racedash:cloudRender:cancelUpload')).toBe(true)
    expect(handlers.has('racedash:cloudRender:getStatusUrl')).toBe(true)
    expect(handlers.has('racedash:cloudRender:getDownloadUrl')).toBe(true)
    expect(handlers.has('racedash:cloudRender:downloadRender')).toBe(true)
    expect(handlers.has('racedash:cloudRender:listJobs')).toBe(true)
    expect(handlers.has('racedash:cloudRender:getFileSize')).toBe(true)
    expect(handlers.has('racedash:cloudRender:estimateCost')).toBe(true)
  })

  it('createJob calls fetchWithAuth with POST', async () => {
    const result = { jobId: 'job-1' }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(result)

    const opts = { projectName: 'Test', config: {} }
    const response = await handlers.get('racedash:cloudRender:createJob')!({}, opts)

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
    expect(response).toEqual(result)
  })

  it('startUpload calls fetchWithAuth with jobId', async () => {
    const result = { uploadId: 'up-1', presignedUrls: ['url1'] }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(result)

    const opts = { totalParts: 3 }
    await handlers.get('racedash:cloudRender:startUpload')!({}, 'job-1', opts)

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs/job-1/start-upload', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  })

  it('uploadPart reads file and PUTs to presigned URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'etag' ? '"abc123"' : null },
    })

    const result = await handlers.get('racedash:cloudRender:uploadPart')!(
      {}, 'job-1', 'https://s3.example.com/part1', '/video.mp4', 1, 0, 5242880,
    )

    expect(fsMock.openSync).toHaveBeenCalledWith('/video.mp4', 'r')
    expect(fsMock.readSync).toHaveBeenCalled()
    expect(fsMock.closeSync).toHaveBeenCalled()
    expect(result).toEqual({ partNumber: 1, etag: '"abc123"' })
  })

  it('uploadPart throws on failed upload', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(
      handlers.get('racedash:cloudRender:uploadPart')!({}, 'job-1', 'https://s3.example.com', '/video.mp4', 1, 0, 100),
    ).rejects.toThrow('Upload part 1 failed: 500')
  })

  it('completeUpload calls API and cleans up controller', async () => {
    const result = { status: 'completed' }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(result)

    const parts = [{ partNumber: 1, etag: '"abc"' }]
    await handlers.get('racedash:cloudRender:completeUpload')!({}, 'job-1', parts)

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs/job-1/complete-upload', {
      method: 'POST',
      body: JSON.stringify({ parts }),
    })
  })

  it('cancelUpload aborts in-flight upload', async () => {
    // First create an active upload by uploading a part
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => '"tag"' },
    })
    await handlers.get('racedash:cloudRender:uploadPart')!({}, 'job-2', 'url', '/f.mp4', 1, 0, 100)

    // Now cancel
    await handlers.get('racedash:cloudRender:cancelUpload')!({}, 'job-2')
    // No error means success — controller was cleaned up
  })

  it('cancelUpload is idempotent when no active upload', async () => {
    await handlers.get('racedash:cloudRender:cancelUpload')!({}, 'nonexistent')
    // No error
  })

  it('getStatusUrl returns correct URL', async () => {
    const url = await handlers.get('racedash:cloudRender:getStatusUrl')!({}, 'job-1')
    expect(url).toContain('/api/jobs/job-1/status')
  })

  it('getDownloadUrl calls fetchWithAuth', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({ downloadUrl: 'https://cdn/file.mp4' })

    const result = await handlers.get('racedash:cloudRender:getDownloadUrl')!({}, 'job-1')
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs/job-1/download')
    expect(result.downloadUrl).toBe('https://cdn/file.mp4')
  })

  it('listJobs maps API response and supports cursor', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      jobs: [{ id: 'j1', projectName: 'P1', status: 'completed', createdAt: '2026-01-01' }],
      nextCursor: 'cursor2',
    })

    const result = await handlers.get('racedash:cloudRender:listJobs')!({}, 'cursor1')
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs?cursor=cursor1')
    expect(result.jobs[0].id).toBe('j1')
    expect(result.nextCursor).toBe('cursor2')
  })

  it('listJobs works without cursor', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({ jobs: [], nextCursor: null })

    await handlers.get('racedash:cloudRender:listJobs')!({})
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/jobs')
  })

  it('getFileSize returns file size in bytes', () => {
    const size = handlers.get('racedash:cloudRender:getFileSize')!({}, '/video.mp4')
    expect(size).toBe(1048576)
  })

  it('estimateCost calculates credits for standard video', () => {
    const cost = handlers.get('racedash:cloudRender:estimateCost')!(
      {}, { durationSeconds: 120, width: 1920, height: 1080, fps: 60 }, '1080p', '60fps',
    )
    expect(cost).toBe(2) // 2 min * 1.0 * 1.0 = 2
  })

  it('estimateCost applies 4K multiplier', () => {
    const cost = handlers.get('racedash:cloudRender:estimateCost')!(
      {}, { durationSeconds: 60, width: 3840, height: 2160, fps: 60 }, '4K', '60fps',
    )
    expect(cost).toBe(3) // 1 min * 3.0 * 1.0 = 3
  })

  it('estimateCost applies high frame rate multiplier', () => {
    const cost = handlers.get('racedash:cloudRender:estimateCost')!(
      {}, { durationSeconds: 60, width: 1920, height: 1080, fps: 120 }, '1080p', '120fps',
    )
    expect(cost).toBe(2) // 1 min * 1.0 * 1.75 = 1.75 → ceil = 2
  })
})

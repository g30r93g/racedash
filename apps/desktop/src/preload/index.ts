import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  RacedashAPI,
  RenderCompleteResult,
  LicenseInfo,
  CreditBalance,
  CreateCloudJobOpts,
  StartUploadOpts,
  CompletedPart,
  CloudUploadProgressEvent,
  VideoInfo,
  YouTubeUploadMetadata,
  MultiVideoInfo,
} from '../types/ipc'
import type { ProjectData, CreateProjectOpts, SegmentConfig } from '../types/project'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'

const api: RacedashAPI = {
  checkFfmpeg: () => ipcRenderer.invoke('racedash:checkFfmpeg'),
  joinVideos: (videoPaths: string[]) => ipcRenderer.invoke('racedash:joinVideos', videoPaths),
  openFile: (opts) => ipcRenderer.invoke('racedash:openFile', opts),
  openFiles: (opts) => ipcRenderer.invoke('racedash:openFiles', opts),
  openDirectory: (opts) => ipcRenderer.invoke('racedash:openDirectory', opts),
  revealInFinder: (path) => ipcRenderer.invoke('racedash:revealInFinder', path),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  listProjects: () => ipcRenderer.invoke('racedash:listProjects'),
  openProject: (projectPath: ProjectData['projectPath']) => ipcRenderer.invoke('racedash:openProject', projectPath),
  createProject: (opts: CreateProjectOpts) => ipcRenderer.invoke('racedash:createProject', opts),
  deleteProject: (projectPath: string) => ipcRenderer.invoke('racedash:deleteProject', projectPath),
  renameProject: (projectPath: string, name: string) => ipcRenderer.invoke('racedash:renameProject', projectPath, name),
  relocateProject: (oldProjectPath: string) => ipcRenderer.invoke('racedash:relocateProject', oldProjectPath),
  updateProject: (projectPath: string, segments: SegmentConfig[], selectedDrivers: Record<string, string>) =>
    ipcRenderer.invoke('racedash:updateProject', projectPath, segments, selectedDrivers),
  readProjectConfig: (configPath: string) => ipcRenderer.invoke('racedash:readProjectConfig', configPath),
  updateProjectConfigOverrides: (
    configPath: string,
    overrides: Array<{ segmentIndex: number; timestamp: string; position: number }>,
  ) => ipcRenderer.invoke('racedash:updateProjectConfigOverrides', configPath, overrides),
  saveStyleToConfig: (
    configPath: string,
    overlayType: string,
    styling: OverlayStyling,
    configOptions?: {
      boxPosition?: BoxPosition
      qualifyingTablePosition?: CornerPosition
      overlayComponents?: OverlayComponentsConfig
      segmentStyles?: Record<string, Partial<OverlayStyling>>
    },
  ) => ipcRenderer.invoke('racedash:saveStyleToConfig', configPath, overlayType, styling, configOptions),

  previewDrivers: (segments) => ipcRenderer.invoke('racedash:previewDrivers', segments),
  previewTimestamps: (segments, selectedDrivers) =>
    ipcRenderer.invoke('racedash:previewTimestamps', segments, selectedDrivers),
  listDrivers: (opts) => ipcRenderer.invoke('racedash:listDrivers', opts),
  generateTimestamps: (opts) => ipcRenderer.invoke('racedash:generateTimestamps', opts),

  getVideoInfo: (videoPath) => ipcRenderer.invoke('racedash:getVideoInfo', videoPath),
  getMultiVideoInfo: (videoPaths: string[]) => ipcRenderer.invoke('racedash:getMultiVideoInfo', videoPaths),
  validateVideoPaths: (videoPaths: string[]) => ipcRenderer.invoke('racedash:validateVideoPaths', videoPaths),
  startRender: (opts) => ipcRenderer.invoke('racedash:startRender', opts),
  cancelRender: () => ipcRenderer.invoke('racedash:cancelRender'),

  onRenderProgress: (cb) => {
    const handler = (_: IpcRendererEvent, event: { phase: string; progress: number }) => cb(event)
    ipcRenderer.on('racedash:render-progress', handler)
    return () => ipcRenderer.removeListener('racedash:render-progress', handler)
  },
  onRenderComplete: (cb) => {
    const handler = (_: IpcRendererEvent, result: RenderCompleteResult) => cb(result)
    ipcRenderer.on('racedash:render-complete', handler)
    return () => ipcRenderer.removeListener('racedash:render-complete', handler)
  },
  onRenderError: (cb) => {
    const handler = (_: IpcRendererEvent, err: { message: string }) => cb(err)
    ipcRenderer.on('racedash:render-error', handler)
    return () => ipcRenderer.removeListener('racedash:render-error', handler)
  },

  onUpdateAvailable: (cb) => {
    const handler = (_: IpcRendererEvent, info: { version: string }) => cb(info)
    ipcRenderer.on('racedash:update-available', handler)
    return () => ipcRenderer.removeListener('racedash:update-available', handler)
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_: IpcRendererEvent) => cb()
    ipcRenderer.on('racedash:update-downloaded', handler)
    return () => ipcRenderer.removeListener('racedash:update-downloaded', handler)
  },
  onUpdateError: (cb) => {
    const handler = (_: IpcRendererEvent, err: { message: string }) => cb(err)
    ipcRenderer.on('racedash:update-error', handler)
    return () => ipcRenderer.removeListener('racedash:update-error', handler)
  },
  installUpdate: () => ipcRenderer.invoke('racedash:update-install'),

  // Auth — token sync between renderer (Clerk) and main (API calls)
  auth: {
    saveSessionToken: (token: string) => ipcRenderer.invoke('racedash:auth:token:save:session', token),
    saveClientToken: (token: string) => ipcRenderer.send('racedash:auth:token:save:client', token),
    getClientToken: () => ipcRenderer.invoke('racedash:auth:token:get') as Promise<string | null>,
    clearToken: () => ipcRenderer.send('racedash:auth:token:clear'),
    fetchWithAuth: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('racedash:auth:fetchWithAuth', url, init),
  },
  // License
  license: {
    get: () => ipcRenderer.invoke('racedash:license:get'),
    getCached: () => ipcRenderer.invoke('racedash:license:getCached'),
  },

  // Credits
  credits: {
    getBalance: () => ipcRenderer.invoke('racedash:credits:getBalance'),
    getHistory: (cursor?: string) => ipcRenderer.invoke('racedash:credits:getHistory', cursor),
  },

  // Stripe Checkout
  stripe: {
    createSubscriptionCheckout: (opts: { tier: 'plus' | 'pro' }) =>
      ipcRenderer.invoke('racedash:stripe:subscriptionCheckout', opts),
    createCreditCheckout: (opts: { packSize: number }) => ipcRenderer.invoke('racedash:stripe:creditCheckout', opts),
    openPortal: () => ipcRenderer.invoke('racedash:stripe:portal'),
  },

  // Cloud render
  cloudRender: {
    createJob: (opts: CreateCloudJobOpts) => ipcRenderer.invoke('racedash:cloudRender:createJob', opts),
    startUpload: (jobId: string, opts: StartUploadOpts) =>
      ipcRenderer.invoke('racedash:cloudRender:startUpload', jobId, opts),
    uploadPart: (jobId: string, url: string, filePath: string, partNumber: number, offset: number, size: number) =>
      ipcRenderer.invoke('racedash:cloudRender:uploadPart', jobId, url, filePath, partNumber, offset, size),
    getFileSize: (filePath: string) => ipcRenderer.invoke('racedash:cloudRender:getFileSize', filePath),
    completeUpload: (jobId: string, parts: CompletedPart[]) =>
      ipcRenderer.invoke('racedash:cloudRender:completeUpload', jobId, parts),
    cancelUpload: (jobId: string) => ipcRenderer.invoke('racedash:cloudRender:cancelUpload', jobId),
    getStatusUrl: (jobId: string) => ipcRenderer.invoke('racedash:cloudRender:getStatusUrl', jobId),
    getDownloadUrl: (jobId: string) => ipcRenderer.invoke('racedash:cloudRender:getDownloadUrl', jobId),
    downloadRender: (jobId: string, outputPath: string) =>
      ipcRenderer.invoke('racedash:cloudRender:downloadRender', jobId, outputPath),
    listJobs: (cursor?: string) => ipcRenderer.invoke('racedash:cloudRender:listJobs', cursor),
    estimateCost: (sourceVideo: VideoInfo, resolution: string, frameRate: string) =>
      ipcRenderer.invoke('racedash:cloudRender:estimateCost', sourceVideo, resolution, frameRate),
  },

  // YouTube
  youtube: {
    connect: () => ipcRenderer.invoke('racedash:youtube:connect'),
    disconnect: () => ipcRenderer.invoke('racedash:youtube:disconnect'),
    getStatus: () => ipcRenderer.invoke('racedash:youtube:getStatus'),
    upload: (jobId: string, metadata: YouTubeUploadMetadata) =>
      ipcRenderer.invoke('racedash:youtube:upload', jobId, metadata),
    getUploads: (jobId: string) => ipcRenderer.invoke('racedash:youtube:getUploads', jobId),
  },

  onCloudUploadProgress: (cb: (event: CloudUploadProgressEvent) => void) => {
    const handler = (_: IpcRendererEvent, event: CloudUploadProgressEvent) => cb(event)
    ipcRenderer.on('racedash:cloudUpload:progress', handler)
    return () => ipcRenderer.removeListener('racedash:cloudUpload:progress', handler)
  },
  onCloudUploadComplete: (cb: (event: { jobId: string }) => void) => {
    const handler = (_: IpcRendererEvent, event: { jobId: string }) => cb(event)
    ipcRenderer.on('racedash:cloudUpload:complete', handler)
    return () => ipcRenderer.removeListener('racedash:cloudUpload:complete', handler)
  },
  onCloudUploadError: (cb: (event: { jobId: string; message: string }) => void) => {
    const handler = (_: IpcRendererEvent, event: { jobId: string; message: string }) => cb(event)
    ipcRenderer.on('racedash:cloudUpload:error', handler)
    return () => ipcRenderer.removeListener('racedash:cloudUpload:error', handler)
  },

  onAuthSessionExpired: (cb: () => void) => {
    const handler = (_: IpcRendererEvent) => cb()
    ipcRenderer.on('racedash:auth:sessionExpired', handler)
    return () => ipcRenderer.removeListener('racedash:auth:sessionExpired', handler)
  },
  onLicenseChanged: (cb: (license: LicenseInfo | null) => void) => {
    const handler = (_: IpcRendererEvent, license: LicenseInfo | null) => cb(license)
    ipcRenderer.on('racedash:license:changed', handler)
    return () => ipcRenderer.removeListener('racedash:license:changed', handler)
  },
  onCreditsChanged: (cb: (balance: CreditBalance) => void) => {
    const handler = (_: IpcRendererEvent, balance: CreditBalance) => cb(balance)
    ipcRenderer.on('racedash:credits:changed', handler)
    return () => ipcRenderer.removeListener('racedash:credits:changed', handler)
  },
}

contextBridge.exposeInMainWorld('racedash', api)

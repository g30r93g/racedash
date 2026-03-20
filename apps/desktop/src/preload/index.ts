import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { RacedashAPI, RenderCompleteResult, LicenseInfo, CreditBalance, YouTubeUploadMetadata } from '../types/ipc'
import type { ProjectData, CreateProjectOpts } from '../types/project'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'

const api: RacedashAPI = {
  checkFfmpeg: () =>
    ipcRenderer.invoke('racedash:checkFfmpeg'),
  joinVideos: (videoPaths: string[]) =>
    ipcRenderer.invoke('racedash:joinVideos', videoPaths),
  openFile: (opts) =>
    ipcRenderer.invoke('racedash:openFile', opts),
  openFiles: (opts) =>
    ipcRenderer.invoke('racedash:openFiles', opts),
  openDirectory: (opts) =>
    ipcRenderer.invoke('racedash:openDirectory', opts),
  revealInFinder: (path) =>
    ipcRenderer.invoke('racedash:revealInFinder', path),

  listProjects: () =>
    ipcRenderer.invoke('racedash:listProjects'),
  openProject: (projectPath: ProjectData['projectPath']) =>
    ipcRenderer.invoke('racedash:openProject', projectPath),
  createProject: (opts: CreateProjectOpts) =>
    ipcRenderer.invoke('racedash:createProject', opts),
  deleteProject: (projectPath: string) =>
    ipcRenderer.invoke('racedash:deleteProject', projectPath),
  renameProject: (projectPath: string, name: string) =>
    ipcRenderer.invoke('racedash:renameProject', projectPath, name),
  relocateProject: (oldProjectPath: string) =>
    ipcRenderer.invoke('racedash:relocateProject', oldProjectPath),
  readProjectConfig: (configPath: string) =>
    ipcRenderer.invoke('racedash:readProjectConfig', configPath),
  updateProjectConfigOverrides: (configPath: string, overrides: Array<{ segmentIndex: number; timestamp: string; position: number }>) =>
    ipcRenderer.invoke('racedash:updateProjectConfigOverrides', configPath, overrides),
  saveStyleToConfig: (
    configPath: string,
    overlayType: string,
    styling: OverlayStyling,
    configOptions?: {
      boxPosition?: BoxPosition
      qualifyingTablePosition?: CornerPosition
      overlayComponents?: OverlayComponentsConfig
    },
  ) =>
    ipcRenderer.invoke('racedash:saveStyleToConfig', configPath, overlayType, styling, configOptions),

  previewDrivers: (segments) =>
    ipcRenderer.invoke('racedash:previewDrivers', segments),
  previewTimestamps: (segments, selectedDriver) =>
    ipcRenderer.invoke('racedash:previewTimestamps', segments, selectedDriver),
  listDrivers: (opts) =>
    ipcRenderer.invoke('racedash:listDrivers', opts),
  generateTimestamps: (opts) =>
    ipcRenderer.invoke('racedash:generateTimestamps', opts),

  getVideoInfo: (videoPath) =>
    ipcRenderer.invoke('racedash:getVideoInfo', videoPath),
  startRender: (opts) =>
    ipcRenderer.invoke('racedash:startRender', opts),
  cancelRender: () =>
    ipcRenderer.invoke('racedash:cancelRender'),

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
  installUpdate: () =>
    ipcRenderer.invoke('racedash:update-install'),

  // Auth
  auth: {
    signIn: () =>
      ipcRenderer.invoke('racedash:auth:signIn'),
    signOut: () =>
      ipcRenderer.invoke('racedash:auth:signOut'),
    getSession: () =>
      ipcRenderer.invoke('racedash:auth:getSession'),
    fetchWithAuth: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('racedash:auth:fetchWithAuth', url, init),
  },
  // License
  license: {
    get: () =>
      ipcRenderer.invoke('racedash:license:get'),
    getCached: () =>
      ipcRenderer.invoke('racedash:license:getCached'),
  },

  // Credits
  credits: {
    getBalance: () =>
      ipcRenderer.invoke('racedash:credits:getBalance'),
    getHistory: (cursor?: string) =>
      ipcRenderer.invoke('racedash:credits:getHistory', cursor),
  },

  // Stripe Checkout
  stripe: {
    createSubscriptionCheckout: (opts: { tier: 'plus' | 'pro' }) =>
      ipcRenderer.invoke('racedash:stripe:subscriptionCheckout', opts),
    createCreditCheckout: (opts: { packSize: number }) =>
      ipcRenderer.invoke('racedash:stripe:creditCheckout', opts),
  },

  // YouTube
  youtube: {
    connect: () =>
      ipcRenderer.invoke('racedash:youtube:connect'),
    disconnect: () =>
      ipcRenderer.invoke('racedash:youtube:disconnect'),
    getStatus: () =>
      ipcRenderer.invoke('racedash:youtube:getStatus'),
    upload: (jobId: string, metadata: YouTubeUploadMetadata) =>
      ipcRenderer.invoke('racedash:youtube:upload', jobId, metadata),
    getUploads: (jobId: string) =>
      ipcRenderer.invoke('racedash:youtube:getUploads', jobId),
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

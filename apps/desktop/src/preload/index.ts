import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { JoinProgressEvent, RacedashAPI, RenderCompleteResult } from '../types/ipc'
import type { ProjectData, CreateProjectOpts } from '../types/project'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling } from '@racedash/core'

const api: RacedashAPI = {
  checkFfmpeg: () =>
    ipcRenderer.invoke('racedash:checkFfmpeg'),
  joinVideos: (videoPaths: string[]) =>
    ipcRenderer.invoke('racedash:joinVideos', videoPaths),
  onJoinProgress: (cb) => {
    const handler = (_: IpcRendererEvent, event: JoinProgressEvent) => cb(event)
    ipcRenderer.on('racedash:join-progress', handler)
    return () => ipcRenderer.removeListener('racedash:join-progress', handler)
  },
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
}

contextBridge.exposeInMainWorld('racedash', api)

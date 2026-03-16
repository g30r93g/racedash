import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { RacedashAPI, RenderCompleteResult } from '../types/ipc'
import type { ProjectData, CreateProjectOpts } from '../types/project'

const api: RacedashAPI = {
  checkFfmpeg: () =>
    ipcRenderer.invoke('racedash:checkFfmpeg'),
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
}

contextBridge.exposeInMainWorld('racedash', api)

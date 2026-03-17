import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-updater
const mockAutoUpdater = {
  autoDownload: false,
  checkForUpdatesAndNotify: vi.fn(),
  on: vi.fn(),
  quitAndInstall: vi.fn(),
}
vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))

// Mock electron
const mockIpcMain = { handle: vi.fn() }
const mockApp = { isPackaged: true }
vi.mock('electron', () => ({ ipcMain: mockIpcMain, app: mockApp }))

// Mock win.webContents.send
const mockSend = vi.fn()
const mockWin = { webContents: { send: mockSend } } as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerUpdaterHandlers', () => {
  it('skips setup when app is not packaged', async () => {
    mockApp.isPackaged = false
    const { registerUpdaterHandlers } = await import('../updater')
    registerUpdaterHandlers(mockWin)
    expect(mockAutoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
    mockApp.isPackaged = true
  })

  it('sets autoDownload and calls checkForUpdatesAndNotify when packaged', async () => {
    vi.resetModules()
    const { registerUpdaterHandlers } = await import('../updater')
    registerUpdaterHandlers(mockWin)
    expect(mockAutoUpdater.autoDownload).toBe(true)
    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce()
  })

  it('registers racedash:update-install ipc handler', async () => {
    vi.resetModules()
    const { registerUpdaterHandlers } = await import('../updater')
    registerUpdaterHandlers(mockWin)
    expect(mockIpcMain.handle).toHaveBeenCalledWith('racedash:update-install', expect.any(Function))
  })

  it('forwards update-available event to renderer', async () => {
    vi.resetModules()
    const { registerUpdaterHandlers } = await import('../updater')
    registerUpdaterHandlers(mockWin)
    // Find the update-available handler registered via autoUpdater.on
    const [, handler] = mockAutoUpdater.on.mock.calls.find(([event]) => event === 'update-available')!
    handler({ version: '1.2.3' })
    expect(mockSend).toHaveBeenCalledWith('racedash:update-available', { version: '1.2.3' })
  })

  it('forwards update-downloaded event to renderer', async () => {
    vi.resetModules()
    const { registerUpdaterHandlers } = await import('../updater')
    registerUpdaterHandlers(mockWin)
    const [, handler] = mockAutoUpdater.on.mock.calls.find(([event]) => event === 'update-downloaded')!
    handler()
    expect(mockSend).toHaveBeenCalledWith('racedash:update-downloaded')
  })
})

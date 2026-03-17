# Distribution Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a GitHub Actions release pipeline that builds macOS + Windows installers and wires up in-app auto-update via `electron-updater`.

**Architecture:** Four-job workflow (`create-release` → parallel `build-mac`/`build-win` → `publish-release`). electron-builder owns asset upload. App-side auto-update uses a dedicated `src/main/updater.ts` module that forwards events to the renderer via the existing `contextBridge`/IPC pattern.

**Tech Stack:** Electron 33, electron-builder, electron-updater, GitHub Actions (`gh` CLI), pnpm 10.26.2, Node 20, Vitest

**Spec:** `docs/superpowers/plans/2026-03-17-distribution-pipeline-design.md`

---

### Task 1: Switch macOS arch to universal + add publish config

**Files:**
- Modify: `apps/desktop/electron-builder.config.ts`

- [ ] **Step 1: Update electron-builder config**

  ```ts
  import type { Configuration } from 'electron-builder'

  const config: Configuration = {
    appId: 'com.racedash.app',
    productName: 'RaceDash',
    directories: {
      buildResources: 'build',
      output: 'release',
    },
    files: ['out/**/*'],
    mac: {
      target: [{ target: 'dmg', arch: ['universal'] }],
      category: 'public.app-category.video',
    },
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
    },
    publish: {
      provider: 'github',
      owner: 'g30r93g',
      repo: 'racedash',
    },
  }

  export default config
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/desktop/electron-builder.config.ts
  git commit -m "build(desktop): switch to universal DMG, add GitHub publish config"
  ```

---

### Task 2: Add electron-updater as a runtime dependency

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install electron-updater as a runtime dep**

  Run from the repo root:
  ```bash
  pnpm --filter @racedash/desktop add electron-updater
  ```
  Confirm it appears under `"dependencies"` (not `"devDependencies"`) in `apps/desktop/package.json`.

- [ ] **Step 2: Commit**

  ```bash
  git add apps/desktop/package.json pnpm-lock.yaml
  git commit -m "build(desktop): add electron-updater runtime dependency"
  ```

---

### Task 3: Add updater IPC types to RacedashAPI

**Files:**
- Modify: `apps/desktop/src/types/ipc.ts`

- [ ] **Step 1: Write a failing test**

  Create `apps/desktop/src/main/__tests__/updater.types.test.ts`:
  ```ts
  import type { RacedashAPI } from '../../types/ipc'

  // Type-level test: confirm updater methods exist on the API surface.
  // This file has no runtime assertions — it fails to compile if types are missing.
  type _CheckAPI = {
    onUpdateAvailable: RacedashAPI['onUpdateAvailable']
    onUpdateDownloaded: RacedashAPI['onUpdateDownloaded']
    onUpdateError: RacedashAPI['onUpdateError']
    installUpdate: RacedashAPI['installUpdate']
  }

  test('RacedashAPI has updater methods', () => {
    // Intentionally empty — type checking is the test
    expect(true).toBe(true)
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm --filter @racedash/desktop test
  ```
  Expected: TypeScript compile error — `'onUpdateAvailable' does not exist on type 'RacedashAPI'`

- [ ] **Step 3: Add updater entries to RacedashAPI**

  In `apps/desktop/src/types/ipc.ts`, add to the `RacedashAPI` interface after the `onRenderError` entry:

  ```ts
  // Update events — main → renderer push via ipcRenderer.on
  // Each returns a cleanup function that removes the listener.
  onUpdateAvailable(cb: (info: { version: string }) => void): () => void
  onUpdateDownloaded(cb: () => void): () => void
  onUpdateError(cb: (err: { message: string }) => void): () => void

  // Trigger install — renderer → main
  installUpdate(): Promise<void>
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @racedash/desktop test
  ```
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/types/ipc.ts apps/desktop/src/main/__tests__/updater.types.test.ts
  git commit -m "feat(desktop): add updater IPC types to RacedashAPI"
  ```

---

### Task 4: Wire updater channels in the preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Add updater entries to the preload api object**

  In `apps/desktop/src/preload/index.ts`, add after the `onRenderError` entry:

  ```ts
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
  ```

- [ ] **Step 2: Run build to confirm no type errors**

  ```bash
  pnpm --filter @racedash/desktop build
  ```
  Expected: clean build, no TypeScript errors

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop/src/preload/index.ts
  git commit -m "feat(desktop): wire updater IPC channels in preload"
  ```

---

### Task 5: Implement updater module in the main process

**Files:**
- Create: `apps/desktop/src/main/updater.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: Write a failing test**

  Create `apps/desktop/src/main/__tests__/updater.test.ts`:
  ```ts
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
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pnpm --filter @racedash/desktop test
  ```
  Expected: FAIL — `../updater` module not found

- [ ] **Step 3: Implement updater.ts**

  Create `apps/desktop/src/main/updater.ts`:
  ```ts
  import { app, ipcMain } from 'electron'
  import type { BrowserWindow } from 'electron'
  import { autoUpdater } from 'electron-updater'

  export function registerUpdaterHandlers(win: BrowserWindow): void {
    if (!app.isPackaged) return

    autoUpdater.autoDownload = true

    autoUpdater.on('update-available', (info) => {
      win.webContents.send('racedash:update-available', { version: info.version })
    })

    autoUpdater.on('update-downloaded', () => {
      win.webContents.send('racedash:update-downloaded')
    })

    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      win.webContents.send('racedash:update-error', { message: err.message })
    })

    ipcMain.handle('racedash:update-install', () => {
      autoUpdater.quitAndInstall()
    })

    autoUpdater.checkForUpdatesAndNotify()
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pnpm --filter @racedash/desktop test
  ```
  Expected: PASS

- [ ] **Step 5: Call registerUpdaterHandlers from main/index.ts**

  In `apps/desktop/src/main/index.ts`, add the import at the top:
  ```ts
  import { registerUpdaterHandlers } from './updater'
  ```

  In the `app.whenReady()` block, call it after `createWindow()`:
  ```ts
  const win = createWindow()
  registerUpdaterHandlers(win)
  ```

  Note: `createWindow()` currently returns `BrowserWindow` — confirm the return value is used.

- [ ] **Step 6: Run full build to confirm no type errors**

  ```bash
  pnpm --filter @racedash/desktop build
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/desktop/src/main/updater.ts apps/desktop/src/main/index.ts apps/desktop/src/main/__tests__/updater.test.ts
  git commit -m "feat(desktop): implement auto-update via electron-updater"
  ```

---

### Task 6: Update notification banner in the renderer

**Files:**
- Create: `apps/desktop/src/renderer/src/components/UpdateBanner.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Create UpdateBanner component**

  Create `apps/desktop/src/renderer/src/components/UpdateBanner.tsx`:
  ```tsx
  import React, { useEffect, useState } from 'react'

  export function UpdateBanner(): React.ReactElement | null {
    const [ready, setReady] = useState(false)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
      const unsubDownloaded = window.racedash.onUpdateDownloaded(() => setReady(true))
      return unsubDownloaded
    }, [])

    if (!ready || dismissed) return null

    return (
      <div
        className="flex items-center justify-between gap-4 bg-blue-600 px-4 py-1.5 text-xs text-white"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span>A new version is ready.</span>
        <div className="flex items-center gap-3">
          <button
            className="font-medium underline hover:no-underline"
            onClick={() => window.racedash.installUpdate()}
          >
            Restart to update
          </button>
          <button
            className="opacity-60 hover:opacity-100"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Add UpdateBanner to App.tsx**

  In `apps/desktop/src/renderer/src/App.tsx`, add the import:
  ```ts
  import { UpdateBanner } from '@/components/UpdateBanner'
  ```

  Add `<UpdateBanner />` inside the traffic-light drag region div, before the `<span>RaceDash</span>`:
  ```tsx
  <div
    className="relative flex h-9 w-full shrink-0 items-center justify-center"
    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
  >
    <UpdateBanner />
    <span className="text-xs font-medium text-white/40 select-none">RaceDash</span>
  </div>
  ```

- [ ] **Step 3: Run build to confirm no errors**

  ```bash
  pnpm --filter @racedash/desktop build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/renderer/src/components/UpdateBanner.tsx apps/desktop/src/renderer/src/App.tsx
  git commit -m "feat(desktop): add update-ready notification banner"
  ```

---

### Task 7: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow file**

  Create `.github/workflows/release.yml`:
  ```yaml
  name: Release

  on:
    push:
      tags: ['v*.*.*']
    workflow_dispatch:
      inputs:
        version:
          description: 'Version to release (e.g. 1.0.0) — matching tag must already exist'
          required: true

  concurrency:
    group: release-${{ github.ref_name || inputs.version }}
    cancel-in-progress: false

  permissions:
    contents: write

  jobs:
    create-release:
      runs-on: ubuntu-latest
      outputs:
        tag: ${{ steps.tag.outputs.tag }}
      steps:
        - uses: actions/checkout@v4
          with:
            ref: ${{ github.event_name == 'workflow_dispatch' && format('refs/tags/v{0}', inputs.version) || github.ref }}

        - name: Resolve tag
          id: tag
          run: |
            if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
              echo "tag=v${{ inputs.version }}" >> "$GITHUB_OUTPUT"
            else
              echo "tag=${GITHUB_REF_NAME}" >> "$GITHUB_OUTPUT"
            fi

        - name: Validate package.json version matches tag
          run: |
            TAG="${{ steps.tag.outputs.tag }}"
            VERSION="${TAG#v}"
            PKG_VERSION=$(node -p "require('./apps/desktop/package.json').version")
            if [ "$PKG_VERSION" != "$VERSION" ]; then
              echo "ERROR: apps/desktop/package.json version ($PKG_VERSION) does not match tag ($VERSION)"
              exit 1
            fi

        - name: Create draft release (idempotent)
          env:
            GH_TOKEN: ${{ secrets.GH_TOKEN }}
          run: |
            TAG="${{ steps.tag.outputs.tag }}"
            gh release view "$TAG" || gh release create "$TAG" --draft --title "RaceDash $TAG" --notes ""

    build-mac:
      needs: create-release
      runs-on: macos-latest
      steps:
        - uses: actions/checkout@v4
          with:
            ref: ${{ github.event_name == 'workflow_dispatch' && format('refs/tags/v{0}', inputs.version) || github.ref }}

        - uses: pnpm/action-setup@v4
          with:
            version: 10.26.2

        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: pnpm

        - run: pnpm install --frozen-lockfile

        - run: pnpm turbo build --filter=@racedash/desktop...

        - name: Build and publish macOS installer
          env:
            GH_TOKEN: ${{ secrets.GH_TOKEN }}
          run: pnpm --filter @racedash/desktop run dist -- --publish always

    build-win:
      needs: create-release
      runs-on: windows-latest
      steps:
        - uses: actions/checkout@v4
          with:
            ref: ${{ github.event_name == 'workflow_dispatch' && format('refs/tags/v{0}', inputs.version) || github.ref }}

        - uses: pnpm/action-setup@v4
          with:
            version: 10.26.2

        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: pnpm

        - run: pnpm install --frozen-lockfile

        - run: pnpm turbo build --filter=@racedash/desktop...

        - name: Build and publish Windows installer
          env:
            GH_TOKEN: ${{ secrets.GH_TOKEN }}
          run: pnpm --filter @racedash/desktop run dist -- --publish always

    publish-release:
      needs: [build-mac, build-win]
      runs-on: ubuntu-latest
      steps:
        - name: Publish release
          env:
            GH_TOKEN: ${{ secrets.GH_TOKEN }}
          run: gh release edit "${{ needs.create-release.outputs.tag }}" --draft=false --repo ${{ github.repository }}
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/release.yml
  git commit -m "ci: add GitHub Actions release workflow for desktop app"
  ```

---

### Task 8: Version bump helper script

**Files:**
- Create: `scripts/bump-version.sh`

- [ ] **Step 1: Create the script**

  Create `scripts/bump-version.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  VERSION="${1:?Usage: scripts/bump-version.sh <version> (e.g. 1.0.0)}"
  TAG="v${VERSION}"

  # Update apps/desktop/package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('apps/desktop/package.json', 'utf8'));
    pkg.version = '${VERSION}';
    fs.writeFileSync('apps/desktop/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "

  git add apps/desktop/package.json
  git commit -m "chore: bump desktop version to ${VERSION}"
  git tag "${TAG}"

  echo ""
  echo "Version bumped to ${VERSION} and tagged ${TAG}."
  echo "Run: git push --follow-tags"
  ```

  Make it executable:
  ```bash
  chmod +x scripts/bump-version.sh
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add scripts/bump-version.sh
  git commit -m "chore: add version bump helper script"
  ```

---

### Task 9: Add GH_TOKEN secret to GitHub repo

This is a manual step — cannot be automated via CI.

- [ ] **Step 1: Create a GitHub Personal Access Token**

  Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
  Create a token scoped to the `racedash` repo with **Contents: Read and write** permission.

- [ ] **Step 2: Add the secret to the repo**

  Go to the GitHub repo → Settings → Secrets and variables → Actions → New repository secret.
  Name: `GH_TOKEN`, Value: the token from Step 1.

---

### Task 10: End-to-end verification

- [ ] **Step 1: Bump to a test version and push**

  ```bash
  bash scripts/bump-version.sh 0.1.0
  git push --follow-tags
  ```

- [ ] **Step 2: Watch the Actions run**

  Confirm all four jobs complete: `create-release` → `build-mac` + `build-win` (parallel) → `publish-release`.

- [ ] **Step 3: Inspect the GitHub Release**

  Confirm the release contains:
  - `racedash-0.1.0.dmg` (universal)
  - `racedash-0.1.0-setup.exe`
  - `latest.yml`
  - `latest-mac.yml`

- [ ] **Step 4: Test auto-update (Windows)**

  Install `0.1.0`, bump to `0.1.1`, publish. Confirm the installed app shows the "A new version is ready" banner.

- [ ] **Step 5: Test workflow_dispatch**

  Trigger manually from GitHub Actions UI with `version=0.1.0` (existing tag). Confirm idempotency — run completes without error, no duplicate release created.

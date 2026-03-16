# Desktop App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/desktop`, an Electron + React app that exposes all racedash CLI functionality through a GUI, distributed as a `.dmg` (macOS) and NSIS `.exe` (Windows) via GitHub Actions on release tags.

**Architecture:** A new `apps/desktop` package uses `electron-vite` for building three separate process bundles (main/preload/renderer). The main process calls `@racedash/engine` for all orchestration; the preload exposes a typed `window.racedash` IPC API via `contextBridge`; the React renderer calls that API and receives push-based progress events. On first launch, the main process checks for FFmpeg and downloads a static binary into `app.getPath('userData')` if missing.

**Dependencies:** This plan requires the `@racedash/engine` package from Plan A (`2026-03-16-engine-extraction.md`) to be implemented first. The engine package must exist at `packages/engine/` and be buildable before starting Task 6 onwards.

**Tech Stack:** Electron 33, electron-vite 3, React 18, Vite, TypeScript, `@racedash/engine`, `extract-zip`, `electron-builder`, GitHub Actions

---

## File Map

**New package: `apps/desktop/`**

| File | Responsibility |
|---|---|
| `package.json` | Package definition, dev/build scripts, workspace deps |
| `electron.vite.config.ts` | Unified vite config for main/preload/renderer builds |
| `tsconfig.json` | Project references: points to tsconfig.node.json and tsconfig.web.json |
| `tsconfig.node.json` | TypeScript config for main + preload (Node.js, CommonJS) |
| `tsconfig.web.json` | TypeScript config for renderer (ESNext, Bundler resolution, DOM) |
| `electron-builder.config.ts` | Packaging: .dmg (universal) + NSIS .exe |
| `src/types/ipc.ts` | Shared API types for `window.racedash` — type-only imports, no runtime deps |
| `src/main/index.ts` | App lifecycle: create BrowserWindow, register IPC handlers, FFmpeg check on startup |
| `src/main/ipc.ts` | All `ipcMain.handle` registrations — calls `@racedash/engine` functions |
| `src/main/ffmpeg.ts` | FFmpeg detection + download (pure async functions, unit-testable) |
| `src/main/dialog.ts` | Thin wrappers around Electron's `dialog.showOpenDialog` / `dialog.showSaveDialog` |
| `src/main/ffmpeg.test.ts` | Vitest unit tests for `findFfmpeg` and `findBinaryInDir` |
| `src/preload/index.ts` | `contextBridge.exposeInMainWorld('racedash', ...)` — the typed `window.racedash` API |
| `src/renderer/index.html` | HTML entry point |
| `src/renderer/src/env.d.ts` | `interface Window { racedash: RacedashAPI }` declaration |
| `src/renderer/src/main.tsx` | React `createRoot` entry |
| `src/renderer/src/App.tsx` | Top-level component: FFmpeg check on mount, nav state, screen router |
| `src/renderer/src/components/Nav.tsx` | Sidebar navigation (five screen links) |
| `src/renderer/src/components/ProgressBar.tsx` | Reusable progress bar (0–1 fraction) |
| `src/renderer/src/screens/Setup.tsx` | FFmpeg first-run download screen |
| `src/renderer/src/screens/Drivers.tsx` | Config file picker + driver list result |
| `src/renderer/src/screens/Timestamps.tsx` | Config file picker + YouTube chapters output |
| `src/renderer/src/screens/Join.tsx` | Multi-file picker + join progress |
| `src/renderer/src/screens/Doctor.tsx` | Diagnostics table |
| `src/renderer/src/screens/Render.tsx` | Full render form + progress |
| `src/renderer/src/styles/global.css` | CSS reset + design tokens |

**New CI workflow:**

| File | Responsibility |
|---|---|
| `.github/workflows/release.yml` | Build + package + upload installers on `v*` tags |

**No existing files are modified.** `pnpm-workspace.yaml` already covers `apps/*`; `turbo.json` already discovers all packages via `build` and `test` tasks.

---

## Chunk 1: Scaffold

### Task 1: Package config files

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/tsconfig.web.json`

- [ ] **Step 1: Create `apps/desktop/package.json`**

```json
{
  "name": "@racedash/desktop",
  "version": "0.0.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "pack": "electron-builder --config electron-builder.config.ts",
    "dist": "electron-vite build && electron-builder --config electron-builder.config.ts",
    "prebuild": "pnpm --filter @racedash/core --filter @racedash/scraper --filter @racedash/timestamps --filter @racedash/compositor --filter @racedash/engine build",
    "pretest": "pnpm --filter @racedash/core --filter @racedash/scraper --filter @racedash/timestamps --filter @racedash/compositor --filter @racedash/engine build",
    "test": "vitest run"
  },
  "dependencies": {
    "@racedash/engine": "workspace:*",
    "extract-zip": "^2.0.1"
  },
  "devDependencies": {
    "@types/node": "*",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^3.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "*",
    "vitest": "*"
  }
}
```

`react` and `react-dom` are `devDependencies` because Vite bundles them into the renderer output — electron-builder does not need to ship them as runtime Node.js modules.

- [ ] **Step 2: Create `apps/desktop/electron.vite.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
})
```

`externalizeDepsPlugin` marks all `node_modules` as external for main and preload so Node.js loads them at runtime rather than bundling inline.

- [ ] **Step 3: Create `apps/desktop/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 4: Create `apps/desktop/tsconfig.node.json`** (for main + preload)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "out",
    "types": ["node"],
    "module": "CommonJS",
    "moduleResolution": "Node"
  },
  "include": [
    "electron.vite.config.ts",
    "src/main/**/*",
    "src/preload/**/*",
    "src/types/**/*"
  ]
}
```

- [ ] **Step 5: Create `apps/desktop/tsconfig.web.json`** (for renderer)

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "out"
  },
  "include": [
    "src/renderer/**/*",
    "src/types/**/*"
  ]
}
```

`tsconfig.web.json` does **not** extend `tsconfig.base.json` — it needs different `module`/`moduleResolution` values for Vite/browser compatibility.

- [ ] **Step 6: Run `pnpm install` from repo root**

```bash
pnpm install
```

Expected: no errors; `@racedash/desktop` appears as a workspace package.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json apps/desktop/electron.vite.config.ts apps/desktop/tsconfig.json apps/desktop/tsconfig.node.json apps/desktop/tsconfig.web.json
git commit -m "feat(desktop): scaffold @racedash/desktop package config"
```

---

### Task 2: Minimal entry points — app launches

**Files:**
- Create: `apps/desktop/src/types/ipc.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/env.d.ts`
- Create: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Create `apps/desktop/src/types/ipc.ts`**

This file uses only `import type` so Vite never attempts to bundle `@racedash/engine` (a Node.js-only package) into the browser renderer bundle.

```ts
import type {
  DriversOptions,
  DriversResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
  TimestampsOptions,
  TimestampsResult,
} from '@racedash/engine'

export type {
  DriversOptions,
  DriversResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
  TimestampsOptions,
  TimestampsResult,
}

export interface OpenFileOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
}

export interface SaveFileOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
}

export interface FfmpegStatus {
  found: boolean
  path?: string
}

export interface RacedashAPI {
  // File dialogs
  openFile(opts?: OpenFileOptions): Promise<string | undefined>
  openFiles(opts?: OpenFileOptions): Promise<string[] | undefined>
  savePath(opts?: SaveFileOptions): Promise<string | undefined>

  // FFmpeg management
  checkFfmpeg(): Promise<FfmpegStatus>
  downloadFfmpeg(): Promise<void>
  /** Register a listener for FFmpeg download progress (0–1). Returns a cleanup function. */
  onFfmpegDownloadProgress(cb: (progress: number) => void): () => void

  // Engine operations
  listDrivers(opts: DriversOptions): Promise<DriversResult>
  generateTimestamps(opts: TimestampsOptions): Promise<TimestampsResult>
  joinVideos(files: string[], outputPath: string): Promise<void>
  runDoctor(): Promise<Array<{ label: string; value: string }>>
  renderSession(opts: RenderOptions): Promise<RenderResult>
  /** Register a listener for render progress events. Returns a cleanup function. */
  onRenderProgress(cb: (event: RenderProgressEvent) => void): () => void

  // Utilities
  getRenderExperimentalWarning(): string | undefined
}
```

- [ ] **Step 2: Create `apps/desktop/src/main/index.ts`** (minimal — full IPC wiring in Task 6)

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: Create `apps/desktop/src/preload/index.ts`** (minimal stub — full API in Task 6)

```ts
import { contextBridge } from 'electron'

// Full window.racedash API is registered in Task 6.
// This stub confirms the preload loads without errors.
contextBridge.exposeInMainWorld('racedash', {})
```

- [ ] **Step 4: Create `apps/desktop/src/renderer/index.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>racedash</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/desktop/src/renderer/src/env.d.ts`**

```ts
import type { RacedashAPI } from '../../types/ipc'

declare global {
  interface Window {
    racedash: RacedashAPI
  }
}
```

- [ ] **Step 6: Create `apps/desktop/src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: Create `apps/desktop/src/renderer/src/App.tsx`** (placeholder — replaced in Task 7)

```tsx
import React from 'react'

export function App(): React.ReactElement {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>racedash</h1>
      <p>Loading…</p>
    </div>
  )
}
```

- [ ] **Step 8: Create `apps/desktop/src/renderer/src/styles/global.css`**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --color-bg: #1a1a1a;
  --color-surface: #242424;
  --color-border: #333;
  --color-text: #e0e0e0;
  --color-text-muted: #888;
  --color-accent: #3b82f6;
  --color-danger: #ef4444;
  --color-success: #22c55e;
  --font-mono: 'Menlo', 'Monaco', 'Courier New', monospace;
  --radius: 6px;
  --spacing: 8px;
}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
}

button {
  cursor: pointer;
}

input, select, textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}
```

- [ ] **Step 9: Build and verify**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors; `apps/desktop/out/` is created with `main/index.js`, `preload/index.js`, and `renderer/index.html`.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat(desktop): add minimal entry points — app skeleton"
```

---

## Chunk 2: FFmpeg Management

### Task 3: FFmpeg detection (TDD)

**Files:**
- Create: `apps/desktop/src/main/ffmpeg.ts`
- Create: `apps/desktop/src/main/ffmpeg.test.ts`

`ffmpeg.ts` uses `execFile` (not `execSync`/`exec`) to match the existing project pattern in `packages/compositor/src/index.ts`. `execFile` avoids shell injection by taking command + args as separate parameters.

- [ ] **Step 1: Write failing tests for `findFfmpeg`**

```ts
// apps/desktop/src/main/ffmpeg.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as child_process from 'node:child_process'
import * as fs from 'node:fs'

import { findFfmpeg, findBinaryInDir } from './ffmpeg'

describe('findFfmpeg', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns found: true with path when ffmpeg is in PATH', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation(
      (_cmd, _args, _opts, callback) => {
        // @ts-expect-error — mock omits full return type
        callback(null, '/usr/bin/ffmpeg\n', '')
        return {} as child_process.ChildProcess
      },
    )
    const result = await findFfmpeg('/fake/userData')
    expect(result.found).toBe(true)
    expect(result.path).toBe('/usr/bin/ffmpeg')
  })

  it('falls back to userData cache when ffmpeg is not in PATH', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation(
      (_cmd, _args, _opts, callback) => {
        // @ts-expect-error
        callback(new Error('not found'), '', '')
        return {} as child_process.ChildProcess
      },
    )
    const userDataPath = '/fake/userData'
    const expectedBinary = process.platform === 'win32'
      ? `${userDataPath}/ffmpeg/ffmpeg.exe`
      : `${userDataPath}/ffmpeg/ffmpeg`
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === expectedBinary)

    const result = await findFfmpeg(userDataPath)
    expect(result.found).toBe(true)
    expect(result.path).toBe(expectedBinary)
  })

  it('returns found: false when neither PATH nor cache has ffmpeg', async () => {
    vi.spyOn(child_process, 'execFile').mockImplementation(
      (_cmd, _args, _opts, callback) => {
        // @ts-expect-error
        callback(new Error('not found'), '', '')
        return {} as child_process.ChildProcess
      },
    )
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = await findFfmpeg('/fake/userData')
    expect(result.found).toBe(false)
    expect(result.path).toBeUndefined()
  })
})

describe('findBinaryInDir', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('finds a file by name in a flat directory', () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir, opts) => {
      if (dir === '/extract' && (opts as { withFileTypes?: boolean })?.withFileTypes) {
        return [{ name: 'ffmpeg', isDirectory: () => false, isFile: () => true }] as unknown as fs.Dirent[]
      }
      return [] as unknown as fs.Dirent[]
    })
    expect(findBinaryInDir('/extract', 'ffmpeg')).toBe('/extract/ffmpeg')
  })

  it('finds a file by name in a nested directory', () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir, opts) => {
      if (dir === '/extract' && (opts as { withFileTypes?: boolean })?.withFileTypes) {
        return [{ name: 'bin', isDirectory: () => true, isFile: () => false }] as unknown as fs.Dirent[]
      }
      if (dir === '/extract/bin' && (opts as { withFileTypes?: boolean })?.withFileTypes) {
        return [{ name: 'ffmpeg.exe', isDirectory: () => false, isFile: () => true }] as unknown as fs.Dirent[]
      }
      return [] as unknown as fs.Dirent[]
    })
    expect(findBinaryInDir('/extract', 'ffmpeg.exe')).toBe('/extract/bin/ffmpeg.exe')
  })

  it('returns null when the file is not found', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue([])
    expect(findBinaryInDir('/extract', 'ffmpeg')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @racedash/desktop test
```

Expected: FAIL — `findFfmpeg` and `findBinaryInDir` not defined.

- [ ] **Step 3: Create `apps/desktop/src/main/ffmpeg.ts`**

```ts
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rename, chmod } from 'node:fs/promises'
import { createWriteStream, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'
import https from 'node:https'
import type { FfmpegStatus } from '../types/ipc'

const execFileAsync = promisify(execFile)

/** Platform-specific FFmpeg binary name */
const FFMPEG_BIN = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

/** Path where the downloaded FFmpeg binary is cached */
export function cachedFfmpegPath(userDataDir: string): string {
  return path.join(userDataDir, 'ffmpeg', FFMPEG_BIN)
}

/**
 * Find ffmpeg on the system.
 * 1. Checks PATH via `which` (macOS/Linux) or `where` (Windows).
 * 2. Falls back to the userData cache.
 *
 * Uses execFile (not exec/execSync) to avoid shell injection.
 */
export async function findFfmpeg(userDataDir: string): Promise<FfmpegStatus> {
  // 1. Try PATH
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, ['ffmpeg'], { encoding: 'utf8' })
    const found = stdout.trim().split('\n')[0].trim()
    if (found) return { found: true, path: found }
  } catch {
    // not in PATH — fall through
  }

  // 2. Check userData cache
  const cached = cachedFfmpegPath(userDataDir)
  if (existsSync(cached)) {
    return { found: true, path: cached }
  }

  return { found: false }
}

/**
 * Recursively search `dir` for a file named `filename`.
 * Returns the full path if found, or null.
 */
export function findBinaryInDir(dir: string, filename: string): string | null {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === filename) return fullPath
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, filename)
      if (found) return found
    }
  }
  return null
}

// Download sources pinned to known-stable providers.
// No SHA verification in this release — add checksum validation in a future hardening pass.
const DOWNLOAD_URLS: Record<string, string> = {
  // evermeet.cx static build: zip containing a single `ffmpeg` binary at the root
  darwin: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
  // BtbN GPL essentials build: zip containing ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe
  win32:
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
}

/**
 * Download and install FFmpeg into `userDataDir/ffmpeg/`.
 * Calls `onProgress` with a 0–1 fraction during the download.
 * Extraction uses `extract-zip`.
 */
export async function downloadFfmpeg(
  userDataDir: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const url = DOWNLOAD_URLS[process.platform]
  if (!url) throw new Error(`Unsupported platform for FFmpeg download: ${process.platform}`)

  const { default: extractZip } = await import('extract-zip')

  const tmpZip = path.join(tmpdir(), `racedash-ffmpeg-${randomUUID()}.zip`)
  const extractDir = path.join(tmpdir(), `racedash-ffmpeg-extract-${randomUUID()}`)
  const destDir = path.join(userDataDir, 'ffmpeg')

  // Download zip with progress
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(tmpZip)
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`FFmpeg download failed: HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) onProgress(received / total)
        })
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
        res.on('error', reject)
      })
      .on('error', reject)
  })

  // Extract zip to temp dir
  mkdirSync(extractDir, { recursive: true })
  await extractZip(tmpZip, { dir: extractDir })

  // Find the binary in the extracted tree
  const extractedBinary = findBinaryInDir(extractDir, FFMPEG_BIN)
  if (!extractedBinary) {
    throw new Error(`Could not find ${FFMPEG_BIN} in downloaded archive`)
  }

  // Move binary to persistent location
  await mkdir(destDir, { recursive: true })
  const destPath = path.join(destDir, FFMPEG_BIN)
  await rename(extractedBinary, destPath)
  if (process.platform !== 'win32') {
    await chmod(destPath, 0o755)
  }

  onProgress(1)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @racedash/desktop test
```

Expected: all tests pass (`findFfmpeg` and `findBinaryInDir` suites).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ffmpeg.ts apps/desktop/src/main/ffmpeg.test.ts
git commit -m "feat(desktop): add FFmpeg detection and download logic"
```

---

### Task 4: File dialog helpers

**Files:**
- Create: `apps/desktop/src/main/dialog.ts`

- [ ] **Step 1: Create `apps/desktop/src/main/dialog.ts`**

```ts
import { dialog, BrowserWindow } from 'electron'
import type { OpenFileOptions, SaveFileOptions } from '../types/ipc'

export async function openFile(
  win: BrowserWindow,
  opts: OpenFileOptions = {},
): Promise<string | undefined> {
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: opts.title,
    defaultPath: opts.defaultPath,
    filters: opts.filters,
    properties: ['openFile'],
  })
  return filePaths[0]
}

export async function openFiles(
  win: BrowserWindow,
  opts: OpenFileOptions = {},
): Promise<string[] | undefined> {
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: opts.title,
    defaultPath: opts.defaultPath,
    filters: opts.filters,
    properties: ['openFile', 'multiSelections'],
  })
  return filePaths.length > 0 ? filePaths : undefined
}

export async function savePath(
  win: BrowserWindow,
  opts: SaveFileOptions = {},
): Promise<string | undefined> {
  const { filePath } = await dialog.showSaveDialog(win, {
    title: opts.title,
    defaultPath: opts.defaultPath,
    filters: opts.filters,
  })
  return filePath
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/dialog.ts
git commit -m "feat(desktop): add native file dialog helpers"
```

---

### Task 5: Setup screen (FFmpeg first-run UI)

**Files:**
- Create: `apps/desktop/src/renderer/src/screens/Setup.tsx`

- [ ] **Step 1: Create `apps/desktop/src/renderer/src/screens/Setup.tsx`**

```tsx
import React, { useState } from 'react'

interface Props {
  onComplete: () => void
}

type Phase = 'idle' | 'downloading' | 'error'

export function Setup({ onComplete }: Props): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload(): Promise<void> {
    setPhase('downloading')
    setProgress(0)
    setError(null)

    const unlisten = window.racedash.onFfmpegDownloadProgress((p) => {
      setProgress(p)
    })

    try {
      await window.racedash.downloadFfmpeg()
      unlisten()
      onComplete()
    } catch (err) {
      unlisten()
      setPhase('error')
      setError((err as Error).message)
    }
  }

  return (
    <div style={{ padding: '3rem', maxWidth: 520 }}>
      <h1 style={{ marginBottom: '1rem' }}>racedash setup</h1>
      <p style={{ marginBottom: '2rem', color: 'var(--color-text-muted)' }}>
        FFmpeg is required for rendering. It was not found on your system.
        Click below to download it automatically (~70 MB).
      </p>

      {phase === 'idle' && (
        <button
          onClick={handleDownload}
          style={{
            padding: '10px 20px',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 14,
          }}
        >
          Download FFmpeg
        </button>
      )}

      {phase === 'downloading' && (
        <div>
          <p style={{ marginBottom: '0.5rem' }}>Downloading… {Math.round(progress * 100)}%</p>
          <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4 }}>
            <div
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                background: 'var(--color-accent)',
                borderRadius: 4,
                transition: 'width 0.1s',
              }}
            />
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div>
          <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>
            Download failed: {error}
          </p>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: 12 }}>
            You can also install FFmpeg manually (e.g. via Homebrew on macOS or by placing
            a static binary in your PATH), then restart the app.
          </p>
          <button
            onClick={handleDownload}
            style={{
              padding: '10px 20px',
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/Setup.tsx
git commit -m "feat(desktop): add FFmpeg setup screen"
```

---

## Chunk 3: IPC Layer

### Task 6: Main-process IPC handlers + full preload API

**Files:**
- Create: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Prerequisite:** Tasks 6 onwards call `@racedash/engine`. The `prebuild` script in `package.json` builds the engine automatically before `electron-vite build`. If running manually, ensure the engine is built first: `pnpm --filter @racedash/engine build`.

**Cross-references to Plan A (`2026-03-16-engine-extraction.md`):**
- `renderSession` in Plan A (Task 5, Step 3) is defined with an optional third parameter: `onDiagnostic?: (diagnostic: { label: string; value: string }) => void`. The three-argument call in `ipc.ts` below is intentional and matches Plan A's engine signature.
- `RenderResult` in Plan A (Task 4, Step 1) is `{ outputPath: string; overlayReused: boolean }`. The `result.overlayReused` access in the Render screen (Task 10) is correct. `RenderResult` does not include `totalDuration` (the spec mentions "total duration" but Plan A chose `overlayReused` instead — see Plan A review notes).

- [ ] **Step 1: Create `apps/desktop/src/main/ipc.ts`**

```ts
import { ipcMain, app } from 'electron'
import path from 'node:path'
import {
  generateTimestamps,
  getRenderExperimentalWarning,
  joinVideos,
  listDrivers,
  renderSession,
  runDoctor,
} from '@racedash/engine'
import type { RenderProgressEvent } from '@racedash/engine'
import { findFfmpeg, downloadFfmpeg } from './ffmpeg'
import { openFile, openFiles, savePath } from './dialog'
import type { OpenFileOptions, SaveFileOptions } from '../types/ipc'

/**
 * Register all IPC handlers. Call once from main/index.ts after BrowserWindow is created.
 *
 * `getWindow` is a getter so that the reference stays valid if the window is recreated
 * (macOS activate behaviour).
 *
 * `rendererEntry` is the absolute path to apps/renderer/src/index.ts.
 * In dev: resolve relative to __dirname. In packaged app: resolve from process.resourcesPath.
 * See main/index.ts for how this value is computed.
 */
export function registerIpcHandlers(
  getWindow: () => Electron.BrowserWindow,
  rendererEntry: string,
): void {
  // --- File dialogs ---

  ipcMain.handle('dialog:openFile', (_e, opts: OpenFileOptions) =>
    openFile(getWindow(), opts),
  )
  ipcMain.handle('dialog:openFiles', (_e, opts: OpenFileOptions) =>
    openFiles(getWindow(), opts),
  )
  ipcMain.handle('dialog:savePath', (_e, opts: SaveFileOptions) =>
    savePath(getWindow(), opts),
  )

  // --- FFmpeg ---

  ipcMain.handle('ffmpeg:check', () => findFfmpeg(app.getPath('userData')))

  ipcMain.handle('ffmpeg:download', async () => {
    await downloadFfmpeg(app.getPath('userData'), (progress) => {
      getWindow().webContents.send('ffmpeg:download-progress', progress)
    })
  })

  // --- Engine: drivers ---

  ipcMain.handle('engine:listDrivers', (_e, opts) => listDrivers(opts))

  // --- Engine: timestamps ---

  ipcMain.handle('engine:generateTimestamps', (_e, opts) => generateTimestamps(opts))

  // --- Engine: join ---

  ipcMain.handle('engine:joinVideos', (_e, files: string[], outputPath: string) =>
    joinVideos(files, outputPath),
  )

  // --- Engine: doctor ---

  ipcMain.handle('engine:runDoctor', () => runDoctor())

  // --- Engine: render ---

  ipcMain.handle('engine:renderSession', async (_e, opts) => {
    return renderSession(
      // rendererEntry is supplied here so the engine (which cannot know its own location
      // relative to apps/renderer) can hand it to @remotion/bundler.
      { ...opts, rendererEntry },
      (event: RenderProgressEvent) => {
        getWindow().webContents.send('render:progress', event)
      },
      ({ label, value }: { label: string; value: string }) => {
        getWindow().webContents.send('render:diagnostic', { label, value })
      },
    )
  })

  // --- Utilities (synchronous) ---

  ipcMain.on('util:getRenderExperimentalWarning', (event) => {
    event.returnValue = getRenderExperimentalWarning()
  })
}
```

- [ ] **Step 2: Replace `apps/desktop/src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

/**
 * Resolve the absolute path to apps/renderer/src/index.ts.
 *
 * In development: resolve relative to this file's __dirname
 * (apps/desktop/out/main → ../../../../apps/renderer/src/index.ts).
 *
 * In production (packaged): apps/renderer/src is copied into resources/renderer/src
 * via electron-builder extraResources. The renderer's node_modules are also
 * included so @remotion/bundler can resolve React, Remotion, etc. at render time.
 */
function resolveRendererEntry(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'renderer', 'src', 'index.ts')
    : path.resolve(__dirname, '../../../../apps/renderer/src/index.ts')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow = win

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Register IPC handlers once, before any window is created.
  // ipcMain.handle throws if the same channel is registered twice, so this must
  // NOT be called inside createWindow (which can be called again on macOS activate).
  registerIpcHandlers(() => {
    if (!mainWindow) throw new Error('BrowserWindow has been destroyed')
    return mainWindow
  }, resolveRendererEntry())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: Replace `apps/desktop/src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { RacedashAPI, OpenFileOptions, SaveFileOptions, RenderProgressEvent } from '../types/ipc'

// Forward render:diagnostic IPC events to the renderer as a custom window event.
// The Render screen listens on window for 'racedash:render-diagnostic'.
// This must be set up outside contextBridge so it runs unconditionally.
ipcRenderer.on('render:diagnostic', (_e, diag: { label: string; value: string }) => {
  window.dispatchEvent(new CustomEvent('racedash:render-diagnostic', { detail: diag }))
})

const api: RacedashAPI = {
  // File dialogs
  openFile: (opts?: OpenFileOptions) => ipcRenderer.invoke('dialog:openFile', opts),
  openFiles: (opts?: OpenFileOptions) => ipcRenderer.invoke('dialog:openFiles', opts),
  savePath: (opts?: SaveFileOptions) => ipcRenderer.invoke('dialog:savePath', opts),

  // FFmpeg
  checkFfmpeg: () => ipcRenderer.invoke('ffmpeg:check'),
  downloadFfmpeg: () => ipcRenderer.invoke('ffmpeg:download'),
  onFfmpegDownloadProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, progress: number) => cb(progress)
    ipcRenderer.on('ffmpeg:download-progress', handler)
    return () => ipcRenderer.removeListener('ffmpeg:download-progress', handler)
  },

  // Engine operations
  listDrivers: (opts) => ipcRenderer.invoke('engine:listDrivers', opts),
  generateTimestamps: (opts) => ipcRenderer.invoke('engine:generateTimestamps', opts),
  joinVideos: (files, outputPath) =>
    ipcRenderer.invoke('engine:joinVideos', files, outputPath),
  runDoctor: () => ipcRenderer.invoke('engine:runDoctor'),
  renderSession: (opts) => ipcRenderer.invoke('engine:renderSession', opts),
  onRenderProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, event: RenderProgressEvent) => cb(event)
    ipcRenderer.on('render:progress', handler)
    return () => ipcRenderer.removeListener('render:progress', handler)
  },

  // Utilities (synchronous IPC)
  getRenderExperimentalWarning: () =>
    ipcRenderer.sendSync('util:getRenderExperimentalWarning') as string | undefined,
}

contextBridge.exposeInMainWorld('racedash', api)
```

- [ ] **Step 4: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): wire up IPC layer — main handlers + preload API"
```

---

## Chunk 4: React Screens

### Task 7: App shell with navigation and FFmpeg gate

**Files:**
- Create: `apps/desktop/src/renderer/src/components/Nav.tsx`
- Create: `apps/desktop/src/renderer/src/components/ProgressBar.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: Create `apps/desktop/src/renderer/src/components/Nav.tsx`**

```tsx
import React from 'react'

export type Screen = 'drivers' | 'timestamps' | 'join' | 'doctor' | 'render'

interface Props {
  current: Screen
  onNavigate: (screen: Screen) => void
}

const SCREENS: Array<{ id: Screen; label: string }> = [
  { id: 'drivers', label: 'Drivers' },
  { id: 'timestamps', label: 'Timestamps' },
  { id: 'join', label: 'Join' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'render', label: 'Render' },
]

export function Nav({ current, onNavigate }: Props): React.ReactElement {
  return (
    <nav
      style={{
        width: 160,
        minHeight: '100%',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 16,
          padding: '0 1.5rem 1.5rem',
          letterSpacing: '-0.02em',
        }}
      >
        racedash
      </div>
      {SCREENS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.5rem 1.5rem',
            textAlign: 'left',
            background: current === id ? 'rgba(59,130,246,0.15)' : 'transparent',
            color: current === id ? 'var(--color-accent)' : 'var(--color-text)',
            border: 'none',
            fontWeight: current === id ? 600 : 400,
            fontSize: 14,
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create `apps/desktop/src/renderer/src/components/ProgressBar.tsx`**

```tsx
import React from 'react'

interface Props {
  /** 0–1 fraction */
  value: number
  label?: string
}

export function ProgressBar({ value, label }: Props): React.ReactElement {
  return (
    <div>
      {label && (
        <p style={{ marginBottom: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
          {label} — {Math.round(value * 100)}%
        </p>
      )}
      <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4 }}>
        <div
          style={{
            height: '100%',
            width: `${value * 100}%`,
            background: 'var(--color-accent)',
            borderRadius: 4,
            transition: 'width 0.15s',
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace `apps/desktop/src/renderer/src/App.tsx`**

```tsx
import React, { useState, useEffect } from 'react'
import { Nav } from './components/Nav'
import type { Screen } from './components/Nav'
import { Setup } from './screens/Setup'
import { Drivers } from './screens/Drivers'
import { Timestamps } from './screens/Timestamps'
import { Join } from './screens/Join'
import { Doctor } from './screens/Doctor'
import { Render } from './screens/Render'

type AppState = 'checking' | 'setup' | 'ready'

export function App(): React.ReactElement {
  const [appState, setAppState] = useState<AppState>('checking')
  const [screen, setScreen] = useState<Screen>('drivers')

  useEffect(() => {
    window.racedash
      .checkFfmpeg()
      .then((status) => setAppState(status.found ? 'ready' : 'setup'))
      .catch(() => setAppState('setup'))
  }, [])

  if (appState === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <p style={{ color: 'var(--color-text-muted)' }}>Checking FFmpeg…</p>
      </div>
    )
  }

  if (appState === 'setup') {
    return <Setup onComplete={() => setAppState('ready')} />
  }

  const screens: Record<Screen, React.ReactElement> = {
    drivers: <Drivers />,
    timestamps: <Timestamps />,
    join: <Join />,
    doctor: <Doctor />,
    render: <Render />,
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Nav current={screen} onNavigate={setScreen} />
      <main style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
        {screens[screen]}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Build** (will error on missing screen imports until Tasks 8–10 are done)

Create temporary stub files for each screen so the build passes while screens are implemented:

```bash
for screen in Drivers Timestamps Join Doctor Render; do
  echo "import React from 'react'; export function ${screen}(): React.ReactElement { return <div>${screen}</div> }" \
    > apps/desktop/src/renderer/src/screens/${screen}.tsx
done
```

Then build:

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors with the stubs in place.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/screens/
git commit -m "feat(desktop): add app shell with nav, FFmpeg gate, and screen stubs"
```

---

### Task 8: Drivers + Timestamps screens

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/Drivers.tsx` (replace stub)
- Modify: `apps/desktop/src/renderer/src/screens/Timestamps.tsx` (replace stub)

Shared inline style constants are defined at the bottom of each screen file. They are intentionally duplicated across screen files to keep each file self-contained — extracting them is a future refactor if the pattern grows.

- [ ] **Step 1: Replace `apps/desktop/src/renderer/src/screens/Drivers.tsx`**

```tsx
import React, { useState } from 'react'
import type { DriversResult } from '../../../types/ipc'

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function Drivers(): React.ReactElement {
  const [configPath, setConfigPath] = useState('')
  const [driverQuery, setDriverQuery] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<DriversResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pickConfig(): Promise<void> {
    const p = await window.racedash.openFile({
      title: 'Open session config',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (p) setConfigPath(p)
  }

  async function handleFetch(): Promise<void> {
    if (!configPath) return
    setPhase('loading')
    setError(null)
    try {
      const res = await window.racedash.listDrivers({
        configPath,
        driverQuery: driverQuery || undefined,
      })
      setResult(res)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Drivers</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Config file</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={configPath} placeholder="No file selected"
              style={inputStyle} onClick={pickConfig} />
            <button onClick={pickConfig} style={buttonStyle}>Browse</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Highlight driver (optional)</label>
          <input value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)}
            placeholder="Partial name, case-insensitive" style={inputStyle} />
        </div>
        <button onClick={handleFetch} disabled={!configPath || phase === 'loading'}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-end' }}>
          {phase === 'loading' ? 'Fetching…' : 'Fetch'}
        </button>
      </div>

      {phase === 'error' && (
        <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {phase === 'done' && result && (
        <div>
          {result.segments.map((segment, idx) => (
            <div key={idx} style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--color-text-muted)', marginBottom: 8 }}>
                Segment {idx + 1} · {segment.config.source} · {segment.config.mode}
                {segment.config.label ? ` · ${segment.config.label}` : ''}
              </p>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {segment.drivers.map((driver, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: (driverQuery && driver.name.toLowerCase().includes(driverQuery.toLowerCase()))
                          ? 'var(--color-accent)'
                          : 'var(--color-text)' }}>
                        {driver.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Shared style constants — duplicated across screen files intentionally (each screen is self-contained)
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 12,
}
const buttonStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontSize: 13,
}
const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 18px', background: 'var(--color-accent)',
  border: 'none', borderRadius: 'var(--radius)', color: '#fff', fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, color: 'var(--color-text-muted)', fontSize: 12,
}
```

Note: `segment.drivers` is `DriverRow[]` from `@racedash/scraper` (`{ kart: string; name: string; laps: Lap[] }`). There is no `highlighted` field on the raw type — the plan highlights by matching `driver.name` against `driverQuery` locally in the renderer (the `driverQuery.toLowerCase().includes()` check above), rather than relying on a server-side flag.

- [ ] **Step 2: Replace `apps/desktop/src/renderer/src/screens/Timestamps.tsx`**

```tsx
import React, { useState } from 'react'
import type { TimestampsResult } from '../../../types/ipc'

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function Timestamps(): React.ReactElement {
  const [configPath, setConfigPath] = useState('')
  const [fps, setFps] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<TimestampsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function pickConfig(): Promise<void> {
    const p = await window.racedash.openFile({
      title: 'Open session config',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (p) setConfigPath(p)
  }

  async function handleGenerate(): Promise<void> {
    if (!configPath) return
    setPhase('loading')
    setError(null)
    try {
      const res = await window.racedash.generateTimestamps({
        configPath,
        fps: fps ? parseFloat(fps) : undefined,
      })
      setResult(res)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  async function handleCopy(): Promise<void> {
    if (!result) return
    await navigator.clipboard.writeText(result.chapters)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Timestamps</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Config file</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={configPath} placeholder="No file selected"
              style={inputStyle} onClick={pickConfig} />
            <button onClick={pickConfig} style={buttonStyle}>Browse</button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>FPS (optional)</label>
          <input value={fps} onChange={(e) => setFps(e.target.value)}
            placeholder="e.g. 60" style={{ ...inputStyle, flex: undefined, width: 80 }} />
        </div>
        <button onClick={handleGenerate} disabled={!configPath || phase === 'loading'}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-end' }}>
          {phase === 'loading' ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {phase === 'error' && (
        <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {phase === 'done' && result && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button onClick={handleCopy} style={buttonStyle}>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <pre style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '1rem', fontFamily: 'var(--font-mono)',
            fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {result.chapters}
          </pre>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 12,
}
const buttonStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontSize: 13,
}
const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 18px', background: 'var(--color-accent)',
  border: 'none', borderRadius: 'var(--radius)', color: '#fff', fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, color: 'var(--color-text-muted)', fontSize: 12,
}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/Drivers.tsx apps/desktop/src/renderer/src/screens/Timestamps.tsx
git commit -m "feat(desktop): add Drivers and Timestamps screens"
```

---

### Task 9: Join + Doctor screens

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/Join.tsx` (replace stub)
- Modify: `apps/desktop/src/renderer/src/screens/Doctor.tsx` (replace stub)

- [ ] **Step 1: Replace `apps/desktop/src/renderer/src/screens/Join.tsx`**

```tsx
import React, { useState } from 'react'
import { ProgressBar } from '../components/ProgressBar'

type Phase = 'idle' | 'joining' | 'done' | 'error'

export function Join(): React.ReactElement {
  const [files, setFiles] = useState<string[]>([])
  const [outputPath, setOutputPath] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  async function pickFiles(): Promise<void> {
    const picked = await window.racedash.openFiles({
      title: 'Select GoPro chapter files',
      filters: [{ name: 'Video', extensions: ['mp4', 'MP4', 'mov', 'MOV'] }],
    })
    if (picked) setFiles(picked)
  }

  async function pickOutput(): Promise<void> {
    const p = await window.racedash.savePath({
      title: 'Output file',
      defaultPath: 'joined.mp4',
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    })
    if (p) setOutputPath(p)
  }

  async function handleJoin(): Promise<void> {
    if (files.length < 2 || !outputPath) return
    setPhase('joining')
    setError(null)
    try {
      await window.racedash.joinVideos(files, outputPath)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Join</h2>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Video files ({files.length} selected, minimum 2)</label>
        <button onClick={pickFiles} style={buttonStyle}>Select files…</button>
        {files.length > 0 && (
          <ul style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)', listStyle: 'none' }}>
            {files.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Output file</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={outputPath} placeholder="No path selected"
              style={inputStyle} onClick={pickOutput} />
            <button onClick={pickOutput} style={buttonStyle}>Browse</button>
          </div>
        </div>
        <button
          onClick={handleJoin}
          disabled={files.length < 2 || !outputPath || phase === 'joining'}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-end' }}
        >
          {phase === 'joining' ? 'Joining…' : 'Join'}
        </button>
      </div>

      {phase === 'joining' && (
        // joinVideos does not emit progress events — show indeterminate indicator
        <ProgressBar value={0.5} label="Joining videos" />
      )}
      {phase === 'done' && (
        <p style={{ color: 'var(--color-success)' }}>Done: {outputPath}</p>
      )}
      {phase === 'error' && (
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 12,
}
const buttonStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontSize: 13,
}
const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 18px', background: 'var(--color-accent)',
  border: 'none', borderRadius: 'var(--radius)', color: '#fff', fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, color: 'var(--color-text-muted)', fontSize: 12,
}
```

- [ ] **Step 2: Replace `apps/desktop/src/renderer/src/screens/Doctor.tsx`**

```tsx
import React, { useState } from 'react'

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function Doctor(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle')
  const [diagnostics, setDiagnostics] = useState<Array<{ label: string; value: string }>>([])
  const [error, setError] = useState<string | null>(null)

  async function handleRun(): Promise<void> {
    setPhase('loading')
    setError(null)
    try {
      const results = await window.racedash.runDoctor()
      const warning = window.racedash.getRenderExperimentalWarning()
      setDiagnostics(warning ? [{ label: 'Warning', value: warning }, ...results] : results)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Doctor</h2>

      <button
        onClick={handleRun}
        disabled={phase === 'loading'}
        style={{
          padding: '6px 18px', background: 'var(--color-accent)',
          border: 'none', borderRadius: 'var(--radius)', color: '#fff',
          fontSize: 13, marginBottom: '1.5rem',
        }}
      >
        {phase === 'loading' ? 'Running…' : 'Run diagnostics'}
      </button>

      {phase === 'error' && (
        <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>
      )}

      {phase === 'done' && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {diagnostics.map(({ label, value }, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '6px 12px 6px 0', color: 'var(--color-text-muted)',
                  width: 200, verticalAlign: 'top' }}>
                  {label}
                </td>
                <td style={{ padding: '6px 0', fontFamily: 'var(--font-mono)',
                  fontSize: 12 }}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/Join.tsx apps/desktop/src/renderer/src/screens/Doctor.tsx
git commit -m "feat(desktop): add Join and Doctor screens"
```

---

### Task 10: Render screen

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/Render.tsx` (replace stub)

- [ ] **Step 1: Replace `apps/desktop/src/renderer/src/screens/Render.tsx`**

```tsx
import React, { useState } from 'react'
import { ProgressBar } from '../components/ProgressBar'
import type { RenderResult, RenderProgressEvent, RenderOptions } from '../../../types/ipc'

type Phase = 'idle' | 'rendering' | 'done' | 'error'

const BOX_POSITIONS = [
  'bottom-left', 'bottom-center', 'bottom-right',
  'top-left', 'top-center', 'top-right',
]
const TABLE_POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
const STYLES = ['banner', 'modern', 'esports', 'minimal']

const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
}

export function Render(): React.ReactElement {
  const [configPath, setConfigPath] = useState('')
  const [videoPaths, setVideoPaths] = useState<string[]>([])
  const [outputPath, setOutputPath] = useState('')
  const [style, setStyle] = useState('banner')
  const [resolutionPreset, setResolutionPreset] = useState('')
  const [overlayX, setOverlayX] = useState('0')
  const [overlayY, setOverlayY] = useState('')
  const [boxPosition, setBoxPosition] = useState('')
  const [tablePosition, setTablePosition] = useState('')
  const [labelWindow, setLabelWindow] = useState('5')
  const [noCache, setNoCache] = useState(false)
  const [onlyOverlay, setOnlyOverlay] = useState(false)

  const [phase, setPhase] = useState<Phase>('idle')
  const [progressValue, setProgressValue] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult] = useState<RenderResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<Array<{ label: string; value: string }>>([])

  const warning = window.racedash.getRenderExperimentalWarning()

  async function pickConfig(): Promise<void> {
    const p = await window.racedash.openFile({
      title: 'Open session config',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (p) setConfigPath(p)
  }

  async function pickVideos(): Promise<void> {
    const picked = await window.racedash.openFiles({
      title: 'Select video file(s)',
      filters: [{ name: 'Video', extensions: ['mp4', 'MP4', 'mov', 'MOV'] }],
    })
    if (picked) setVideoPaths(picked)
  }

  async function pickOutput(): Promise<void> {
    const p = await window.racedash.savePath({
      title: 'Output file',
      defaultPath: 'out.mp4',
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    })
    if (p) setOutputPath(p)
  }

  async function handleRender(): Promise<void> {
    if (!configPath || videoPaths.length === 0 || !outputPath) return
    setPhase('rendering')
    setProgressValue(0)
    setProgressLabel('')
    setDiagnostics([])
    setError(null)

    // Listen for render progress
    const unlistenProgress = window.racedash.onRenderProgress((event: RenderProgressEvent) => {
      setProgressLabel(event.phase)
      setProgressValue(event.progress)
    })

    // Listen for diagnostic events forwarded via custom window event from preload
    function onDiagnostic(e: Event): void {
      const { label, value } = (e as CustomEvent<{ label: string; value: string }>).detail
      setDiagnostics((prev) => [...prev, { label, value }])
    }
    window.addEventListener('racedash:render-diagnostic', onDiagnostic)

    try {
      const opts: RenderOptions = {
        configPath,
        videoPaths,
        outputPath,
        // rendererEntry is intentionally set to empty string here.
        // The main process IPC handler (ipc.ts) overrides this field with
        // the correct resolved path before passing opts to renderSession.
        rendererEntry: '',
        style,
        outputResolution: RESOLUTION_PRESETS[resolutionPreset],
        overlayX: overlayX !== '' ? parseInt(overlayX, 10) : 0,
        overlayY: overlayY !== '' ? parseInt(overlayY, 10) : undefined,
        boxPosition: (boxPosition || undefined) as RenderOptions['boxPosition'],
        qualifyingTablePosition: (tablePosition || undefined) as RenderOptions['qualifyingTablePosition'],
        labelWindowSeconds: parseFloat(labelWindow) || 5,
        noCache,
        onlyRenderOverlay: onlyOverlay,
      }
      const res = await window.racedash.renderSession(opts)
      setResult(res)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('error')
    } finally {
      unlistenProgress()
      window.removeEventListener('racedash:render-diagnostic', onDiagnostic)
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Render</h2>

      {warning && (
        <p style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)',
          padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
          ⚠ {warning}
        </p>
      )}

      {/* Config */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Config file</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={configPath} placeholder="No file selected"
            style={inputStyle} onClick={pickConfig} />
          <button onClick={pickConfig} style={buttonStyle}>Browse</button>
        </div>
      </div>

      {/* Video */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Video file(s) ({videoPaths.length} selected)</label>
        <button onClick={pickVideos} style={buttonStyle}>Select video…</button>
        {videoPaths.length > 0 && (
          <p style={{ marginTop: 4, fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)' }}>
            {videoPaths.join(', ')}
          </p>
        )}
      </div>

      {/* Output */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Output file</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={outputPath} placeholder="No path selected"
            style={inputStyle} onClick={pickOutput} />
          <button onClick={pickOutput} style={buttonStyle}>Browse</button>
        </div>
      </div>

      {/* Style + resolution */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Style</label>
          <select value={style} onChange={(e) => setStyle(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: '100%' }}>
            {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Output resolution</label>
          <select value={resolutionPreset} onChange={(e) => setResolutionPreset(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: '100%' }}>
            <option value="">Source resolution</option>
            {Object.keys(RESOLUTION_PRESETS).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Overlay position */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Overlay X</label>
          <input value={overlayX} onChange={(e) => setOverlayX(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: 70 }} />
        </div>
        <div>
          <label style={labelStyle}>Overlay Y (auto if blank)</label>
          <input value={overlayY} onChange={(e) => setOverlayY(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: 70 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Box position</label>
          <select value={boxPosition} onChange={(e) => setBoxPosition(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: '100%' }}>
            <option value="">Default for style</option>
            {BOX_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Qualifying table position</label>
          <select value={tablePosition} onChange={(e) => setTablePosition(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: '100%' }}>
            <option value="">None</option>
            {TABLE_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Label window + toggles */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Label window (seconds)</label>
          <input value={labelWindow} onChange={(e) => setLabelWindow(e.target.value)}
            style={{ ...inputStyle, flex: undefined, width: 70 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
          Force re-render overlay
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyOverlay} onChange={(e) => setOnlyOverlay(e.target.checked)} />
          Overlay only (skip composite)
        </label>
      </div>

      <button
        onClick={handleRender}
        disabled={!configPath || videoPaths.length === 0 || !outputPath || phase === 'rendering'}
        style={{ padding: '8px 24px', background: 'var(--color-accent)',
          border: 'none', borderRadius: 'var(--radius)', color: '#fff',
          fontSize: 14, marginBottom: '1.5rem' }}
      >
        {phase === 'rendering' ? 'Rendering…' : 'Render'}
      </button>

      {phase === 'rendering' && (
        <ProgressBar value={progressValue} label={progressLabel || 'Working'} />
      )}

      {diagnostics.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {diagnostics.map(({ label, value }, i) => (
            <p key={i} style={{ fontSize: 11, fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-muted)' }}>
              {label}: {value}
            </p>
          ))}
        </div>
      )}

      {phase === 'done' && result && (
        <p style={{ color: 'var(--color-success)', marginTop: 12 }}>
          ✓ {result.outputPath}{result.overlayReused ? ' (overlay reused)' : ''}
        </p>
      )}

      {phase === 'error' && (
        <p style={{ color: 'var(--color-danger)', marginTop: 12 }}>{error}</p>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 12,
}
const buttonStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  color: 'var(--color-text)', fontSize: 13,
}
const fieldStyle: React.CSSProperties = { marginBottom: 12 }
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, color: 'var(--color-text-muted)', fontSize: 12,
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/Render.tsx
git commit -m "feat(desktop): add Render screen"
```

---

## Chunk 5: Build Config + CI/CD

### Task 11: electron-builder packaging config

**Files:**
- Create: `apps/desktop/electron-builder.config.ts`

- [ ] **Step 1: Create `apps/desktop/electron-builder.config.ts`**

```ts
import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.racedash.app',
  productName: 'racedash',
  copyright: 'racedash contributors',
  directories: {
    output: 'dist-electron',
    buildResources: 'build',
  },
  files: [
    'out/**',
    'node_modules/**',
    '!node_modules/.cache',
  ],
  // Include apps/renderer source and its node_modules so @remotion/bundler can
  // compile the Remotion composition at render time (inside the packaged app).
  // This adds ~80–120 MB; pre-bundling the composition at build time is a future optimisation.
  extraResources: [
    {
      from: '../../apps/renderer/src',
      to: 'renderer/src',
    },
    {
      from: '../../apps/renderer/package.json',
      to: 'renderer/package.json',
    },
    {
      from: '../../apps/renderer/node_modules',
      to: 'renderer/node_modules',
    },
  ],
  mac: {
    // Universal binary: runs natively on both Apple Silicon and Intel Macs.
    target: [{ target: 'dmg', arch: ['universal'] }],
    // Unsigned for initial release — users dismiss Gatekeeper via right-click → Open.
  },
  win: {
    target: [{ target: 'nsis' }],
    // Unsigned for initial release — users dismiss SmartScreen via More info → Run anyway.
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  dmg: {
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
}

export default config
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @racedash/desktop build
```

Expected: no TypeScript errors in the config file.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron-builder.config.ts
git commit -m "feat(desktop): add electron-builder packaging config"
```

---

### Task 12: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    name: Test (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: true
      matrix:
        os:
          - macos-latest
          - windows-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.2

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install FFmpeg (macOS)
        if: matrix.os == 'macos-latest'
        run: brew install ffmpeg

      - name: Install FFmpeg (Windows)
        if: matrix.os == 'windows-latest'
        shell: powershell
        run: choco install ffmpeg -y

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test
        run: pnpm turbo test

  build:
    name: Build (${{ matrix.os }})
    needs: test
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            artifact: '*.dmg'
          - os: windows-latest
            artifact: '*.exe'

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.2

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build workspace packages (exclude desktop — built by dist script)
        run: pnpm turbo build --filter=!@racedash/desktop

      - name: Build and package desktop app
        working-directory: apps/desktop
        run: pnpm dist

      - name: Upload installer to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: apps/desktop/dist-electron/${{ matrix.artifact }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes:
- `test` job runs on both runners and must pass before `build` starts (`needs: test`, `fail-fast: true`)
- The `build` job builds all workspace packages first, then runs `pnpm dist` in `apps/desktop` which runs electron-vite build + electron-builder packaging
- The macOS runner produces a universal `.dmg` via `arch: ['universal']` in electron-builder config
- Both runners install pnpm `10.26.2` exactly as pinned in root `package.json`
- `softprops/action-gh-release@v2` attaches the artifacts to the GitHub Release created by the `v*` tag

- [ ] **Step 2: Verify the workflow is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(desktop): add GitHub Actions release workflow for .dmg and .exe"
```

---

### Task 13: Full smoke test

- [ ] **Step 1: Run the full monorepo test suite**

```bash
pnpm test
```

Expected: all tests pass across all packages, including `@racedash/desktop`'s `ffmpeg.test.ts`.

- [ ] **Step 2: Build the full monorepo**

```bash
pnpm build
```

Expected: all packages build successfully, including `@racedash/desktop`.

- [ ] **Step 3: Verify app launches in dev mode** (requires macOS or Windows with Electron)

```bash
pnpm --filter @racedash/desktop dev
```

Expected: Electron window opens showing either the FFmpeg setup screen (if FFmpeg is not in PATH) or the main app with sidebar navigation (Drivers, Timestamps, Join, Doctor, Render).

- [ ] **Step 4: Final commit if any fixup changes were needed**

```bash
git add -A
git commit -m "chore(desktop): finalise desktop app implementation"
```

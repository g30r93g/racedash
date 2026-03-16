# Desktop App Design

**Date:** 2026-03-16
**Branch:** feat/desktop-app
**Status:** Approved

## Overview

A desktop GUI application that wraps all racedash functionality for non-technical users. Users download an installer from the GitHub releases page, install it, and use racedash through a graphical interface rather than the CLI. Installers are built and published via GitHub Actions.

**Platforms:** macOS, Windows
**Framework:** Electron + React
**Packaging:** electron-builder (`.dmg` for macOS, NSIS `.exe` for Windows)

---

## 1. Monorepo Structure

Two additions to the monorepo:

```
packages/
  engine/          ← NEW: orchestration logic extracted from apps/cli/src/
  core/            ← unchanged (rendering/overlay types only)
  scraper/         ← unchanged
  compositor/      ← unchanged
  timestamps/      ← unchanged

apps/
  desktop/         ← NEW: Electron + React app
  cli/             ← slimmed down to thin commander wrappers
  renderer/        ← unchanged
```

`apps/cli` becomes a thin commander wrapper — each command action calls the engine and formats output for the terminal. No orchestration logic remains in the CLI.

---

## 2. `@racedash/engine`

A new orchestration package. The logic currently in `apps/cli/src/timingSources.ts` moves here almost entirely as-is. The command action bodies in `apps/cli/src/index.ts` are more complex: they mix orchestration with terminal-specific output (`stat()`, `printStyling()`, `makeProgressCallback()`, `process.stderr.write`). Extracting the engine means separating orchestration from presentation — the business logic moves to the engine, the terminal formatting stays in the CLI.

### What moves to the engine

- All of `timingSources.ts`: timing source resolution, config loading, segment building, driver matching
- Overlay-Y coordinate computation (`BOX_STRIP_HEIGHTS` scaled strip height logic in `index.ts`) — this is rendering business logic, not CLI presentation logic, and must live in the engine so the desktop does not need to duplicate it
- The orchestration sequence for each command (resolve segments → build session → call compositor)

### What stays in the CLI

- Commander argument parsing and validation
- Terminal progress bar formatting (`makeProgressCallback`, `progressBar`)
- Diagnostic output formatting (`printStyling`, `printCapabilities`, `stat`, `formatDoctorDiagnostics`)
- `process.stderr.write` / `process.stdout.write` calls

### Exports

```ts
export async function listDrivers(opts: DriversOptions): Promise<DriversResult>
export async function generateTimestamps(opts: TimestampsOptions): Promise<TimestampsResult>
export async function joinVideos(files: string[], output: string): Promise<void>
export async function runDoctor(): Promise<Array<{ label: string; value: string }>>
export async function renderSession(
  opts: RenderOptions,
  onProgress: (event: RenderProgressEvent) => void,
): Promise<RenderResult>
```

`joinVideos` is a thin re-export of `@racedash/compositor`'s `joinVideos`. It is included in the engine's public surface so that callers (CLI and desktop) have a single import point for all operations and do not need to take a direct dependency on `@racedash/compositor`.

### Key option/result types (to be fully defined during implementation)

These types do not yet exist and must be designed as part of the engine implementation, not treated as a mechanical extraction:

- `DriversOptions` — config path, optional driver highlight query
- `DriversResult` — resolved segments with driver lists and capabilities
- `TimestampsOptions` — config path, optional fps
- `TimestampsResult` — formatted chapter string + segment metadata
- `RenderOptions` — config path, video path, output path, style, box position, overlay offset, resolution preset, label window, cache flag, overlay-only flag
- `RenderProgressEvent` — phase label + 0–1 progress fraction
- `RenderResult` — output path, total duration

### Renderer entry path

The existing CLI resolves the renderer entry point via a hardcoded `__dirname`-relative path:

```ts
const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')
```

This breaks when the orchestration moves into `packages/engine` since `__dirname` will point to a different location. The engine must not hardcode this path. Instead, `RenderOptions` includes a `rendererEntry: string` field — the caller (CLI or desktop main process) supplies the absolute path. Both callers know their own location and can resolve it reliably at their boundary.

### Config file path handling

`loadTimingConfig` resolves `emailPath` fields inside config JSON relative to the config file's directory using `path.dirname(absoluteConfigPath)`. The desktop must pass the raw absolute path returned by the native file dialog — it must not pre-resolve or strip the config path before passing it to the engine, or relative `emailPath` values will break.

### Video file selection

`resolveVideoFiles` in `select.ts` prompts the user to pick GoPro chapter files interactively via `@inquirer/prompts`. This is CLI-only behaviour and stays in the CLI. `joinVideos` in the engine accepts a pre-resolved `string[]` of file paths — file selection is entirely the caller's responsibility. The desktop uses a native multi-file picker dialog instead.

### Type ownership

| Package | Owns |
|---|---|
| `@racedash/core` | Rendering/overlay types: `Lap`, `SessionData`, `OverlayProps`, `OverlayStyling`, `SessionSegment`, `SessionMode`, `BoxPosition`, `CornerPosition`, etc. |
| `@racedash/engine` | Timing/config types: `SegmentConfig`, `TimingCapabilities`, `LoadedTimingConfig`, `ResolvedTimingSegment`, `PositionOverrideConfig`, `ManualTimingEntry`, all engine function option/result types |

`@racedash/compositor` and `apps/renderer` import from `@racedash/core` only — they never depend on engine types. The CLI and desktop import timing/config types from `@racedash/engine` and rendering types from `@racedash/core`.

### Progress callbacks

`renderSession` accepts an `onProgress` callback instead of writing to stderr. The CLI passes a callback that formats the terminal progress bar. The desktop passes a callback that sends an IPC event to the renderer to update a progress UI.

### Overlay cache behaviour

The CLI's render command checks for an existing overlay file and reuses it if valid (`--no-cache` forces a re-render). This cache logic moves into `renderSession`. The desktop exposes a "Force re-render" toggle that maps to the same flag.

### Windows experimental render warning

`getRenderExperimentalWarning()` in the CLI detects Windows and returns a warning about experimental FFmpeg/GPU support. The engine should expose this check so the desktop can surface the same warning — either inline on the Render screen or as a banner when the app is running on Windows.

---

## 3. Electron App Architecture

Built with **electron-vite** — the standard Electron + Vite + React scaffold, handling main, preload, and renderer builds in one tool.

```
apps/desktop/
  src/
    main/        ← Node.js: app lifecycle, IPC handlers, calls @racedash/engine
    preload/     ← contextBridge: exposes typed IPC API to renderer
    renderer/    ← React app (Vite)
```

### Main process

Handles all heavy work: calling `@racedash/engine`, native file dialogs, FFmpeg detection and download, app lifecycle. Registers IPC handlers for each engine operation. Supplies the `rendererEntry` path (resolved relative to the desktop app's own `__dirname`) when calling `renderSession`.

### Preload

Exposes a typed `window.racedash` API to the renderer via `contextBridge`. The renderer never calls Node.js APIs or accesses the filesystem directly.

### Renderer

React app. Calls `window.racedash.*` and receives progress events back via IPC. No awareness of the filesystem or engine internals. Error states (network failures, bad config, FFmpeg errors mid-render) must be handled and surfaced to the user — error state design is in scope for the screen design phase.

### Progress flow

```
Renderer → ipcRenderer.invoke('render', opts)
Main     → renderSession(opts, (event) => mainWindow.webContents.send('render:progress', event))
Renderer ← ipcRenderer.on('render:progress', updateUI)
```

---

## 4. First-Run FFmpeg Setup

On first launch, the app checks for `ffmpeg` in `PATH` and platform-specific known locations. If missing, a setup screen blocks the user from proceeding and downloads a pre-built static binary automatically.

**Why download rather than bundle or use a package manager:**
- Bundling: adds ~100 MB to the installer (rejected on cost/size grounds)
- winget/brew: requires package managers to be present; Homebrew is not standard on macOS; winget requires UAC elevation on Windows
- Download on first run: small installer, fully automatic, no package manager required, no admin rights needed (binary stored in user data directory)

**Download sources and versioning:** the specific download URLs, version pinning strategy, file format (`.zip` / `.tar.xz`), and SHA/signature verification approach are implementation decisions to be made when building the setup flow. The implementation plan should address these, along with the failure UX: what the user sees if the download fails, whether retries are automatic, and how a user can manually provide an FFmpeg binary as a fallback.

**Storage:** binary cached in the app's user data directory (`~/Library/Application Support/racedash/` on macOS, `%APPDATA%\racedash\` on Windows). Re-downloaded only if missing.

**macOS caveat:** if the user has a system FFmpeg (via Homebrew or otherwise), that is used and no download occurs.

The `doctor` command is surfaced in the app as a diagnostics panel so users can inspect their full environment at any time.

---

## 5. GitHub Actions CI/CD

Two build jobs run in parallel on release tags (`v*`):

```
macOS runner  → universal .dmg (Apple Silicon + Intel)
Windows runner → .exe (NSIS installer)
```

`electron-builder` handles packaging. Both artifacts are uploaded to the GitHub Release automatically.

`pnpm test` runs on both runners before building — a failing test blocks the release. Both runners must install the exact pnpm version pinned in `package.json` (`pnpm@10.26.2`) to prevent version drift silently breaking the build.

**Code signing:** unsigned for initial releases. macOS Gatekeeper and Windows SmartScreen will show warnings ("unrecognised developer") that users dismiss via right-click → Open (macOS) or More info → Run anyway (Windows). Signing (Apple Developer certificate ~$99/yr, Windows CA certificate ~$200–400/yr) to be revisited before public launch.

---

## 6. Screen Design

Screens and views are to be designed separately in Paper. The desktop app must expose all functionality currently available in the CLI:

- **Drivers** — list drivers for a timing config, with optional highlight
- **Timestamps** — generate YouTube chapter timestamps from a config
- **Join** — concatenate GoPro chapter files via native multi-file picker
- **Doctor** — inspect FFmpeg and machine setup
- **Render** — render timing overlay onto a video with full styling and position options

Error states (network failures fetching timing data, bad config files, FFmpeg errors mid-render, failed FFmpeg download on first run) are in scope for screen design.

---

## 7. Planned Next Steps (Post-Screen Design)

### Remotion Live Preview

After screen design is complete, a separate spec/plan should be created for an in-app live preview using `@remotion/player`.

`@remotion/player` is a React component that renders Remotion compositions at real-time speed with a scrubber. Since the Electron renderer is Chromium + React, it works as a drop-in. The desktop app can import the overlay composition from `apps/renderer` and pass it `OverlayProps` built from the user's config, giving users a live animated preview before committing to a full FFmpeg render.

Two levels of implementation to consider at that stage:
- **Overlay-only preview**: overlay rendered on a dark/transparent background — fast, validates styling and timing
- **Composited preview**: overlay `<Player />` layered and synced with an HTML5 `<video>` element — shows the overlay on actual footage in real time

**Note for that spec:** `@remotion/player` (browser/Chromium) and `@remotion/renderer` (Node.js, spawns its own Chrome for headless rendering) will both be present in the Electron app. There is a known conflict risk between Remotion's bundled Chromium and Electron's own Chromium. This must be investigated before committing to the composited preview approach.

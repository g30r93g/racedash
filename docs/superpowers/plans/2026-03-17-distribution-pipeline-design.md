# Distribution Pipeline Design

**Date:** 2026-03-17
**Status:** Approved

## Context

RaceDash's desktop app is built with Electron and packaged via electron-builder. Currently there is no automated release pipeline — installers must be built locally. This design establishes a GitHub Actions workflow to build and publish installers for macOS and Windows, and wires up `electron-updater` so installed copies can receive in-app update notifications.

## Scope

- **Product:** Desktop app (`apps/desktop`) only
- **Platforms:** macOS (single universal DMG — one binary for arm64 + x64) and Windows (NSIS installer, x64)
- **Code signing:** Deferred — unsigned initially. macOS auto-update will not work until signing is added; Windows auto-update works unsigned.
- **Trigger:** Git tag push matching `v*.*.*` or manual `workflow_dispatch`

## Architecture

### Release pipeline

```
push v*.*.* tag
or workflow_dispatch (with version input)
        │
        └──> create-release (ubuntu-latest, creates idempotent draft GitHub Release)
                    │
                    ├──> build-mac  (macos-latest) ──┐
                    │                                ├──> publish-release (marks draft as published)
                    └──> build-win  (windows-latest)─┘
```

**`workflow_dispatch`:** requires a `version` input (e.g. `1.0.0`). All jobs check out `refs/tags/v<version>` explicitly. The tag must exist before dispatching. **Tag push** uses `github.ref` as the checkout ref.

**Idempotency:** `create-release` uses `gh release view <tag> || gh release create <tag> --draft ...` so reruns don't fail on an already-existing draft. A workflow-level `concurrency` key (keyed by tag/version) prevents overlapping runs.

**Version validation:** `create-release` reads `apps/desktop/package.json` and asserts that `version == tag sans v`. Fails fast if there's a mismatch, preventing a publish to the wrong release.

electron-builder owns asset upload. Both build jobs upload to the draft via `--publish always`, and `publish-release` marks it public once both complete.

### Auto-update flow

```
App starts
    │
    └──> autoUpdater.checkForUpdatesAndNotify()   (only when app.isPackaged)
              │
              ├── no update ──> nothing
              │
              └── update available ──> download in background
                        │
                        └── download complete ──> IPC: racedash:update-downloaded
                                  │
                                  └── Renderer: "Update ready — restart to apply" banner
                                            │
                                            └── user clicks ──> IPC: racedash:update-install
                                                      │
                                                      └── main: autoUpdater.quitAndInstall()
```

## Changes Required

### 1. electron-builder publish config + universal arch

Modify `apps/desktop/electron-builder.config.ts`:

```ts
// Change mac arch to universal (single fat binary, not two separate DMGs)
mac: {
  target: [{ target: 'dmg', arch: ['universal'] }],
  category: 'public.app-category.video',
},

// Add publish config
publish: {
  provider: 'github',
  owner: '<github-owner>',
  repo: '<github-repo>',
},
```

`arch: ['universal']` produces a single DMG that runs natively on both Apple Silicon and Intel. `arch: ['arm64', 'x64']` (the current config) produces two separate DMG files — switch to `universal` for better user experience.

This causes electron-builder to generate `latest.yml` / `latest-mac.yml` metadata files and publish all artifacts to GitHub Releases when `GH_TOKEN` is present.

### 2. electron-updater integration

**Install:** Add `electron-updater` to `apps/desktop` as a **runtime dependency** (`dependencies`, not `devDependencies`) — it is bundled into the packaged app.

**IPC types** (`src/types/ipc.ts`): Add updater methods/events to `RacedashAPI`:

```ts
// Update events — main → renderer push via ipcRenderer.on
onUpdateAvailable(cb: (info: { version: string }) => void): () => void
onUpdateDownloaded(cb: () => void): () => void
onUpdateError(cb: (err: { message: string }) => void): () => void

// Trigger install — renderer → main
installUpdate(): Promise<void>
```

**Preload** (`src/preload/index.ts`): Wire up the new channels following the existing `onRender*` pattern (listener + unsubscribe function) and `installUpdate` as `ipcRenderer.invoke('racedash:update-install')`.

**Main process** — new file `src/main/updater.ts`:
- Import `autoUpdater` from `electron-updater`
- Export `registerUpdaterHandlers(win: BrowserWindow): void`
- Guard: return immediately if `!app.isPackaged`
- `autoUpdater.autoDownload = true`
- Event handlers forward to renderer via `win.webContents.send(...)`:
  - `update-available` → `racedash:update-available` with `{ version }`
  - `update-downloaded` → `racedash:update-downloaded`
  - `error` → `racedash:update-error` with `{ message }` (non-fatal, log only)
- `ipcMain.handle('racedash:update-install', () => autoUpdater.quitAndInstall())`
- Call `autoUpdater.checkForUpdatesAndNotify()` at the end

**Main process** (`src/main/index.ts`): Call `registerUpdaterHandlers(win)` after `createWindow()`.

**IPC channels (main → renderer):** `racedash:update-available`, `racedash:update-downloaded`, `racedash:update-error`
**IPC channels (renderer → main):** `racedash:update-install`

**Renderer:** A passive update banner rendered at the top of `App.tsx` (inside the traffic-light drag region, with `WebkitAppRegion: 'no-drag'`). Appears when `onUpdateDownloaded` fires. CTA: "Restart to update". Dismissible.

### 3. GitHub Actions workflow

New file: `.github/workflows/release.yml`

**Triggers:**
```yaml
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
  cancel-in-progress: false   # never cancel an in-flight release

permissions:
  contents: write
```

**Checkout ref expression** (used in all jobs):
```yaml
ref: ${{ github.event_name == 'workflow_dispatch' && format('refs/tags/v{0}', inputs.version) || github.ref }}
```

**`create-release` job** (`ubuntu-latest`):
1. Checkout (ref as above)
2. Extract version: `TAG=${GITHUB_REF_NAME:-v${{ inputs.version }}}`, `VERSION=${TAG#v}`
3. Validate: `node -e "const v=require('./apps/desktop/package.json').version; if(v!=='$VERSION') process.exit(1)"`
4. Create idempotent draft: `gh release view $TAG || gh release create $TAG --draft --title "RaceDash $TAG" --notes ""`
5. Output tag name for downstream jobs

**`build-mac` job** (`macos-latest`, `needs: create-release`):
1. Checkout (ref as above)
2. Setup Node 20 + pnpm 10.26.2
3. `pnpm install --frozen-lockfile`
4. `pnpm turbo build --filter=@racedash/desktop...`
5. `pnpm --filter @racedash/desktop run dist -- --publish always`
6. Env: `GH_TOKEN: ${{ secrets.GH_TOKEN }}`

**`build-win` job** (`windows-latest`, `needs: create-release`):
Same steps as `build-mac`.

**`publish-release` job** (`ubuntu-latest`, `needs: [build-mac, build-win]`):
1. `gh release edit $TAG --draft=false`
2. Env: `GH_TOKEN: ${{ secrets.GH_TOKEN }}`

**Secrets required:** `GH_TOKEN` (repo secret, Personal Access Token with `contents: write`) — used by `gh` CLI and electron-builder to create/edit releases and upload assets.

> Note: The built-in `GITHUB_TOKEN` may work for public repos but a PAT is more reliable across repo visibility settings.

### 4. Version discipline

- `apps/desktop/package.json` `version` field must match the git tag (e.g. tag `v1.0.0` → `"version": "1.0.0"`)
- The `create-release` job enforces this — mismatches fail fast before any build work runs
- Release process: bump version in `package.json` → commit → `git tag v1.0.0` → `git push --follow-tags`
- A helper script (`scripts/bump-version.sh <version>`) can automate the bump + tag sequence

## Deferred Work

| Item | Needed for |
|------|-----------|
| Apple Developer ID cert | macOS auto-update, Gatekeeper-clean installs |
| Notarization (`notarytool`) | macOS auto-update |
| Windows code signing cert | SmartScreen-clean installs |
| Secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD` | Signing in CI |

## Verification

1. Push a test tag (`v0.0.1`) — confirm all four jobs complete and GitHub Release contains: `racedash-0.0.1.dmg`, `racedash-0.0.1-setup.exe`, `latest.yml`, `latest-mac.yml`
2. Trigger `workflow_dispatch` with `version=0.0.1` (tag already exists) — confirm idempotency: existing release is reused, assets re-uploaded, no failure
3. Trigger with a mismatched `package.json` version — confirm `create-release` fails fast with a clear error
4. Install from DMG/EXE, then publish `v0.0.2` — confirm Windows app detects update and shows "Restart to update" banner (macOS will not auto-update until signing is added)
5. Confirm `latest.yml` and `latest-mac.yml` metadata files are present in GitHub Release assets

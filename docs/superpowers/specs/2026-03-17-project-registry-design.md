# Project Registry Design

**Date:** 2026-03-17
**Status:** Approved

## Problem

`listProjectsHandler()` hardcodes a scan of `~/Videos/racedash/`. When a project is created with a custom `saveDir` (a one-off per-project folder anywhere on disk), its `project.json` lands outside that directory and is never discovered by the library. There is no persistence layer tracking where projects were saved.

## Solution

A project registry: a JSON file in Electron's `userData` directory that stores an ordered list of known `project.json` absolute paths. All project discovery, creation, and deletion goes through the registry. No directory scanning.

## Architecture

### Data layer — `src/main/projectRegistry.ts`

A new module owning all registry I/O. Reads and writes `<userData>/projects-registry.json`, which is a plain `string[]` of absolute `project.json` paths.

```ts
getRegistry(): Promise<string[]>
addToRegistry(projectJsonPath: string): Promise<void>
removeFromRegistry(projectJsonPath: string): Promise<void>
replaceInRegistry(oldProjectPath: string, newProjectPath: string): Promise<void>
```

- `addToRegistry`: deduplicates on write — if the path is already in the registry, it is a no-op.
- `removeFromRegistry`: if the path is not found, it is a no-op. Only throws on I/O error.
- `replaceInRegistry`: if `oldProjectPath` is not found, throws an error with `code: 'NOT_FOUND'` (i.e., `Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })`). Callers check `err.code === 'NOT_FOUND'` to distinguish this from I/O errors.

All file operations are fully async. The registry file is created on first write if it does not exist. Corrupt registry JSON (file exists but cannot be parsed) is treated as an empty registry and overwritten on the next write.

**Concurrency:** Registry operations are serialised via a per-process async queue (a simple promise chain). Concurrent IPC calls will not race.

### `listProjectsHandler()` — updated

1. Load the registry via `getRegistry()`
2. For each path, attempt to read and parse `project.json` asynchronously
3. **File does not exist** → include as a missing entry (see Missing Entry Shape below). Path is left in the registry — the user can resolve it with "Locate…".
4. **File exists but cannot be parsed as valid JSON, or the parsed object lacks a `name` string field** → silently omit from results. Path is left in the registry. This is intentional: a corrupt project might be recoverable if the user repairs the file.
5. **File parsed successfully** → strip any `missing` field before returning (guards against a user-edited file containing that key). Use the `projectPath` field from the file as the canonical value; if it is absent, fall back to the registry path.
6. Return the merged array in registry order

No directory scanning. No `~/Videos/racedash/` fallback.

**Note on the empty-state:** If all registry entries are corrupt (silently omitted), `projects` will be an empty array and the library shows "No projects yet." This is acceptable for a first version.

#### Missing Entry Shape

```ts
{
  name: path.basename(path.dirname(registeredPath)) || registeredPath,
  projectPath: registeredPath,
  configPath: '',
  videoPaths: [],
  segments: [],
  selectedDriver: '',
  missing: true,
}
```

### `handleCreateProject()` — updated

The existing handler already copies the joined video into `saveDir` as `video.mp4`, writes `config.json`, and writes `project.json`. After writing `project.json`:

1. Call `addToRegistry(projectPath)`
2. If `addToRegistry` throws, delete `path.join(saveDir, 'project.json')`, `path.join(saveDir, 'config.json')`, and `path.join(saveDir, 'video.mp4')`, then re-throw. Do **not** delete `saveDir` itself — it may be a pre-existing user-owned directory.

### `deleteProjectHandler()` — updated

The "project folder" is `path.dirname(projectPath)`.

1. Call `removeFromRegistry(projectPath)`
   - If the path is **not found** (no-op), still proceed to delete the folder — the user may have bypassed the registry intentionally
   - If `removeFromRegistry` throws an **I/O error**, abort and re-throw without touching the disk
2. `rm -rf` the project folder from disk
3. If folder deletion fails, the registry entry is already removed. Re-throw the error to the caller.

### `renameProjectHandler()` — unchanged

`renameProjectHandler` updates only the display `name` field in `project.json`. It does **not** rename the project directory, so `projectPath` does not change. No registry update is required.

### New IPC channel: `racedash:relocateProject`

Handles the "Locate…" action for missing projects. The entire dialog interaction happens on the **main process** side.

1. Open `dialog.showOpenDialog` attached to `BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]`, with `filters: [{ name: 'RaceDash Project', extensions: ['json'] }]` and `properties: ['openFile']`
2. If the user cancels, reject with `new Error('CANCELLED')`
3. Attempt to read and parse the selected file. If it cannot be parsed or lacks a `name` string field (same validation as `listProjectsHandler` rule 4), reject with a descriptive error
4. If the selected path is already registered under **any entry other than `oldProjectPath`**, reject with `new Error('ALREADY_REGISTERED')`. Selecting the same path as `oldProjectPath` (file reappeared in place) is valid and proceeds normally.
5. Call `replaceInRegistry(oldProjectPath, newProjectPath)`:
   - If it succeeds, continue
   - If it throws with `code === 'NOT_FOUND'` (stale UI), call `addToRegistry(newProjectPath)` instead
   - If it throws any other error, reject with that error
6. Return the `ProjectData` parsed from `newProjectPath`. Set `projectPath` to `newProjectPath` unconditionally (regardless of what the file contains), and strip the `missing` field. This ensures the renderer always has a defined, correct `projectPath` to key on.

### Type changes

**`src/types/project.ts` — `ProjectData`:**

```ts
interface ProjectData {
  // ... existing fields ...
  missing?: true
}
```

`missing` is a runtime-only flag. It is never written to disk.

**`src/types/ipc.ts` — add `relocateProject` to the `RacedashAPI` interface:**

```ts
interface RacedashAPI {
  // ... existing methods ...
  relocateProject: (oldProjectPath: string) => Promise<ProjectData>
}
```

## UI

### `ProjectLibrary.tsx` — loading state

While `loading === true`, render a single `Spinner` component (from `src/renderer/src/components/loaders/Spinner.tsx`) with the label text "Project files are updating". This replaces **both** the tile-view skeleton grid and the list-view skeleton list — the existing two-branch skeleton block is removed entirely.

### `ProjectCard` — missing state

`ProjectCard` gains access to the `missing` flag via `project.missing`. When `missing === true`:

- The wrapping card element is **not** interactive — no click handler fires `window.racedash.openProject`
- The `ContextMenu` wrapper is **not rendered** — the context menu is suppressed entirely
- `ProjectLibrary` passes no-op stubs for `onOpen`, `onRename`, `onDelete` — prop signatures do not change
- The card renders with a red border (`border border-red-500`)
- A small "Missing" badge/label is visible on the card
- A "Locate…" button is shown:
  - **Tile view:** in the card body area, replacing the normal open affordance
  - **List view:** on the right side of the row, where the open action normally appears
- Clicking "Locate…" calls `window.racedash.relocateProject(project.projectPath)`
  - On success: in `projects` state, find the entry where `p.projectPath === project.projectPath` (the old registered path) and replace it with the returned `ProjectData`
  - On `CANCELLED`: no-op
  - On `ALREADY_REGISTERED`: show inline message "This project is already in your library"
  - On any other error: show the error's message string inline on the card

## Data Flow

```
createProject(opts)
  → write video.mp4, config.json, project.json to saveDir
  → addToRegistry(projectPath)
      [on failure: delete video.mp4, config.json, project.json; re-throw]
  → return ProjectData

listProjects()
  → getRegistry()
  → for each path: parse project.json → success | missing | omit
  → return ProjectData[]

deleteProject(projectPath)
  → removeFromRegistry(projectPath)   [I/O error → abort; NOT_FOUND → continue]
  → rm -rf path.dirname(projectPath)  [failure → re-throw]

renameProject(projectPath, name)
  → update name in project.json       [no directory rename; no registry change]
  → return updated ProjectData

relocateProject(oldProjectPath)
  → dialog.showOpenDialog             [cancel → reject CANCELLED]
  → validate project.json             [invalid → reject with error]
  → check not already registered      [duplicate → reject ALREADY_REGISTERED]
  → replaceInRegistry OR addToRegistry on NOT_FOUND
  → return ProjectData (missing stripped)
```

## Error Handling Summary

| Scenario | Behaviour |
|---|---|
| Registry file absent on first launch | Treated as empty; created on first write |
| Registry file present but corrupt JSON | Treated as empty; overwritten on next write |
| `project.json` path in registry does not exist | Surfaced as `missing: true` entry; path kept in registry |
| `project.json` exists but invalid/corrupt or lacks `name` | Silently omitted; path kept in registry |
| `addToRegistry` called with already-registered path | No-op |
| `removeFromRegistry` called with unknown path | No-op; `deleteProject` still proceeds to delete folder |
| `removeFromRegistry` throws an I/O error | Abort; disk untouched; error re-thrown |
| `replaceInRegistry` called with unknown `oldProjectPath` | Throws error with `code: 'NOT_FOUND'` |
| `addToRegistry` fails after project files written | `video.mp4`, `config.json`, `project.json` deleted; `saveDir` untouched; error re-thrown |
| `removeFromRegistry` succeeds but folder delete fails | Registry entry removed; error re-thrown |
| `relocateProject` cancelled by user | Reject `Error('CANCELLED')`; renderer suppresses UI |
| `relocateProject` picks already-registered path (not self) | Reject `Error('ALREADY_REGISTERED')`; renderer shows "This project is already in your library" |
| `relocateProject` picks same path as `oldProjectPath` | Valid relocation (file reappeared); proceeds normally |
| `replaceInRegistry` returns `NOT_FOUND` during relocate | Falls back to `addToRegistry(newProjectPath)` |

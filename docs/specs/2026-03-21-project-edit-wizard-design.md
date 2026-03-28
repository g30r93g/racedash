# Project Edit Wizard

## Summary

Add an "Edit" flow to the editor's Timing tab that lets users modify segments, change driver, and verify lap times for an existing project — without re-selecting video files. The edit wizard reuses existing wizard step components in a new 3-step dialog.

## Motivation

The Edit button on TimingTab (line 218) is currently unconnected. Users need a way to adjust project configuration after creation without starting from scratch.

## Design

### New IPC: `updateProject`

**Refactor**: Extract segment conversion logic from `handleCreateProject` (ipc.ts lines 293-306) into a shared `buildEngineSegments(segments: SegmentConfig[])` helper. Both `handleCreateProject` and the new handler use it.

**Handler**: `updateProjectHandler(projectPath: string, segments: SegmentConfig[], selectedDriver: string) → ProjectData`

1. **Validate**: `projectPath` must exist and end with `project.json`; `segments` must be non-empty; `selectedDriver` must be non-empty
2. Read existing `project.json` to get `configPath`
3. Read existing `config.json`, preserve non-segment keys (styling, overrides, overlayType, boxPosition, qualifyingTablePosition, overlayComponents, etc.)
4. Overwrite `segments` using `buildEngineSegments()` and update `driver`
5. Write updated `config.json`
6. Update `project.json` with new `segments` and `selectedDriver`
7. Return updated `ProjectData`

**Preload/types**: Expose as `window.racedash.updateProject(projectPath, segments, selectedDriver)`.

### `ProjectEditWizard` component

**File**: `screens/wizard/ProjectEditWizard.tsx`

- 3-step dialog: Segments → Driver → Verify
- Props: `project: ProjectData`, `onSave: (updated: ProjectData) => void`, `onCancel: () => void`
- State initialized from existing project: `{ segments: project.segments, selectedDriver: project.selectedDriver }`
- Reuses `StepIndicator`, `Step2Segments`, `Step3Driver`, `Step4Verify` unchanged
- `Step2Segments` receives `project.videoPaths` as `videoPaths` and `project.videoPaths[0]` as `joinedVideoPath`
- Tracks `segmentSubForm` state via `onSubFormChange` to hide footer buttons when a segment sub-form is open (mirrors creation wizard behavior)
- Tracks `saveError` state — displayed on the Verify step if the IPC call fails
- Final step footer shows **Save** button → calls `window.racedash.updateProject(...)` → on success passes result to `onSave`; on failure sets `saveError`

### Editor integration

**`Editor.tsx`**:
- Replace direct use of `project` prop with `const [projectState, setProjectState] = useState(project)` — all effects and child components use `projectState`
- Add a `configRevision` counter state (starts at 0). Include it in the dependency arrays for the `generateTimestamps` and `readProjectConfig` effects so they re-fire after an edit, even though `configPath` doesn't change
- When `onProjectUpdate` fires: call `setProjectState(updated)`, increment `configRevision`, reset overrides (`setOverrides([])`), and re-init style history (`dispatchStyle({ type: 'init', initial: DEFAULT_STYLE_STATE })` — the readProjectConfig effect will re-load the actual saved style)

**`EditorTabsPane.tsx`**:
- Add `onProjectUpdate: (updated: ProjectData) => void` prop, threaded down to `TimingTab`

**`TimingTab.tsx`**:
- Add `onProjectUpdate` prop
- Wire Edit button to `onClick={() => setEditWizardOpen(true)}`
- Render `<ProjectEditWizard>` when open
- On save: call `onProjectUpdate` with updated data, close wizard
- Remove the independent `generateTimestamps` call — TimingTab already receives `videoInfo` as a prop but duplicates timestamp generation. After the edit, lift `timestampsResult` to Editor and pass it down so there's a single source of truth. This also means `TimingTab` no longer needs `configPath` or the loading/error state for timestamp fetching.

**Data flow**: Edit button → wizard dialog → IPC `updateProject` → `onSave` → `TimingTab.onProjectUpdate` → `EditorTabsPane.onProjectUpdate` → `Editor.setProjectState` + increment `configRevision` + reset overrides → effects re-run (timestamps regenerate, style reloaded, overrides re-read from config)

## Testing

- **`buildEngineSegments` unit test**: Verify extracted helper produces correct engine config for each timing source type
- **`updateProjectHandler` unit tests**: Correctly merges new segments/driver into config.json while preserving existing styling/overrides; updates project.json accurately; rejects invalid inputs (missing projectPath, empty segments, empty driver)

No new UI tests — edit wizard reuses existing step components unchanged.

## Files to create

- `apps/desktop/src/renderer/src/screens/wizard/ProjectEditWizard.tsx`

## Files to modify

- `apps/desktop/src/main/ipc.ts` — extract `buildEngineSegments`, add `updateProjectHandler`, register IPC handler
- `apps/desktop/src/types/ipc.ts` — add `updateProject` to IPC channel types
- `apps/desktop/src/preload/index.ts` — expose `updateProject`
- `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` — local project state, `configRevision`, reset overrides/style on update, lift `timestampsResult` ownership
- `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` — thread `onProjectUpdate`
- `apps/desktop/src/renderer/src/screens/editor/tabs/TimingTab.tsx` — wire Edit button, render wizard, remove duplicate `generateTimestamps` (receive from parent)

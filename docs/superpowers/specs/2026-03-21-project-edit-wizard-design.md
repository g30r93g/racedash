# Project Edit Wizard

## Summary

Add an "Edit" flow to the editor's Timing tab that lets users modify segments, change driver, and verify lap times for an existing project — without re-selecting video files. The edit wizard reuses existing wizard step components in a new 3-step dialog.

## Motivation

The Edit button on TimingTab (line 218) is currently unconnected. Users need a way to adjust project configuration after creation without starting from scratch.

## Design

### New IPC: `updateProject`

**Refactor**: Extract segment conversion logic from `handleCreateProject` (ipc.ts lines 293-306) into a shared `buildEngineSegments(segments: SegmentConfig[])` helper. Both `handleCreateProject` and the new handler use it.

**Handler**: `updateProjectHandler(projectPath: string, segments: SegmentConfig[], selectedDriver: string) → ProjectData`

1. Read existing `project.json` to get `configPath`
2. Read existing `config.json`, preserve non-segment keys (styling, overrides, overlayType, etc.)
3. Overwrite `segments` using `buildEngineSegments()` and update `driver`
4. Write updated `config.json`
5. Update `project.json` with new `segments` and `selectedDriver`
6. Return updated `ProjectData`

**Preload/types**: Expose as `window.racedash.updateProject(projectPath, segments, selectedDriver)`.

### `ProjectEditWizard` component

**File**: `screens/wizard/ProjectEditWizard.tsx`

- 3-step dialog: Segments → Driver → Verify
- Props: `project: ProjectData`, `onSave: (updated: ProjectData) => void`, `onCancel: () => void`
- State initialized from existing project: `{ segments: project.segments, selectedDriver: project.selectedDriver }`
- Reuses `StepIndicator`, `Step2Segments`, `Step3Driver`, `Step4Verify` unchanged
- `Step2Segments` receives `project.videoPaths` as `videoPaths` and `project.videoPaths[0]` as `joinedVideoPath`
- Final step footer shows **Save** button → calls `window.racedash.updateProject(...)` → passes result to `onSave`

### Editor integration

**`Editor.tsx`**:
- Replace direct use of `project` prop with `const [projectState, setProjectState] = useState(project)` — effects use `projectState` so they re-fire after edits

**`EditorTabsPane.tsx`**:
- Add `onProjectUpdate: (updated: ProjectData) => void` prop, threaded down to `TimingTab`

**`TimingTab.tsx`**:
- Add `onProjectUpdate` prop
- Wire Edit button to open `<ProjectEditWizard>` in a dialog
- On save: call `onProjectUpdate` with updated data, close wizard

**Data flow**: Edit button → wizard dialog → IPC `updateProject` → `onSave` → `TimingTab.onProjectUpdate` → `EditorTabsPane.onProjectUpdate` → `Editor.setProjectState` → effects re-run (timestamps regenerate)

## Testing

- **`buildEngineSegments` unit test**: Verify extracted helper produces correct engine config for each timing source type
- **`updateProjectHandler` unit tests**: Correctly merges new segments/driver into config.json while preserving existing styling/overrides; updates project.json accurately

No new UI tests — edit wizard reuses existing step components unchanged.

## Files to create

- `apps/desktop/src/renderer/src/screens/wizard/ProjectEditWizard.tsx`

## Files to modify

- `apps/desktop/src/main/ipc.ts` — extract `buildEngineSegments`, add `updateProjectHandler`, register IPC handler
- `apps/desktop/src/types/ipc.ts` — add `updateProject` to IPC channel types
- `apps/desktop/src/preload/index.ts` — expose `updateProject`
- `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` — local project state
- `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx` — thread `onProjectUpdate`
- `apps/desktop/src/renderer/src/screens/editor/tabs/TimingTab.tsx` — wire Edit button, render wizard

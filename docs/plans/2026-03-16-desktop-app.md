# Desktop App — Application UI (Plan A2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full application UI for the racedash desktop app, turning the Plan A1 scaffold into a working product: project library, 5-step creation wizard, video preview, timeline, and tabbed configuration panels.

**Architecture:** The renderer is a single React tree. Top-level routing is a single piece of state — when a `ProjectData` is loaded, render the Editor; otherwise render the Project Library. No router library is needed. All IPC calls live in custom hooks. The wizard runs as a modal overlay on top of the library screen.

**Tech Stack:** Electron 33, React 18, shadcn/ui, Tailwind CSS v4, TypeScript, `window.racedash` IPC

**Prerequisite:** Plan A1 (`2026-03-16-desktop-scaffold.md`) must be complete. The scaffold is already implemented — `apps/desktop/` exists with Electron main/preload/renderer, shadcn/ui, Tailwind v4, and all IPC stubs.

---

## Sub-plan Execution Order

Execute sub-plans in this order. Each depends on the previous being complete.

| # | Sub-plan | Scope | Plan file |
|---|----------|-------|-----------|
| 1 | App Shell | Window chrome, drag region, traffic light clearance, top-level routing skeleton, new IPC stubs, `ProjectData` type | `2026-03-16-desktop-app-shell.md` |
| 2 | Splash / Project Library | Full-window library screen, sidebar nav, project cards grid, open project, new project button | `2026-03-16-desktop-splash.md` |
| 3 | Project Creation Wizard | 5-step modal wizard, all timing source form variants, video offset picker, `createProject` IPC | `2026-03-16-desktop-wizard.md` |
| 4 | Editor Video Preview + Timeline | Left pane: video area, timeline rows (VIDEO/SEGMENTS/LAPS/POSITION), zoom controls | `2026-03-16-desktop-editor-video.md` |
| 5 | Editor Tabs | Right pane: Timing tab, Style tab (+ overlay picker modal), Export tab, render flow | `2026-03-16-desktop-editor-tabs.md` |

---

## Shared Architecture

### Top-level routing

`App.tsx` holds a single `project: ProjectData | null` state:

```tsx
// src/renderer/src/App.tsx
const [project, setProject] = useState<ProjectData | null>(null)

return project
  ? <Editor project={project} onClose={() => setProject(null)} />
  : <ProjectLibrary onOpen={setProject} />
```

`ProjectLibrary` passes `onOpen` to both the project card click handler (load existing) and the wizard (after creation completes).

### ProjectData type

Defined in `src/types/project.ts` (created in App Shell sub-plan). Mirrors the shape written to `project.json` on disk, plus in-memory video paths.

```ts
// src/types/project.ts

export type TimingSource = 'alpha-timing' | 'speedhive' | 'daytona' | 'teamsport' | 'manual'

export interface SegmentConfig {
  label: string
  source: TimingSource
  // source-specific (only the relevant one is set):
  resultsUrl?: string        // alpha-timing: URL to results page
  eventId?: string           // speedhive: numeric event ID
  session?: string           // speedhive: e.g. "Race"
  resultsFilePath?: string   // daytona, teamsport: path to .eml/.txt file
  sessionName?: string       // speedhive, daytona, teamsport: optional name override
  videoOffsetFrame?: number  // all: frame number in the joined video where this segment starts
}

export interface ProjectData {
  name: string
  projectPath: string        // absolute path to project.json on disk
  videoPaths: string[]       // ordered list of raw video chapter files
  segments: SegmentConfig[]
  selectedDriver: string     // display name, e.g. "G. Gorzynski"
}
```

### File structure (renderer)

```
src/renderer/src/
  App.tsx                          ← top-level routing (modified in App Shell)
  types/project.ts                 ← ProjectData (created in App Shell)
  screens/
    ProjectLibrary.tsx             ← Splash sub-plan
    wizard/
      ProjectCreationWizard.tsx    ← Wizard sub-plan (modal entry point)
      steps/
        Step1Videos.tsx
        Step2Segments.tsx
        Step2AddSegmentForm.tsx
        Step2OffsetPicker.tsx
        Step3Driver.tsx
        Step4Verify.tsx
        Step5Confirm.tsx
    editor/
      Editor.tsx                   ← wrapper (created in App Shell)
      VideoPane.tsx                ← Editor Video sub-plan
      TimelinePane.tsx             ← Editor Video sub-plan
      tabs/
        TimingTab.tsx              ← Editor Tabs sub-plan
        StyleTab.tsx               ← Editor Tabs sub-plan
        ExportTab.tsx              ← Editor Tabs sub-plan
        OverlayPickerModal.tsx     ← Editor Tabs sub-plan
```

### IPC surface

**Already stubbed in scaffold** (implement in the noted sub-plan):

| Channel | Implement in |
|---------|--------------|
| `racedash:checkFfmpeg` | App Shell |
| `racedash:openFile` | App Shell |
| `racedash:openFiles` | App Shell |
| `racedash:openDirectory` | App Shell |
| `racedash:revealInFinder` | App Shell |
| `racedash:listDrivers` | Editor Tabs |
| `racedash:generateTimestamps` | Editor Tabs |
| `racedash:getVideoInfo` | Editor Video |
| `racedash:startRender` | Editor Tabs |
| `racedash:cancelRender` | Editor Tabs |

**New stubs added in App Shell, implemented in noted sub-plan:**

| Channel | Implement in | Description |
|---------|--------------|-------------|
| `racedash:listProjects` | Splash | Scan default projects dir for `project.json` files; return array of `ProjectData` |
| `racedash:openProject` | Splash | Read and parse a `project.json` by path; return `ProjectData` |
| `racedash:createProject` | Wizard | Join video files (ffmpeg concat), write `project.json`, return `ProjectData` |

### What is explicitly deferred

- **Racedash Cloud**: Cloud Renders sidebar tab, Account sidebar tab, Cloud footer in editor. Rendered as disabled/placeholder stubs in all sub-plans.
- **Video playback**: The Editor Video sub-plan builds the UI shell; actual `<video>` playback is a follow-on.
- **FFmpeg auto-download**: `checkFfmpeg` returns a stub result; real binary download is a follow-on.

---

## Design References

All artboards are in the Paper file "RaceDash":

| Paper page | Artboards |
|------------|-----------|
| `Splash/Project Library` | Project Library — Projects, Cloud Renders (stub), Account (stub) |
| `Project Creation Wizard` | Onboarding Wizard — Steps 1–5 (all variants) |
| `Editor` | Editor — Timing tab, Style tab, Export tab, Overlay picker modal |

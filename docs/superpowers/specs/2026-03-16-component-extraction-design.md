# Component Extraction Design

**Goal:** Restructure the desktop app renderer into a proper two-layer component architecture. All UI is composed from shadcn/ui primitives. App-specific compositions live in `components/app/`. Screens become thin consumers of those components.

**Approach — Option A (component layer first):**
- **Pass 1:** Install all shadcn/ui primitives and build all `components/app/` components. Screens are untouched and continue to work.
- **Pass 2:** Rewrite each screen to consume the new components, deleting all inlined implementations.

---

## Directory Shape

```
src/renderer/src/
  components/
    ui/                          ← shadcn/ui primitives (auto-generated, do not edit)
      button.tsx                 ← existing
      input.tsx                  ← existing
      label.tsx                  ← existing
      select.tsx                 ← existing
      tabs.tsx                   ← existing
      dialog.tsx                 ← new
      sidebar.tsx                ← new
      table.tsx                  ← new
      progress.tsx               ← new
      badge.tsx                  ← new
      avatar.tsx                 ← new
      separator.tsx              ← new
      scroll-area.tsx            ← new
      skeleton.tsx               ← new
      tooltip.tsx                ← new
      toggle-group.tsx           ← new
      slider.tsx                 ← new
      file-upload.tsx            ← new (shadcnblocks; replaces file-drop.tsx)
    app/                         ← new — app-specific composed components
      AppSidebar.tsx
      ProjectCard.tsx
      CloudRendersList.tsx
      AccountDetails.tsx
      StepIndicator.tsx
      FileUpload.tsx
      VideoPlayer.tsx
      VideoPlaybackControls.tsx
      Timeline.tsx
      TimingTable.tsx
      SectionLabel.tsx
      InfoRow.tsx
      ColourRow.tsx
      DriverPickerModal.tsx
  screens/                       ← Pass 2 rewrites; untouched during Pass 1
```

---

## Pass 1 — shadcn/ui Component Installs

Install each component via the commands below. Do not customise generated files.

```bash
npx shadcn add dialog
npx shadcn add sidebar
npx shadcn add table
npx shadcn add progress
npx shadcn add badge
npx shadcn add avatar
npx shadcn add separator
npx shadcn add scroll-area
npx shadcn add skeleton
npx shadcn add tooltip
npx shadcn add toggle-group
npx shadcn add slider
npx shadcn add @shadcnblocks/file-upload/file-upload-validation-6
```

After install, delete `components/ui/file-drop.tsx` — it is replaced by the shadcnblocks `file-upload.tsx`.

---

## Pass 1 — App Components

### `components/app/SectionLabel.tsx`

Single-purpose label used above settings sections in the editor tabs. Extracted from `StyleTab`, `ExportTab`, and `TimingTab` where it is currently duplicated verbatim.

```tsx
interface SectionLabelProps { children: React.ReactNode }
```

Renders: `<p>` with `text-[10px] font-semibold uppercase tracking-widest text-muted-foreground`.

---

### `components/app/InfoRow.tsx`

Key/value display row used in `ExportTab` (source video info) and `AccountDetails` (subscription details).

```tsx
interface InfoRowProps {
  label: string
  value: string
}
```

Renders a flex row: label on the left (`text-xs text-muted-foreground`), value on the right (`text-xs text-foreground`). Vertically padded with `py-1.5`.

---

### `components/app/ColourRow.tsx`

Colour picker row combining a native `<input type="color">` (hidden, triggered by a swatch button) and a hex text input. Extracted from `StyleTab`.

```tsx
interface ColourRowProps {
  label: string
  value: string           // hex string, e.g. "#3b82f6"
  onChange: (hex: string) => void
}
```

The swatch button (`h-5 w-5 rounded border border-border`) triggers the hidden colour input. The text field validates on blur — reverts to `value` if the draft is not a valid 6-digit hex.

---

### `components/app/StepIndicator.tsx`

Wizard step progress indicator. Replaces `screens/wizard/WizardStepIndicator.tsx` (that file is deleted in Pass 2).

```tsx
interface StepIndicatorProps {
  steps: readonly string[]
  currentStep: number        // 1-based
}
```

Renders a horizontal list of labelled step circles. Completed steps show a filled circle; the active step shows the step number; future steps show an unfilled circle. No internal state — fully controlled.

---

### `components/app/FileUpload.tsx`

Wraps the shadcnblocks `file-upload` component and bridges from web `File` objects to Electron file system paths. Replaces `components/ui/file-drop.tsx`.

```tsx
interface FileUploadProps {
  value?: string             // currently selected file path (shows as pill)
  placeholder?: string
  hint?: string              // subtext below the drop zone
  accept?: string[]          // file extensions, e.g. ['eml', 'txt']
  onFile: (path: string) => void
}
```

On drop or click-to-browse, reads `File.path` (available in Electron's renderer) to get the absolute path and calls `onFile`. Falls back to `window.racedash.openFile` for the click-to-browse path if `File.path` is unavailable.

---

### `components/app/AppSidebar.tsx`

The left sidebar used in the Project Library modal. Uses shadcn `Sidebar`.

```tsx
type LibraryTab = 'projects' | 'cloud-renders' | 'account'

interface AppSidebarProps {
  activeTab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
  cloudRenderCount: number
  user: {
    name: string
    email: string
    plan: 'free' | 'pro'
  }
}
```

Structure:
- **Header:** Racedash logo (blue circle + checkmark SVG) + wordmark.
- **Nav:** Three items — Projects (grid icon), Cloud Renders (cloud icon, shows `Badge` with count), Account (person icon). Active item has `bg-white/10` highlight.
- **Footer:** `Avatar` with initials + name + `Badge` showing plan tier (PRO).

Uses shadcn `Avatar`, `Badge`, `Separator`.

---

### `components/app/ProjectCard.tsx`

Single project card in the library grid. Extracted from the inlined `ProjectCard` in `ProjectLibrary.tsx`.

```tsx
interface ProjectCardProps {
  project: ProjectData
  onOpen: (project: ProjectData) => void
}
```

Manages its own `loading` boolean state. On click, calls `window.racedash.openProject(project.projectPath)` then calls `onOpen` on success. Shows a spinner in the thumbnail area while loading. Uses `Skeleton` for the thumbnail placeholder before load.

---

### `components/app/CloudRendersList.tsx`

Content for the Cloud Renders tab in the Project Library. Currently unimplemented — net-new component.

```tsx
interface CloudRendersListProps {
  // no props — reads from IPC internally via useEffect
}
```

Internal state: `jobs: CloudRenderJob[]`, `loading: boolean`. Type `CloudRenderJob`:

```ts
interface CloudRenderJob {
  id: string
  projectName: string
  sessionType: 'Race' | 'Qualifying' | 'Practice'
  status: 'queued' | 'in-progress' | 'completed'
  startedAt?: string        // ISO string
  resolution: string        // e.g. "1080p"
  renderMode: string        // e.g. "Overlay + Footage"
  progress?: number         // 0–1, for in-progress jobs
  outputUrl?: string        // for completed jobs
  youtubeUrl?: string       // for completed + uploaded jobs
  timeRemaining?: string    // e.g. "~2 min remaining"
  storageUsedGb: number
  storageLimitGb: number
}
```

Renders three sections separated by `Separator`: **Queued**, **In Progress**, **Completed**. Each job row shows: project name, `Badge` for session type, metadata row (timestamp · resolution · render mode). In-progress jobs show a `Progress` bar. Completed jobs show Download and YouTube action buttons. Footer shows storage usage bar and "Manage storage" link. Uses `ScrollArea` for the job list.

> Note: Cloud Renders IPC is deferred — use a stub that returns `[]` with `loading: false` until the backend is implemented.

---

### `components/app/AccountDetails.tsx`

Content for the Account tab in the Project Library. Currently unimplemented — net-new component.

```tsx
interface AccountDetailsProps {
  // no props — reads from a static/stubbed user context
}
```

Renders:
- **Header:** `Avatar` with initials + name + email + PRO `Badge`.
- **Subscription section:** `Separator`, then two `InfoRow`s (Plan, Renews), then a full-width "Manage subscription ↗" `Button` (variant outline).
- **Security section:** `Separator`, then a "Change password ›" row (navigates to external URL — stub for now).
- **Sign out:** Full-width `Button` (variant destructive, styled `bg-red-950 text-red-500`).

> Note: Auth/user state is deferred — use static placeholder data (G. Gorzynski, george@university.ac.uk, Pro, renews 1 Apr 2026).

---

### `components/app/VideoPlayer.tsx`

Shell for the video playback area. Extracted from `VideoPane.tsx`.

```tsx
interface VideoPlayerProps {
  videoPath?: string
}
```

If `videoPath` is undefined, renders the "NO VIDEO LOADED" placeholder (play icon + label). If provided, renders a `<video>` element with `src={`file://${videoPath}`}`, `muted`, `preload="metadata"`. The timecode overlay (`00:00:00.000`) is always present in the bottom-right corner. Uses a `ref` forwarded to the video element so parent can control playback.

---

### `components/app/VideoPlaybackControls.tsx`

Playback controls bar beneath the video. Extracted from `VideoPane.tsx`.

```tsx
interface VideoPlaybackControlsProps {
  duration: number           // seconds
  currentTime: number        // seconds
  playing: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
}
```

Contains: play/pause `Button` (icon variant) wrapped in `Tooltip`, a `Slider` for the scrubber, and a timecode readout. All icon buttons use shadcn `Tooltip` with descriptive labels.

---

### `components/app/Timeline.tsx`

The four-row timeline (VIDEO / SEGMENTS / LAPS / POSITION) with time ruler and zoom controls. Extracted from `TimelinePane.tsx`.

```tsx
interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}
```

Internal helpers `TrackRow`, `rulerTicks`, `formatRulerLabel`, `pct`, `widthPct` all move inside this component. Zoom buttons use shadcn `Button` (size `icon`, variant `outline`). No other changes to logic.

---

### `components/app/TimingTable.tsx`

Lap timing data table. Extracted from `TimingTab.tsx` and reused in `Step4Verify.tsx`.

```tsx
interface LapRow {
  lap: number
  timeMs: number
  position: number
}

interface TimingTableProps {
  rows: LapRow[]
  bestLapTimeMs?: number     // if provided, that row is highlighted
}
```

Uses shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`. Best lap row uses `text-foreground font-medium`; others use `text-muted-foreground`.

---

### `components/app/DriverPickerModal.tsx`

Driver selection modal extracted from `TimingTab.tsx`. Uses shadcn `Dialog`.

```tsx
interface DriverPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  configPath: string
  onSelect: (driverName: string) => void
}
```

On open, calls `window.racedash.listDrivers({ configPath })`. Shows a loading state, error state, or list of driver buttons. Uses `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`. Cancel button uses `Button` (variant ghost).

---

## Pass 2 — Screen Rewrites

Each rewrite replaces inlined implementations with imports from `components/`. Screens keep all state, IPC calls, and logic — only the JSX and local helper components change.

---

### `screens/ProjectLibrary.tsx`

**Remove:** Inlined `Sidebar`, `ProjectCard`, `LoadingSkeleton`, `EmptyState`, `FolderIcon`, `CloudIcon`, `AccountIcon` — all deleted from this file.

**Add:**
- Import `AppSidebar` — replaces the inlined sidebar.
- Import `ProjectCard` — replaces the inlined card.
- Import `CloudRendersList` — rendered when `activeTab === 'cloud-renders'`.
- Import `AccountDetails` — rendered when `activeTab === 'account'`.
- Add `activeTab: LibraryTab` state (default `'projects'`).
- Content area switches on `activeTab` to show Projects grid, `CloudRendersList`, or `AccountDetails`.
- Projects grid uses `Skeleton` (from `components/ui/skeleton`) for the loading state instead of the custom `LoadingSkeleton`.
- Outer scroll area uses `ScrollArea`.
- `Separator` between sidebar header and nav items.

---

### `screens/wizard/ProjectCreationWizard.tsx`

**Remove:** Manual `fixed inset-0` backdrop div and the `useEffect` keydown listener for Escape.

**Add:**
- Wrap content in shadcn `Dialog` / `DialogContent`. Set `open={true}` (the wizard is always mounted when visible — `App.tsx` controls mounting). `onOpenChange` calls `onCancel` when the dialog is dismissed (covers Escape key natively).
- Import `StepIndicator` from `components/app/StepIndicator` — replaces `WizardStepIndicator`.

**Delete:** `screens/wizard/WizardStepIndicator.tsx`.

---

### `screens/wizard/steps/Step1Videos.tsx`

**Remove:** The entire inline drag-and-drop zone (`handleDrop`, `handleDragOver`, the dashed drop target `<div>`, and the file list display). This file does not use `FileDrop` — it has its own self-contained drag-and-drop implementation.

**Add:** `FileUpload` from `components/app/FileUpload` with `multiple={true}`, `accept={['mp4', 'mov', 'mkv']}`. `onFile` receives a single path — call it once per file to build the `videoPaths` array, or extend `FileUpload` to support a multi-file `onFiles: (paths: string[]) => void` variant if the shadcnblocks component supports multi-select.

---

### `screens/wizard/steps/Step2Segments.tsx`

**Change:** The "Add another segment" dashed raw `<button>` → shadcn `Button` (variant outline, full width, with dashed border via className override).

---

### `screens/wizard/steps/Step2AddSegmentForm.tsx`

**Remove:** `FileDrop` import; timing source pill `<button>` loop.

**Add:**
- `FileUpload` from `components/app/FileUpload` — replaces `FileDrop`.
- `ToggleGroup` / `ToggleGroupItem` from `components/ui/toggle-group` — replaces the timing source pill selector. Each `TimingSource` value becomes a `ToggleGroupItem`.

---

### `screens/wizard/steps/Step2OffsetPicker.tsx`

**Remove:** `fixed inset-0` manual overlay; all raw `<button>` elements; raw `<input type="range">`.

**Add:**
- Wrap in `Dialog` / `DialogContent` — `open` controlled by parent (`showOffsetPicker` state in `Step2AddSegmentForm`). Extract this component's render into a proper `DialogContent` with `DialogHeader` and `DialogTitle`.
- Frame nav buttons (⏮ -10, ← Prev, Next →, +10 ⏭) → shadcn `Button` (variant outline, size sm).
- Confirm and Cancel buttons → shadcn `Button`.
- `<input type="range">` → shadcn `Slider`. Props: `min={0}`, `max={totalFrames - 1}`, `value={[currentFrame]}`, `onValueChange={([v]) => seekToFrame(v)}`.

**Interface change:** Accept `open: boolean` and `onOpenChange: (open: boolean) => void` props so the parent controls dialog visibility via state rather than conditional rendering.

---

### `screens/wizard/steps/Step3Driver.tsx`

**Change:** Driver selection row raw `<button>` elements → shadcn `Button` (variant ghost, full width, `justify-start`). Selected state adds `bg-primary/10 border-primary` via className.

---

### `screens/wizard/steps/Step4Verify.tsx`

**Remove:** Raw `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<td>`.

**Add:** `TimingTable` from `components/app/TimingTable`. `Step4Verify` has a local `LapRow` type with `lapTime: string` (pre-formatted, e.g. `"1:21.089"`) rather than `timeMs: number`. To avoid a conversion that would lose precision on placeholder data, `TimingTable` should support a `lapTimeLabel?: string` field on each row — when provided it is rendered directly instead of formatting `timeMs`. Update `TimingTableProps` accordingly.

---

### `screens/wizard/steps/Step5Confirm.tsx`

**Change:** Inline `SummaryRow` → `InfoRow` from `components/app/InfoRow`. Update call sites accordingly.

---

### `screens/editor/VideoPane.tsx`

**Remove:** All JSX — the component becomes a thin wrapper.

**Add:** `VideoPlayer` from `components/app/VideoPlayer`. Pass `videoPath` prop (currently `VideoPane` accepts none — the prop is added here). `VideoPlaybackControls` rendered beneath the player, with stub props (`playing={false}`, `currentTime={0}`, `duration={0}`, no-op handlers) until playback is wired.

**Call-site update — `Editor.tsx`:** `VideoPane` is rendered by `Editor.tsx`. Add `videoPath={project.videoPaths[0]}` at the call site so the new prop is threaded through. No other changes to `Editor.tsx`.

---

### `screens/editor/TimelinePane.tsx`

**Remove:** All JSX and internal helpers (`TrackRow`, `rulerTicks`, `formatRulerLabel`).

**Add:** `Timeline` from `components/app/Timeline`. Pass `project` and `videoInfo` props unchanged.

---

### `screens/editor/EditorTabsPane.tsx`

**Change:** Racedash Cloud footer "Sign in" raw `<button>` → shadcn `Button` (variant ghost, size sm, disabled).

---

### `screens/editor/tabs/OverlayPickerModal.tsx`

**Remove:** `fixed inset-0` manual backdrop div and `onClick` close-on-backdrop handler.

**Add:** Wrap content in `Dialog` / `DialogContent`. Props change: add `open: boolean`; `onClose` becomes `onOpenChange: (open: boolean) => void`. Update `StyleTab` call site.

---

### `screens/editor/tabs/StyleTab.tsx`

**Remove:** Inlined `SectionLabel` and `ColourRow` definitions.

**Add:**
- `SectionLabel` from `components/app/SectionLabel`.
- `ColourRow` from `components/app/ColourRow`.
- Update `OverlayPickerModal` call site: pass `open={showOverlayPicker}` and `onOpenChange={setShowOverlayPicker}` instead of `onClose`.
- "Change" raw `<button>` → `Button` (variant link or ghost, size sm).

---

### `screens/editor/tabs/ExportTab.tsx`

**Remove:** Inlined `SectionLabel`, `InfoRow`, `ToggleGroup` definitions; manual progress bar `<div>`.

**Add:**
- `SectionLabel` from `components/app/SectionLabel`.
- `InfoRow` from `components/app/InfoRow`.
- `ToggleGroup` / `ToggleGroupItem` from `components/ui/toggle-group` — replaces the custom `ToggleGroup` implementation.
- `Progress` from `components/ui/progress` — replaces the manual `<div>` progress bar. `value={Math.round(renderProgress * 100)}`.
- "Show in Finder" raw `<button>` → `Button` (variant link, size sm).

---

### `screens/editor/tabs/TimingTab.tsx`

**Remove:** Inlined `SectionLabel`; raw `<table>` block; driver picker `fixed inset-0` inline modal; segment selector raw `<button>` loop.

**Add:**
- `SectionLabel` from `components/app/SectionLabel`.
- `TimingTable` from `components/app/TimingTable` — replaces the raw `<table>`.
- `DriverPickerModal` from `components/app/DriverPickerModal` — replaces the inline driver picker modal. Pass `open={showDriverPicker}`, `onOpenChange={setShowDriverPicker}`, `configPath={project.projectPath}`, `onSelect={(name) => { setSelectedDriver(name) }}`.
- `ToggleGroup` / `ToggleGroupItem` from `components/ui/toggle-group` — replaces the segment selector raw `<button>` loop.
- "Change" and "Edit" raw `<button>` → `Button` (variant ghost or link, size sm).
- "+ Add" raw `<button>` → `Button` (variant ghost, size sm).

---

## Deletions

At the end of Pass 2, delete these files — they are fully replaced:

| File | Replaced by |
|---|---|
| `components/ui/file-drop.tsx` | `components/app/FileUpload.tsx` |
| `screens/wizard/WizardStepIndicator.tsx` | `components/app/StepIndicator.tsx` |

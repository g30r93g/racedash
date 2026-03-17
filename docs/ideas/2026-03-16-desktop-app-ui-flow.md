# Desktop App — UI Flow

**Date:** 2026-03-16
**Status:** Agreed
**Feeds into:** Screen design in Paper, then implementation

---

## Mental Model

The app is **project-based**. A project is a race session: a set of joined GoPro video files, one or more named segments (each with its own timing source and video offset), and render settings. The app remembers all projects between launches. The primary unit of work is a single project — opening the app takes you to your project library, not a blank slate.

A **segment** maps to a distinct session within the recording (e.g. Practice, Qualifying, Race). Each segment has a label, a timing source type + config, and a video offset (the frame number where that session begins). A project may have one or more segments; they may use different timing source types.

---

## Screen Map

```
App launch
  ├─ No FFmpeg → Setup screen (full-screen, blocks app)
  └─ FFmpeg OK → Project library overlay on editor skeleton
       ├─ Empty state: centred "No projects yet" + single CTA button
       ├─ Filled state: grid of project cards sorted by last opened date
       │    Card contents: video thumbnail, project name, last opened date
       └─ "+ New RaceDash Project" button (top right)
            └─ Onboarding wizard overlay on editor skeleton
                 Steps (linear, can go back):
                   1. Select videos (GoPro chapters)
                   2. Define segments
                        - List view: segment cards (label, source badge, frame offset) + "Add segment" button
                        - Add/edit sub-view: label input, source type picker (5 chips), source config form,
                          video offset picker ("Set in video" → opens offset picker modal)
                        - Offset picker modal: video preview, scrub bar, prev/next frame (+/−10),
                          timecode display, "Use frame N" confirm
                   3. Select driver (conditional: not shown when all segments are Manual)
                   4. Verify lap data (tabbed by segment when project has multiple segments)
                   5. Confirm → join runs in background, project saved → editor opens

Editor (always present as skeleton behind overlays)
  ├─ Left 2/3
  │    ├─ Top: Video preview
  │    └─ Bottom: Timeline
  │         - Read-only (no editing)
  │         - Scrub by clicking
  │         - Zoomable: max 30 seconds visible range
  │         - Shows: segments, lap markers, position change markers
  └─ Right 1/3: Tabbed panel
       ├─ Timing — data source, driver selection, lap overrides
       ├─ Style  — overlay style type, overlay position, accent/leaderboard/fade settings
       └─ Export — output resolution, output path, render trigger

OS menu bar → Utilities menu
  ├─ Doctor     → opens as modal dialog
  └─ Timestamps → opens as modal dialog
```

---

## Key Design Decisions

### Overlay pattern
Both the project library and the onboarding wizard are **overlays on top of the editor skeleton**. The editor is always rendered behind them, giving the user a sense of the workspace they're working toward. When an overlay closes, the editor comes to life without any transition to a new screen.

### Project library
- Grid layout, not a list
- Cards show: video thumbnail (first frame), project name, last opened date
- Sorted by last opened date (most recent first)
- Empty state: centred prompt with a single "New RaceDash Project" CTA — no illustration

### Onboarding wizard
- Linear steps, one per screen within the overlay
- Can navigate backwards
- The video **join operation is deferred to the final confirmation step** — the user fills in all details first, then confirms, triggering the join in the background before the editor opens
- Driver selection step is conditional: shown only when at least one segment uses a non-manual timing source
- Timing sources: SpeedHive, Daytona (email export), TeamSport (`teamsportEmail`), Alpha Timing (`alphaTiming`), Manual — all configured through UI forms, no config file upload
- Video offset is set frame-accurately via an offset picker modal: video preview, scrub bar, prev/next frame (±10), "Use frame N" confirm
- Step 4 (Verify) shows lap data tabbed by segment label when multiple segments exist
- Step 5 (Confirm) shows a per-segment config summary, also tabbed by segment label

### Editor layout
- Permanent spatial layout: video preview top-left, timeline bottom-left, config panel right
- The right panel does not change layout between tabs — it is always the right 1/3
- Timeline is read-only; configuration happens in the right panel only

### Utilities
- Doctor and Timestamps are **not part of the project editor** — they live in the OS menu bar under a "Utilities" dropdown
- Each opens as a modal dialog, keeping the editor workspace clean

---

## What This Replaces

The existing desktop app spec (`2026-03-16-desktop-app-design.md`) describes a conventional left-sidebar + 5-screen navigation. This idea doc supersedes that screen structure. The architecture and IPC design in that spec remain valid — only the UI layout and navigation model change.

The five original screens map to the new structure as follows:

| Original screen | New location |
|---|---|
| Setup (FFmpeg) | Full-screen setup screen on launch |
| Drivers | Onboarding wizard step 3 + Timing panel tab |
| Timestamps | Utilities menu → modal |
| Join | Onboarding wizard (triggered on confirm) |
| Doctor | Utilities menu → modal |
| Render | Export tab in right panel |

# Wizard Rework

## Summary

Rework the project creation wizard to prioritise time-to-first-edit. Replace the current 5-step settings-first flow (Videos → Segments → Driver → Verify → Confirm) with a 3-screen goal-first flow (New Project → Segments → Review Timing) that uses progressive disclosure, smart defaults, and reversible choices.

## Motivation

The current wizard has several UX problems:

1. **Project name is last** — users commit to 4 screens of configuration before naming their project
2. **Modals on modals** — segment form, offset picker, and manual lap dialog all open as sub-modals inside the wizard modal
3. **Settings-first** — forces exhaustive configuration (all segments, all drivers) before you see the editor
4. **No smart defaults** — every field requires manual input even when the answer is obvious (single driver, one video)

## Design Principles

1. Minimise time-to-first-edit
2. Progressive disclosure
3. Strong presets and smart defaults
4. Goal-first rather than settings-first
5. Support both novice and expert paths
6. Make important choices reversible where possible

## Flow Overview

```
Screen 1: New Project          Screen 2: Segments           Screen 3: Review Timing
┌─────────────────────┐       ┌─────────────────────┐      ┌─────────────────────┐
│ Project name         │       │ Session mode picker  │      │ Segment selector     │
│ [Auto-suggested]     │       │ Assign videos        │      │ Lap stepper (←/→)    │
│                      │       │ Timing source + data │      │ Lap #, time, position│
│ ┌─────────────────┐ │       │ Driver (auto/pick)   │      │ Video frame preview  │
│ │  Drop videos    │ │       │ Offset picker        │      │                      │
│ │  here           │ │       │                      │      │                      │
│ └─────────────────┘ │       │ [+ Add segment]      │      │                      │
│                      │       │                      │      │                      │
│ Reorderable file list│       │ Previously added     │      │                      │
│                      │       │ segments as cards     │      │                      │
│ ▸ Advanced settings  │       │                      │      │                      │
│   Save location      │       │                      │      │                      │
│                      │  ──►  │                      │  ──► │                      │
│ [Cancel]  [Continue] │       │ [Back]    [Continue] │      │ [Back] [Create]      │
└─────────────────────┘       └─────────────────────┘      └─────────────────────┘
```

## Screen 1: New Project

### Project Name

- Text input at the top of the screen
- Auto-populated from the first video filename added (existing logic: strip extension + trailing 4-digit patterns)
- Editable by the user at any time
- Required to proceed

### Video Drop Zone

- Drag-and-drop area or file picker button
- Accepts `.mp4`, `.mov` files
- After adding files, display as a **flat, reorderable list** (drag handles for reordering, remove button per file)

### Smart File Ordering

When files are added, detect known camera naming patterns and auto-sort:

- **GoPro**: files like `GX010042.MP4`, `GX020042.MP4` — sort by chapter number prefix (digits before the session ID)
- **Extensible**: future support for DJI, Insta360, etc. via the same pattern-detection approach

If filenames don't match any known pattern, preserve the filesystem/selection order.

The user always sees a flat list and can freely reorder. No grouping UI — the sort is a smart default, not a constraint.

### Advanced Settings

- Collapsed accordion labelled "Advanced Settings"
- Contains: **Save location** — text input with folder picker, defaults to `~/Videos/racedash/{slug}/`
- Only shown when expanded; most users never touch this

### Continuation

- **Continue** button enabled when: project name is non-empty AND at least 1 video is added
- **Cancel** button: if no data entered, dismiss silently. If data has been entered, show confirmation dialog ("Discard project? You'll lose your progress.")

## Screen 2: Segments

### Adding a Segment

The segment form is **inline** — no sub-modal. Fields are presented in order:

1. **Session mode** — picker with options: Race, Qualifying, Practice
   - Auto-generates the segment label: "Race 1", "Qualifying", "Practice", etc. (increments number if duplicates exist)
   - Label is editable inline before confirming the segment

2. **Assign videos** — select which video(s) from the ordered list (Screen 1) belong to this segment
   - If only one video (or one group of videos) exists and no segments have been created yet, pre-select all videos
   - Videos already assigned to another segment are visually greyed out / marked with their segment label
   - Unassigned videos are visually distinct but do not block creation

3. **Timing source** — picker with contextual fields:
   - **Alpha Timing**: URL input
   - **MyLaps SpeedHive**: URL input
   - **Daytona email**: file drop for `.eml` / `.txt`
   - **TeamSport email**: file drop for `.eml`
   - **Manual**: inline lap time entry table
   - Default: Alpha Timing (existing default)

4. **Driver selection** — appears after timing data is fetched/parsed:
   - **Single driver in results**: auto-select, show as read-only text ("Driver: John Smith")
   - **Multiple drivers**: dropdown picker, required selection
   - Uses existing timing source fetch/parse logic to populate driver list

5. **Offset picker** — frame scrubber to sync video to first lap timestamp
   - **Inline** within the segment form, not a sub-modal
   - Mandatory — cannot confirm segment without setting offset

### Segment Management

- After a segment is confirmed, it appears as a **collapsible card** above the "add segment" area
- Cards show: label, session mode, timing source, driver, video count
- Cards can be expanded to edit or removed
- **"Add another segment"** button below the cards to repeat the process

### Continuation

- **Continue** button enabled when at least 1 complete segment exists (all fields filled, offset set)
- **Back** button returns to Screen 1 (preserves state)

## Screen 3: Review Timing

### Purpose

Confidence screen — user verifies that timing data is correctly synced to their video before committing. Read-only, no editing.

### Layout

- **Segment selector** — tabs (if ≤4 segments) or dropdown (if >4) to switch between segments
- **Lap stepper** — previous/next buttons + dropdown to jump to any lap number
- Per lap, display:
  - Lap number
  - Lap time
  - Position (if available from timing source)
  - **Video frame preview** at that lap's calculated timestamp — this is the proof that sync is correct

### Actions

- **Create Project** button — creates the project via IPC, then opens the editor
- **Back** button — returns to Screen 2 (preserves state)

## Cancel Behaviour

- **No data entered** (Screen 1, empty state): dismiss wizard silently, no confirmation
- **Data entered** (any screen with content): show dialog — "Discard project? You'll lose your progress." with "Discard" and "Keep editing" buttons
- No draft persistence in v1 — drafts are a future enhancement

## Post-Creation: Editor Additions

All wizard choices remain editable from the editor after project creation:

- Add/remove/edit segments from the Timing tab (existing edit wizard)
- Change driver selection per segment
- Re-adjust video offset per segment
- Rename project from project settings

The wizard is the fast path in; the editor is where you refine.

## Changes from Current Wizard

| Aspect | Current | New |
|---|---|---|
| Steps | 5 (Videos → Segments → Driver → Verify → Confirm) | 3 (New Project → Segments → Review Timing) |
| Project name | Last step | First screen |
| Video management | Dedicated step | Combined with project name |
| Segment form | Sub-modal inside wizard | Inline within wizard screen |
| Offset picker | Sub-modal inside segment form | Inline within segment form |
| Driver selection | Dedicated step for all segments | Per-segment, inline, auto-selected when possible |
| Verify step | Shows all timing data | Lap stepper with video frame preview |
| File ordering | Unordered | Reorderable with smart auto-sort |
| Advanced settings | Save dir on final screen | Accordion on first screen |
| Cancel mid-flow | Loses everything silently | Confirmation dialog if data entered |

## Files to Create

- `apps/desktop/src/renderer/src/screens/wizard/NewProjectWizard.tsx` — new wizard orchestrator (replaces `ProjectCreationWizard.tsx`)
- `apps/desktop/src/renderer/src/screens/wizard/steps/NewProjectStep.tsx` — Screen 1: name + videos
- `apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx` — Screen 2: segment creation
- `apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx` — Screen 3: lap stepper verification
- `apps/desktop/src/renderer/src/utils/videoFileOrder.ts` — GoPro (and future camera) filename pattern detection and sorting

## Files to Modify

- `apps/desktop/src/renderer/src/screens/wizard/WizardShell.tsx` — adapt for 3-step flow, update step indicator
- `apps/desktop/src/renderer/src/screens/project-library/ProjectLibrary.tsx` — swap `ProjectCreationWizard` for `NewProjectWizard`
- `apps/desktop/src/types/project.ts` — update `WizardState` interface to match new flow

## Files to Remove

- `apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx` — replaced by `NewProjectWizard.tsx`
- `apps/desktop/src/renderer/src/screens/wizard/steps/VideosStep.tsx` — merged into `NewProjectStep`
- `apps/desktop/src/renderer/src/screens/wizard/steps/ConfirmStep.tsx` — merged into `NewProjectStep`
- `apps/desktop/src/renderer/src/screens/wizard/steps/DriverStep.tsx` — merged into per-segment inline picker
- `apps/desktop/src/renderer/src/screens/wizard/steps/VerifyStep.tsx` — replaced by `ReviewTimingStep`

## Components to Reuse

- `SegmentForm.tsx` — refactored to work inline rather than as a sub-form, but core logic preserved
- `OffsetPickerStep.tsx` — refactored from modal to inline component, core frame scrubber logic preserved
- `ManualLapEntry.tsx` — reused as-is for manual timing source
- `WizardShell.tsx` — reused with updated step count

## Testing

- **`videoFileOrder.ts` unit tests**: GoPro chapter detection and sorting, unknown patterns fall back to original order, mixed known/unknown files
- **Wizard integration tests**: navigation between screens, state preservation on back, cancel confirmation dialog behaviour, continuation gates (name required, video required, segment required)
- **Segment defaults**: auto-label generation, single-driver auto-selection, video pre-selection when only one exists

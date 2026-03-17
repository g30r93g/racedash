# Component Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the renderer into a proper two-layer component architecture — all UI composed from shadcn/ui primitives, app-specific compositions in `components/app/`, screens as thin consumers.

**Architecture:** Two-pass approach. Pass 1 installs all shadcn/ui primitives and builds all 14 `components/app/` components without touching any screen. Pass 2 rewrites each screen to consume the new components, removing all inlined implementations. Screens keep all state and IPC calls — only JSX changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, shadcn/ui, Electron 33, shadcnblocks file-upload

---

## File Structure

### New files (Pass 1 — components/app/)
- Create: `apps/desktop/src/renderer/src/components/app/SectionLabel.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/InfoRow.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/ColourRow.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/StepIndicator.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/FileUpload.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/AppSidebar.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/ProjectCard.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/CloudRendersList.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/AccountDetails.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/VideoPlaybackControls.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/Timeline.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/TimingTable.tsx`
- Create: `apps/desktop/src/renderer/src/components/app/DriverPickerModal.tsx`
- New shadcn/ui primitives (auto-generated via `npx shadcn add` from `apps/desktop/`)

### Modified files (Pass 2 — screens/)
- Modify: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step1Videos.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2Segments.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2AddSegmentForm.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2OffsetPicker.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step3Driver.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step4Verify.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step5Confirm.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` (call-site update only)
- Modify: `apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/OverlayPickerModal.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/TimingTab.tsx`

### Deleted files
- Delete: `apps/desktop/src/renderer/src/components/ui/file-drop.tsx`
- Delete: `apps/desktop/src/renderer/src/screens/wizard/WizardStepIndicator.tsx`

---

## Verification gate

All tasks use TypeScript compilation as the verification gate. No React unit tests exist for UI components.

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

---

## Chunk 1: shadcn Primitive Installs

### Task 1: Install shadcn/ui primitives and shadcnblocks file-upload

**Files:**
- New (auto-generated): `components/ui/dialog.tsx`, `sidebar.tsx`, `table.tsx`, `progress.tsx`, `badge.tsx`, `avatar.tsx`, `separator.tsx`, `scroll-area.tsx`, `skeleton.tsx`, `tooltip.tsx`, `toggle-group.tsx`, `slider.tsx`, `file-upload.tsx`

- [ ] **Step 1: Install 12 shadcn components (run from `apps/desktop/`)**

```bash
cd apps/desktop
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
```

Accept all prompts (overwrite if asked).

- [ ] **Step 2: Install shadcnblocks file-upload**

```bash
cd apps/desktop
npx shadcn add @shadcnblocks/file-upload/file-upload-validation-6
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors. If the generated shadcn code introduces type errors, fix them in the generated file.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/
git commit -m "feat(ui): install shadcn dialog/sidebar/table/progress/badge/avatar/separator/scroll-area/skeleton/tooltip/toggle-group/slider + shadcnblocks file-upload"
```

---

## Chunk 2: Simple App Components

### Task 2: SectionLabel

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/SectionLabel.tsx`

Extracted from `StyleTab.tsx`, `ExportTab.tsx`, and `TimingTab.tsx` where the same `<p>` is inlined verbatim.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'

interface SectionLabelProps { children: React.ReactNode }

export function SectionLabel({ children }: SectionLabelProps): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/SectionLabel.tsx
git commit -m "feat(app): add SectionLabel component"
```

---

### Task 3: InfoRow

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/InfoRow.tsx`

Extracted from `ExportTab.tsx`. Key/value display row.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'

interface InfoRowProps {
  label: string
  value: string
}

export function InfoRow({ label, value }: InfoRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/InfoRow.tsx
git commit -m "feat(app): add InfoRow component"
```

---

### Task 4: ColourRow

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/ColourRow.tsx`

Extracted verbatim from `StyleTab.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import React, { useRef, useState } from 'react'

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

interface ColourRowProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

export function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value
    setDraft(hex)
    onChange(hex)
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  function handleHexBlur() {
    if (!isValidHex(draft)) setDraft(value)
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="color"
          value={isValidHex(value) ? value : '#000000'}
          onChange={handleNativeChange}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="h-5 w-5 rounded border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
          aria-label={`Pick colour for ${label}`}
        />
        <input
          type="text"
          value={draft}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          maxLength={7}
          className="w-20 rounded border border-border bg-accent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/ColourRow.tsx
git commit -m "feat(app): add ColourRow component"
```

---

### Task 5: StepIndicator

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/StepIndicator.tsx`

Extracted verbatim from `screens/wizard/WizardStepIndicator.tsx` — rename the component and props interface.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'
import { cn } from '@/lib/utils'

interface StepIndicatorProps {
  steps: readonly string[]
  currentStep: number  // 1-based
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps): React.ReactElement {
  return (
    <div className="flex items-center" role="list" aria-label="Progress">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isComplete = stepNumber < currentStep
        const isCurrent = stepNumber === currentStep

        return (
          <React.Fragment key={stepNumber}>
            {index > 0 && (
              <div
                className={cn('h-px flex-1', isComplete ? 'bg-green-500' : 'bg-border')}
              />
            )}
            <div className="flex flex-col items-center gap-1.5" role="listitem">
              <div
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  isComplete && 'border-green-500 bg-green-500 text-white',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  !isComplete && !isCurrent && 'border-border bg-transparent text-muted-foreground'
                )}
              >
                {isComplete ? (
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={cn(
                  'text-[11px]',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/StepIndicator.tsx
git commit -m "feat(app): add StepIndicator component (extracted from WizardStepIndicator)"
```

---

## Chunk 3: Library Components

### Task 6: FileUpload (app component)

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/FileUpload.tsx`

Wraps shadcnblocks `file-upload`. Bridges `File.path` (Electron) to string paths. Supports single-file (`onFile`) and multi-file (`onFiles`) modes — `onFiles` is needed by `Step1Videos`.

- [ ] **Step 1: Read the generated shadcnblocks component to understand its API**

Read `apps/desktop/src/renderer/src/components/ui/file-upload.tsx` and note the exported component name, prop names for accepting files/callbacks, and how it reports selected files.

- [ ] **Step 2: Create the FileUpload app component**

The bridge pattern: on file selection, read `(file as File & { path?: string }).path` for the Electron absolute path. Fall back to `window.racedash.openFiles`/`openFile` for the browse dialog if `File.path` is unavailable.

```tsx
import React from 'react'
// Adjust the import name below to match what the generated file-upload.tsx exports.
// Common names: FileUpload, FileUploader, FileUploadDropzone — read the file first.
import { FileUpload as FileUploadUI } from '@/components/ui/file-upload'

interface FileUploadProps {
  value?: string
  placeholder?: string
  hint?: string
  accept?: string[]        // file extensions without dot, e.g. ['eml', 'txt']
  multiple?: boolean
  onFile?: (path: string) => void
  onFiles?: (paths: string[]) => void
}

export function FileUpload({
  value,
  placeholder = 'Drop file here or click to browse',
  hint,
  accept,
  multiple = false,
  onFile,
  onFiles,
}: FileUploadProps): React.ReactElement {
  function handleFilesChange(files: File[]) {
    const paths = files.map((f) => (f as File & { path?: string }).path ?? f.name)
    if (multiple && onFiles) {
      onFiles(paths)
    } else if (!multiple && onFile && paths[0]) {
      onFile(paths[0])
    }
  }

  // Adapt the props below to match the generated FileUploadUI API.
  // The generated component may use onFilesChange, onChange, onValueChange, etc.
  // Inspect the generated file and update accordingly.
  return (
    <FileUploadUI
      value={value ? [value] : []}
      multiple={multiple}
      accept={accept?.map((ext) => `.${ext}`).join(',')}
      onValueChange={(files: File[]) => handleFilesChange(files)}
    />
  )
}
```

> **Important:** The exact prop interface of `FileUploadUI` depends on the generated component. Read `components/ui/file-upload.tsx` in Step 1 and adapt `FileUpload.tsx` to match. The wrapper's own interface (`FileUploadProps`) must not change — only the internal delegation to `FileUploadUI`.

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/FileUpload.tsx
git commit -m "feat(app): add FileUpload component wrapping shadcnblocks file-upload"
```

---

### Task 7: AppSidebar

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/AppSidebar.tsx`

Uses shadcn `Sidebar`. Shows Racedash logo, three nav tabs, user footer with Avatar + Badge.

- [ ] **Step 1: Read `components/ui/sidebar.tsx` to check if SidebarProvider is required at a parent level**

The shadcn Sidebar component typically requires a `SidebarProvider` wrapper. Note whether it must wrap the whole screen or just the sidebar.

- [ ] **Step 2: Create the component**

```tsx
import React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export type LibraryTab = 'projects' | 'cloud-renders' | 'account'

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

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function AppSidebar({
  activeTab,
  onTabChange,
  cloudRenderCount,
  user,
}: AppSidebarProps): React.ReactElement {
  return (
    <Sidebar className="w-[190px] shrink-0 border-r-0 bg-[#161616]">
      <SidebarHeader className="px-3 py-4">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2.5 7L5.5 10L11.5 4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-sm font-bold text-white">Racedash</span>
        </div>
        <Separator className="bg-white/10" />
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'projects'}
              onClick={() => onTabChange('projects')}
              className="gap-2.5 text-sm text-white"
            >
              <FolderIcon />
              Projects
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'cloud-renders'}
              onClick={() => onTabChange('cloud-renders')}
              className="gap-2.5 text-sm text-white"
            >
              <CloudIcon />
              <span className="flex-1">Cloud Renders</span>
              {cloudRenderCount > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {cloudRenderCount}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'account'}
              onClick={() => onTabChange('account')}
              className="gap-2.5 text-sm text-white"
            >
              <AccountIcon />
              Account
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-blue-700 text-[11px] font-bold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">{user.name}</p>
            {user.plan === 'pro' && (
              <p className="text-[10px] text-blue-400">Racedash Cloud PRO</p>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function FolderIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.879C6.144 2.5 6.398 2.605 6.586 2.793L7.207 3.414C7.395 3.602 7.649 3.707 7.914 3.707H12.5C13.052 3.707 13.5 4.155 13.5 4.707V11.5C13.5 12.052 13.052 12.5 12.5 12.5H2.5C1.948 12.5 1.5 12.052 1.5 11.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function CloudIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M4.5 10.5C3.119 10.5 2 9.381 2 8C2 6.753 2.887 5.713 4.07 5.53C4.285 3.83 5.737 2.5 7.5 2.5C9.157 2.5 10.539 3.679 10.893 5.235C12.1 5.416 13 6.454 13 7.5C13 8.881 11.881 10.5 10.5 10.5H4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function AccountIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M2 13C2 10.791 4.462 9 7.5 9C10.538 9 13 10.791 13 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/AppSidebar.tsx
git commit -m "feat(app): add AppSidebar component"
```

---

### Task 8: ProjectCard

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/ProjectCard.tsx`

Extracted from `ProjectLibrary.tsx`. Uses `Skeleton` for the loading state in the thumbnail area instead of the original spinner.

- [ ] **Step 1: Create the component**

```tsx
import React, { useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import { Skeleton } from '@/components/ui/skeleton'

interface ProjectCardProps {
  project: ProjectData
  onOpen: (project: ProjectData) => void
}

export function ProjectCard({ project, onOpen }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (loading) return
    setLoading(true)
    try {
      const loaded = await window.racedash.openProject(project.projectPath)
      onOpen(loaded)
    } catch (err) {
      console.error('[racedash] failed to open project', err)
      setLoading(false)
    }
  }

  const dateLabel = `Opened ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`

  return (
    <button
      className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#1f1f1f] text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
      onClick={handleClick}
      disabled={loading}
    >
      <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
        {loading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="white" fillOpacity="0.7" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-white">{project.name}</p>
        <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/ProjectCard.tsx
git commit -m "feat(app): add ProjectCard component"
```

---

### Task 9: CloudRendersList

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/CloudRendersList.tsx`

Net-new component. Cloud Renders IPC is deferred — stub returns `[]` with `loading: false`.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

interface CloudRenderJob {
  id: string
  projectName: string
  sessionType: 'Race' | 'Qualifying' | 'Practice'
  status: 'queued' | 'in-progress' | 'completed'
  startedAt?: string
  resolution: string
  renderMode: string
  progress?: number
  outputUrl?: string
  youtubeUrl?: string
  timeRemaining?: string
  storageUsedGb: number
  storageLimitGb: number
}

export function CloudRendersList(): React.ReactElement {
  // Stub: Cloud Renders IPC deferred
  const jobs: CloudRenderJob[] = []
  const loading = false

  if (loading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-muted-foreground">No cloud renders yet.</p>
        <p className="text-xs text-muted-foreground">
          Submit a render from the Export tab to get started.
        </p>
      </div>
    )
  }

  const queued = jobs.filter((j) => j.status === 'queued')
  const inProgress = jobs.filter((j) => j.status === 'in-progress')
  const completed = jobs.filter((j) => j.status === 'completed')

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4">
        {queued.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Queued
            </p>
            {queued.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {queued.length > 0 && inProgress.length > 0 && <Separator />}
        {inProgress.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              In Progress
            </p>
            {inProgress.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {(queued.length > 0 || inProgress.length > 0) && completed.length > 0 && <Separator />}
        {completed.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Completed
            </p>
            {completed.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {jobs[0] && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Storage</span>
                <span className="text-foreground">
                  {jobs[0].storageUsedGb}GB / {jobs[0].storageLimitGb}GB
                </span>
              </div>
              <Progress value={(jobs[0].storageUsedGb / jobs[0].storageLimitGb) * 100} />
              <button className="text-left text-xs text-primary hover:underline">
                Manage storage
              </button>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}

function JobRow({ job }: { job: CloudRenderJob }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-accent/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-foreground">{job.projectName}</span>
        <Badge variant="outline" className="text-[10px]">{job.sessionType}</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {job.startedAt ? new Date(job.startedAt).toLocaleDateString() : '—'} · {job.resolution} · {job.renderMode}
      </p>
      {job.status === 'in-progress' && job.progress !== undefined && (
        <Progress value={job.progress * 100} className="mt-1" />
      )}
      {job.status === 'in-progress' && job.timeRemaining && (
        <p className="text-[11px] text-muted-foreground">{job.timeRemaining}</p>
      )}
      {job.status === 'completed' && (
        <div className="mt-1 flex gap-2">
          {job.outputUrl && (
            <Button variant="outline" size="sm" className="text-xs">Download</Button>
          )}
          {job.youtubeUrl && (
            <Button variant="outline" size="sm" className="text-xs">YouTube</Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/CloudRendersList.tsx
git commit -m "feat(app): add CloudRendersList component (stubbed)"
```

---

### Task 10: AccountDetails

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/AccountDetails.tsx`

Net-new component. Static placeholder data per project memory (G. Gorzynski / GG).

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { InfoRow } from './InfoRow'

export function AccountDetails(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-700 text-sm font-bold text-white">GG</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">G. Gorzynski</p>
            <Badge className="text-[10px]">PRO</Badge>
          </div>
          <p className="text-xs text-muted-foreground">george@university.ac.uk</p>
        </div>
      </div>

      <Separator />

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Subscription
        </p>
        <div className="rounded-md border border-border bg-accent px-3">
          <InfoRow label="Plan" value="Racedash Cloud Pro" />
          <div className="border-t border-border" />
          <InfoRow label="Renews" value="1 Apr 2026" />
        </div>
        <Button variant="outline" className="mt-3 w-full" size="sm">
          Manage subscription ↗
        </Button>
      </section>

      <Separator />

      <section>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Security
        </p>
        <button className="w-full rounded-md border border-border bg-accent px-3 py-2 text-left text-sm text-foreground hover:bg-accent/80">
          Change password ›
        </button>
      </section>

      <Separator />

      <Button variant="destructive" className="w-full bg-red-950 text-red-500 hover:bg-red-900" disabled>
        Sign out
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/AccountDetails.tsx
git commit -m "feat(app): add AccountDetails component (stubbed)"
```

---

## Chunk 4: Media Components

### Task 11: VideoPlayer

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx`

Extracted from `VideoPane.tsx`. Uses `forwardRef` to expose the video element to the parent.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'

interface VideoPlayerProps {
  videoPath?: string
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ videoPath }, ref) {
    return (
      <div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
        {videoPath ? (
          <video
            ref={ref}
            src={`file://${videoPath}`}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <polygon points="14,10 38,24 14,38" fill="#3a3a3a" />
            </svg>
            <span className="text-xs tracking-widest text-muted-foreground">NO VIDEO LOADED</span>
          </div>
        )}
        <div className="absolute bottom-3 right-4">
          <span className="font-mono text-xs text-muted-foreground">00:00:00.000</span>
        </div>
      </div>
    )
  }
)
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/VideoPlayer.tsx
git commit -m "feat(app): add VideoPlayer component"
```

---

### Task 12: VideoPlaybackControls

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/VideoPlaybackControls.tsx`

Uses shadcn `Slider`, `Button`, `Tooltip`.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface VideoPlaybackControlsProps {
  duration: number
  currentTime: number
  playing: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
}

function formatTimecode(seconds: number): string {
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function VideoPlaybackControls({
  duration,
  currentTime,
  playing,
  onPlay,
  onPause,
  onSeek,
}: VideoPlaybackControlsProps): React.ReactElement {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 border-t border-border bg-background px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={playing ? onPause : onPlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="h-7 w-7 shrink-0"
            >
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <rect x="2" y="1" width="3" height="10" />
                  <rect x="7" y="1" width="3" height="10" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <polygon points="2,1 11,6 2,11" />
                </svg>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playing ? 'Pause' : 'Play'}</TooltipContent>
        </Tooltip>

        <Slider
          min={0}
          max={duration || 1}
          step={0.001}
          value={[currentTime]}
          onValueChange={([v]) => onSeek(v)}
          className="flex-1"
          aria-label="Playback position"
        />

        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTimecode(currentTime)}
        </span>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/VideoPlaybackControls.tsx
git commit -m "feat(app): add VideoPlaybackControls component"
```

---

### Task 13: Timeline

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/Timeline.tsx`

Extracted from `TimelinePane.tsx`. All helpers (`TrackRow`, `rulerTicks`, `formatRulerLabel`) move inside. Zoom buttons replaced with shadcn `Button`.

- [ ] **Step 1: Create the component**

Copy `TimelinePane.tsx` content as the basis. Rename the export from `TimelinePane` to `Timeline` and the props interface from `TimelinePaneProps` to `TimelineProps`. Replace the two raw zoom `<button>` elements with `<Button size="icon" variant="outline" className="h-5 w-5">`.

```tsx
import React from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { Button } from '@/components/ui/button'

interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}

const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']
const LAP_COLOUR = '#3b82f6'
const POSITION_DOT_COLOURS = ['#f97316', '#ef4444', '#22c55e', '#eab308']

function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function rulerTicks(duration: number): number[] {
  const interval = duration <= 60 ? 5 : duration <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += interval) ticks.push(t)
  return ticks
}

export function Timeline({ project, videoInfo }: TimelineProps): React.ReactElement {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const pct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`
  const widthPct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`

  const segmentSpans = project.segments.map((seg, i) => {
    const startSeconds = (seg.videoOffsetFrame ?? 0) / fps
    const nextFrame = project.segments[i + 1]?.videoOffsetFrame
    const endSeconds = nextFrame !== undefined ? nextFrame / fps : duration
    return { label: seg.label, startSeconds, endSeconds }
  })

  const placeholderLaps = [
    { label: 'L1', startSeconds: 0, endSeconds: duration * 0.32 },
    { label: 'L2', startSeconds: duration * 0.32, endSeconds: duration * 0.65 },
    { label: 'L3', startSeconds: duration * 0.65, endSeconds: duration },
  ]

  const ticks = rulerTicks(duration)

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-t border-border bg-background" style={{ fontSize: 11 }}>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Button size="icon" variant="outline" aria-label="Zoom out" className="h-5 w-5">−</Button>
          <Button size="icon" variant="outline" aria-label="Zoom in" className="h-5 w-5">+</Button>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-5 shrink-0 items-end">
          <div className="w-20 shrink-0" aria-hidden="true" />
          <div className="relative flex-1">
            {ticks.map((t) => (
              <div key={t} className="absolute bottom-0 flex flex-col items-center" style={{ left: pct(t) }}>
                <span className="text-[10px] text-muted-foreground">{formatRulerLabel(t)}</span>
                <div className="h-1.5 w-px bg-border" />
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col gap-px overflow-hidden">
          <TrackRow label="VIDEO">
            <div className="absolute inset-y-1 rounded-sm bg-[#3a3a3a]" style={{ left: '0%', width: '100%' }} />
          </TrackRow>

          <TrackRow label="SEGMENTS">
            {segmentSpans.length === 0 ? (
              <div className="absolute inset-y-2 left-0 right-0 rounded-sm border border-dashed border-border" />
            ) : (
              segmentSpans.map((seg, i) => (
                <div
                  key={i}
                  className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm px-1"
                  style={{
                    left: pct(seg.startSeconds),
                    width: widthPct(seg.endSeconds - seg.startSeconds),
                    backgroundColor: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
                  }}
                >
                  <span className="truncate text-[10px] font-medium text-white">{seg.label}</span>
                </div>
              ))
            )}
          </TrackRow>

          <TrackRow label="LAPS">
            {placeholderLaps.map((lap, i) => (
              <div
                key={i}
                className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-full px-1"
                style={{
                  left: pct(lap.startSeconds),
                  width: widthPct(lap.endSeconds - lap.startSeconds),
                  backgroundColor: LAP_COLOUR,
                }}
              >
                <span className="text-[10px] font-medium text-white">{lap.label}</span>
              </div>
            ))}
          </TrackRow>

          <TrackRow label="POSITION">
            {POSITION_DOT_COLOURS.map((colour, i) => (
              <div
                key={i}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={{
                  left: pct((duration / (POSITION_DOT_COLOURS.length + 1)) * (i + 1)),
                  backgroundColor: colour,
                }}
              />
            ))}
          </TrackRow>

          <div
            className="pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center"
            style={{ left: 'calc(5rem + 30%)' }}
          >
            <div className="rounded bg-primary px-1 py-px">
              <span className="font-mono text-[10px] text-primary-foreground">
                {formatRulerLabel(duration * 0.3)}
              </span>
            </div>
            <div className="w-px flex-1 bg-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-1 items-stretch">
      <div className="flex w-20 shrink-0 items-center border-r border-border px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/Timeline.tsx
git commit -m "feat(app): add Timeline component (extracted from TimelinePane)"
```

---

### Task 14: TimingTable

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/TimingTable.tsx`

Uses shadcn `Table`. Exports `LapRow` type. Supports `lapTimeLabel?: string` so `Step4Verify` (which has pre-formatted strings) can use it without a lossy conversion.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatLapTime(ms: number): string {
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export interface LapRow {
  lap: number
  timeMs: number
  position: number
  lapTimeLabel?: string  // if present, rendered instead of formatting timeMs
}

interface TimingTableProps {
  rows: LapRow[]
  bestLapTimeMs?: number
}

export function TimingTable({ rows, bestLapTimeMs }: TimingTableProps): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">LAP</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">TIME</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">POS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isBest = bestLapTimeMs !== undefined && row.timeMs === bestLapTimeMs
          const timeDisplay = row.lapTimeLabel ?? formatLapTime(row.timeMs)
          return (
            <TableRow
              key={row.lap}
              className={isBest ? 'text-foreground font-medium' : 'text-muted-foreground'}
            >
              <TableCell className="py-1">{row.lap}</TableCell>
              <TableCell className="py-1 font-medium">{timeDisplay}</TableCell>
              <TableCell className="py-1">P{row.position}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/TimingTable.tsx
git commit -m "feat(app): add TimingTable component"
```

---

### Task 15: DriverPickerModal

**Files:**
- Create: `apps/desktop/src/renderer/src/components/app/DriverPickerModal.tsx`

Extracted from the inline modal in `TimingTab.tsx`. Uses shadcn `Dialog`. Manages its own data-fetching state.

- [ ] **Step 1: Create the component**

```tsx
import React, { useEffect, useState } from 'react'
import type { DriversResult } from '../../../../types/ipc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DriverPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  configPath: string
  onSelect: (driverName: string) => void
}

export function DriverPickerModal({
  open,
  onOpenChange,
  configPath,
  onSelect,
}: DriverPickerModalProps): React.ReactElement {
  const [driversResult, setDriversResult] = useState<DriversResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    window.racedash
      .listDrivers({ configPath })
      .then((result) => setDriversResult(result))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open, configPath])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[360px]">
        <DialogHeader>
          <DialogTitle>Choose Driver</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-xs text-muted-foreground">Loading drivers…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && driversResult && (
          <ul className="flex flex-col gap-1">
            {driversResult.segments.flatMap((seg) =>
              seg.drivers.map((d) => (
                <li key={`${seg.config.source}-${d.name}`}>
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    onClick={() => { onSelect(d.name); onOpenChange(false) }}
                  >
                    {d.kart ? `[${d.kart.padStart(3, ' ')}] ${d.name}` : d.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/app/DriverPickerModal.tsx
git commit -m "feat(app): add DriverPickerModal component"
```

---

## Chunk 5: Pass 2 — Wizard Screen Rewrites

### Task 16: Rewrite ProjectLibrary.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx`

**Remove:** Inlined `Sidebar`, `ProjectCard`, `LoadingSkeleton`, `EmptyState`, `FolderIcon`, `CloudIcon`, `AccountIcon`.

**Add:** `AppSidebar`, `ProjectCard`, `CloudRendersList`, `AccountDetails`, `Skeleton`, `ScrollArea`, `Button`; `activeTab` state.

> **Note on SidebarProvider:** The shadcn Sidebar component requires a `SidebarProvider` context wrapper. If TypeScript or runtime errors mention missing context, wrap the outer `<div>` in `<SidebarProvider>` (imported from `@/components/ui/sidebar`).

- [ ] **Step 1: Rewrite the file**

```tsx
import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../../types/project'
import { AppSidebar } from '@/components/app/AppSidebar'
import type { LibraryTab } from '@/components/app/AppSidebar'
import { ProjectCard } from '@/components/app/ProjectCard'
import { CloudRendersList } from '@/components/app/CloudRendersList'
import { AccountDetails } from '@/components/app/AccountDetails'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SidebarProvider } from '@/components/ui/sidebar'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}

export function ProjectLibrary({ onOpen, onNew }: ProjectLibraryProps): React.ReactElement {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LibraryTab>('projects')

  useEffect(() => {
    window.racedash
      .listProjects()
      .then((result) => setProjects(result))
      .catch((err) => console.error('[racedash] failed to list projects', err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
      <SidebarProvider>
        <div className="flex h-[650px] w-[1050px] overflow-hidden rounded-xl bg-[#1c1c1c] shadow-2xl">
          <AppSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            cloudRenderCount={0}
            user={{ name: 'G. Gorzynski', email: 'george@university.ac.uk', plan: 'pro' }}
          />

          <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
            {activeTab === 'projects' && (
              <>
                <div className="mb-6 flex shrink-0 items-center justify-between">
                  <h1 className="text-lg font-semibold text-white">Projects</h1>
                  <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                    + New RaceDash Project
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  {loading ? (
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[158px] rounded-lg" />
                      ))}
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                      <p className="text-sm text-white/40">No projects yet. Create your first project.</p>
                      <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                        + New RaceDash Project
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      {projects.map((project) => (
                        <ProjectCard key={project.projectPath} project={project} onOpen={onOpen} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}

            {activeTab === 'cloud-renders' && (
              <>
                <div className="mb-6 flex shrink-0 items-center">
                  <h1 className="text-lg font-semibold text-white">Cloud Renders</h1>
                </div>
                <CloudRendersList />
              </>
            )}

            {activeTab === 'account' && (
              <>
                <div className="mb-6 flex shrink-0 items-center">
                  <h1 className="text-lg font-semibold text-white">Account</h1>
                </div>
                <AccountDetails />
              </>
            )}
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/ProjectLibrary.tsx
git commit -m "refactor(screens): rewrite ProjectLibrary to use AppSidebar/ProjectCard/CloudRendersList/AccountDetails"
```

---

### Task 17: Rewrite ProjectCreationWizard.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx`

**Remove:** Manual `fixed inset-0` backdrop div; `useEffect` Escape keydown listener; `WizardStepIndicator` import.

**Add:** shadcn `Dialog`/`DialogContent`; `StepIndicator` from `components/app/StepIndicator`.

- [ ] **Step 1: Update the file**

```tsx
import React, { useState } from 'react'
import type { SegmentConfig, ProjectData } from '../../../../types/project'
import { StepIndicator } from '@/components/app/StepIndicator'
import { Step1Videos } from './steps/Step1Videos'
import { Step2Segments } from './steps/Step2Segments'
import { Step3Driver } from './steps/Step3Driver'
import { Step4Verify } from './steps/Step4Verify'
import { Step5Confirm } from './steps/Step5Confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export interface WizardState {
  videoPaths: string[]
  joinedVideoPath?: string
  segments: SegmentConfig[]
  selectedDriver: string
  projectName: string
}

interface ProjectCreationWizardProps {
  onComplete: (project: ProjectData) => void
  onCancel: () => void
}

const STEP_LABELS = ['Videos', 'Segments', 'Driver', 'Verify', 'Confirm'] as const

export function ProjectCreationWizard({ onComplete, onCancel }: ProjectCreationWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [state, setState] = useState<WizardState>({
    videoPaths: [],
    segments: [],
    selectedDriver: '',
    projectName: '',
  })

  function updateState(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 5) as 1 | 2 | 3 | 4 | 5)
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4 | 5)
  }

  function handleVideoPathsChange(paths: string[]) {
    setState((prev) => ({ ...prev, videoPaths: paths, joinedVideoPath: undefined }))
    setJoinError(null)
  }

  async function handleContinue() {
    if (step === 1 && !state.joinedVideoPath) {
      setJoining(true)
      setJoinError(null)
      try {
        const { joinedPath } = await window.racedash.joinVideos(state.videoPaths)
        updateState({ joinedVideoPath: joinedPath })
        setJoining(false)
        goNext()
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Failed to join video files')
        setJoining(false)
      }
      return
    }
    goNext()
  }

  const canContinue =
    (step === 1 && state.videoPaths.length >= 1) ||
    (step === 2 && state.segments.length >= 1) ||
    (step === 3 && state.selectedDriver !== '') ||
    step >= 4

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent
        className="flex w-[690px] flex-col gap-0 p-0"
        style={{ minHeight: '630px', maxHeight: '90vh' }}
      >
        <div className="shrink-0 border-b border-border px-8 py-6">
          <StepIndicator currentStep={step} steps={STEP_LABELS} />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 1 && (
            <Step1Videos
              videoPaths={state.videoPaths}
              onChange={handleVideoPathsChange}
              joining={joining}
              joinError={joinError ?? undefined}
            />
          )}
          {step === 2 && (
            <Step2Segments
              videoPaths={state.videoPaths}
              segments={state.segments}
              onChange={(segments) => updateState({ segments })}
            />
          )}
          {step === 3 && (
            <Step3Driver
              segments={state.segments}
              selectedDriver={state.selectedDriver}
              onChange={(driver) => updateState({ selectedDriver: driver })}
            />
          )}
          {step === 4 && <Step4Verify segments={state.segments} />}
          {step === 5 && (
            <Step5Confirm
              state={state}
              onNameChange={(name) => updateState({ projectName: name })}
              onComplete={onComplete}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-8 py-4">
          <Button variant="ghost" onClick={step === 1 ? onCancel : goBack}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step < 5 && (
            <Button onClick={handleContinue} disabled={!canContinue || joining}>
              {joining ? 'Joining…' : 'Continue'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/ProjectCreationWizard.tsx
git commit -m "refactor(wizard): replace manual backdrop with shadcn Dialog, use StepIndicator"
```

---

### Task 18: Rewrite Step1Videos.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step1Videos.tsx`

**Remove:** Inline drag-and-drop zone (`handleDrop`, `handleDragOver`, `handleDragLeave`, dashed `<div>`, file list display, "Change files" button), `useRef` import.

**Add:** `FileUpload` with `multiple={true}`.

- [ ] **Step 1: Update the file**

```tsx
import React from 'react'
import { FileUpload } from '@/components/app/FileUpload'

interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
  joining?: boolean
  joinError?: string
}

export function Step1Videos({ videoPaths: _videoPaths, onChange, joining, joinError }: Step1VideosProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Select your video files</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your GoPro chapter files. If your recording spans multiple files, select them
          all — they'll be joined automatically.
        </p>
      </div>

      <FileUpload
        multiple={true}
        accept={['mp4', 'mov', 'MP4', 'MOV']}
        onFiles={onChange}
        placeholder="Drop files here or browse"
        hint="Supports .mp4 and .mov files"
      />

      {joining && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Joining video files…
        </p>
      )}
      {joinError && (
        <p className="mt-3 text-sm text-destructive">{joinError}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step1Videos.tsx
git commit -m "refactor(wizard): replace inline drop zone with FileUpload in Step1Videos"
```

---

### Task 19: Rewrite Step2Segments.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2Segments.tsx`

**Change:** Raw `<button>` "Add another segment" → shadcn `Button` (variant outline, dashed border).

- [ ] **Step 1: Replace the raw button**

In the `segments.length > 0` branch, replace:

```tsx
<button
  type="button"
  onClick={() => setFormMode({ mode: 'add' })}
  className={cn(
    'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-2.5',
    'text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground'
  )}
>
  <span aria-hidden="true">+</span>
  <span>Add another segment</span>
</button>
```

With:

```tsx
<Button
  variant="outline"
  className="mt-2 w-full border-dashed"
  onClick={() => setFormMode({ mode: 'add' })}
>
  + Add another segment
</Button>
```

Remove `cn` import if it's no longer used after this change.

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step2Segments.tsx
git commit -m "refactor(wizard): replace raw button with shadcn Button in Step2Segments"
```

---

### Task 20: Rewrite Step2AddSegmentForm.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2AddSegmentForm.tsx`

**Remove:** `FileDrop` import; timing source pill `<button>` loop; `browseEmailFile` function.

**Add:** `FileUpload` from `components/app/FileUpload`; `ToggleGroup`/`ToggleGroupItem` from `components/ui/toggle-group`.

- [ ] **Step 1: Update the file**

1. Remove: `import { FileDrop } from '@/components/ui/file-drop'`
2. Add:
```tsx
import { FileUpload } from '@/components/app/FileUpload'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
```
3. Remove the `browseEmailFile` function.
4. Replace the timing source pills `<div className="flex flex-wrap gap-2">` block with:
```tsx
<ToggleGroup
  type="single"
  value={source}
  onValueChange={(val) => { if (val) changeSource(val as TimingSource) }}
  className="flex flex-wrap gap-2"
>
  {TIMING_SOURCES.map((ts) => (
    <ToggleGroupItem
      key={ts.value}
      value={ts.value}
      className="rounded-full border px-3.5 py-1 text-xs font-medium data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
    >
      {ts.label}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```
5. Replace `<FileDrop ... onClick={() => browseEmailFile(['eml', 'txt'])} />` (daytonaEmail) with:
```tsx
<FileUpload
  accept={['eml', 'txt']}
  onFile={setEmailPath}
  value={emailPath}
  placeholder="Drop file here or browse"
  hint=".eml or .txt email export from Daytona"
/>
```
6. Replace `<FileDrop ... onClick={() => browseEmailFile(['eml'])} />` (teamsportEmail) with:
```tsx
<FileUpload
  accept={['eml']}
  onFile={setEmailPath}
  value={emailPath}
  placeholder="Drop file here or browse"
  hint=".eml email export from TeamSport"
/>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step2AddSegmentForm.tsx
git commit -m "refactor(wizard): replace FileDrop and timing-source pills with FileUpload/ToggleGroup"
```

---

### Task 21: Rewrite Step2OffsetPicker.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2OffsetPicker.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step2AddSegmentForm.tsx` (call-site update)

**Remove:** `fixed inset-0` manual overlay; raw `<button>` nav elements; raw `<input type="range">`.

**Add:** `Dialog`/`DialogContent`; `open`/`onOpenChange` props replacing `onCancel`; shadcn `Button` for nav; shadcn `Slider` for scrubber.

- [ ] **Step 1: Rewrite Step2OffsetPicker.tsx**

```tsx
import React, { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface Step2OffsetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  segmentLabel: string
  videoPath: string
  initialFrame: number
  onConfirm: (frame: number) => void
}

const DEFAULT_FPS = 30

function formatTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = Math.floor(totalSeconds % 60)
  const ff = frame % fps
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ff).padStart(2, '0')}`
}

export function Step2OffsetPicker({
  open,
  onOpenChange,
  segmentLabel,
  videoPath,
  initialFrame,
  onConfirm,
}: Step2OffsetPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(initialFrame)

  useEffect(() => {
    if (!open) return
    window.racedash.getVideoInfo(videoPath).then((info) => {
      setFps(info.fps || DEFAULT_FPS)
      setTotalFrames(Math.floor(info.durationSeconds * (info.fps || DEFAULT_FPS)))
    }).catch((err) => {
      console.warn('[racedash] getVideoInfo fallback:', err)
    })
  }, [open, videoPath])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = currentFrame / fps
  }, [currentFrame, fps])

  function seekToFrame(frame: number) {
    const clamped = Math.max(0, Math.min(frame, totalFrames > 0 ? totalFrames - 1 : frame))
    setCurrentFrame(clamped)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[640px] max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Set video offset — {segmentLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Scrub to the first frame of the session, then confirm.
        </p>

        <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            src={videoPath.startsWith('/') ? `file://${videoPath}` : videoPath}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
            onLoadedMetadata={() => {
              const video = videoRef.current
              if (video && totalFrames === 0) {
                setTotalFrames(Math.floor(video.duration * fps))
              }
            }}
          />
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-mono text-white">
            {currentFrame} F
          </div>
        </div>

        <Slider
          min={0}
          max={totalFrames > 0 ? totalFrames - 1 : 1000}
          value={[currentFrame]}
          onValueChange={([v]) => seekToFrame(v)}
          className="w-full"
        />

        <p className="text-center font-mono text-xs text-muted-foreground">
          {formatTime(currentFrame, fps)}
        </p>

        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame - 10)}>⏮ -10</Button>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame - 1)}>← Prev</Button>
          <span className="w-20 text-center font-mono text-xs text-foreground">{formatTime(currentFrame, fps)}</span>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame + 1)}>Next →</Button>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame + 10)}>+10 ⏭</Button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(currentFrame); onOpenChange(false) }}>
            ✓ Use frame {currentFrame}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Update the call site in Step2AddSegmentForm.tsx**

Replace the conditional render block:
```tsx
// OLD — remove this:
{showOffsetPicker && videoPaths.length > 0 && (
  <Step2OffsetPicker
    segmentLabel={label || 'Segment'}
    videoPath={videoPaths[0]}
    initialFrame={videoOffsetFrame ?? 0}
    onConfirm={(frame) => { setVideoOffsetFrame(frame); setShowOffsetPicker(false) }}
    onCancel={() => setShowOffsetPicker(false)}
  />
)}

// NEW — add this (always rendered; Dialog controls visibility):
<Step2OffsetPicker
  open={showOffsetPicker && videoPaths.length > 0}
  onOpenChange={setShowOffsetPicker}
  segmentLabel={label || 'Segment'}
  videoPath={videoPaths[0] ?? ''}
  initialFrame={videoOffsetFrame ?? 0}
  onConfirm={(frame) => setVideoOffsetFrame(frame)}
/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step2OffsetPicker.tsx \
        apps/desktop/src/renderer/src/screens/wizard/steps/Step2AddSegmentForm.tsx
git commit -m "refactor(wizard): wrap Step2OffsetPicker in shadcn Dialog, replace raw inputs with Button/Slider"
```

---

### Task 22: Rewrite Step3Driver.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step3Driver.tsx`

**Change:** Driver selection raw `<button>` elements → shadcn `Button` (variant ghost, full width, `justify-start`).

- [ ] **Step 1: Replace the driver buttons**

In the `filtered.map((driver) => {...})` section, replace the raw `<button>` with a shadcn `Button`:

```tsx
// Replace raw <button key={driver.kart}> with:
<Button
  key={driver.kart}
  variant="ghost"
  className={cn(
    'flex h-auto w-full items-center justify-start gap-3 rounded-lg border px-4 py-2.5',
    isSelected
      ? 'border-primary bg-primary/10 text-foreground'
      : 'border-border bg-background text-foreground hover:bg-accent'
  )}
  onClick={() => onChange(driver.name)}
>
  {/* ...same inner content (kart number, name, checkmark) unchanged... */}
</Button>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step3Driver.tsx
git commit -m "refactor(wizard): replace raw driver buttons with shadcn Button in Step3Driver"
```

---

### Task 23: Rewrite Step4Verify.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step4Verify.tsx`

**Remove:** Raw `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<td>` block.

**Add:** `TimingTable` from `components/app/TimingTable`.

The local `LapRow` has `lapTime: string` (pre-formatted) and `isBest: boolean`. Map to `TimingTable`'s `LapRow` using `lapTimeLabel` for the pre-formatted string. `timeMs` is set to `0` as a placeholder since the real value is not available in the wizard.

- [ ] **Step 1: Update the file**

1. Remove local `LapRow` interface.
2. Add import: `import { TimingTable } from '@/components/app/TimingTable'`
3. In each `TabsContent`, replace the `<table>` block with:

```tsx
<TimingTable
  rows={laps.map((row) => ({
    lap: row.lap,
    timeMs: 0,
    position: row.position,
    lapTimeLabel: row.lapTime,
  }))}
/>
```

Keep `PLACEHOLDER_LAPS` as-is (it is still `{ lap, lapTime, position, isBest }`).

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step4Verify.tsx
git commit -m "refactor(wizard): replace raw table with TimingTable in Step4Verify"
```

---

### Task 24: Rewrite Step5Confirm.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/wizard/steps/Step5Confirm.tsx`

**Remove:** Local `SummaryRow` function definition.

**Add:** `InfoRow` from `components/app/InfoRow`. For the `mono` cases (Save to path, URL, file path), use `InfoRow` — the `font-mono` styling is cosmetic and not functionally required.

- [ ] **Step 1: Update the file**

1. Remove the `SummaryRow` function at the bottom of the file.
2. Add import: `import { InfoRow } from '@/components/app/InfoRow'`
3. Replace all `<SummaryRow label={...} value={...} />` usages with `<InfoRow label={...} value={...} />` (drop the `mono` prop).

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/wizard/steps/Step5Confirm.tsx
git commit -m "refactor(wizard): replace inline SummaryRow with InfoRow in Step5Confirm"
```

---

## Chunk 6: Pass 2 — Editor Screen Rewrites + Cleanup

### Task 25: Rewrite VideoPane.tsx + update Editor.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx`
- Modify: `apps/desktop/src/renderer/src/screens/editor/Editor.tsx`

**Remove from VideoPane:** All JSX — component becomes a thin wrapper.

**Add:** `VideoPlayer` + `VideoPlaybackControls` with stub props. `VideoPane` now accepts `videoPath?: string`.

**Update Editor.tsx:** Pass `videoPath={project.videoPaths[0]}` at the `<VideoPane />` call site.

- [ ] **Step 1: Read Editor.tsx to find the VideoPane call site**

Read `apps/desktop/src/renderer/src/screens/editor/Editor.tsx` and note the exact line where `<VideoPane />` is rendered and what props `project` has available there.

- [ ] **Step 2: Rewrite VideoPane.tsx**

```tsx
import React from 'react'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

interface VideoPaneProps {
  videoPath?: string
}

export function VideoPane({ videoPath }: VideoPaneProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col">
      <VideoPlayer videoPath={videoPath} />
      <VideoPlaybackControls
        duration={0}
        currentTime={0}
        playing={false}
        onPlay={() => {}}
        onPause={() => {}}
        onSeek={() => {}}
      />
    </div>
  )
}
```

- [ ] **Step 3: Update Editor.tsx**

Find `<VideoPane />` and change it to `<VideoPane videoPath={project.videoPaths[0]} />`. If `project` is not in scope at that call site, thread it through from wherever it is available.

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/VideoPane.tsx \
        apps/desktop/src/renderer/src/screens/editor/Editor.tsx
git commit -m "refactor(editor): replace VideoPane JSX with VideoPlayer/VideoPlaybackControls"
```

---

### Task 26: Rewrite TimelinePane.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx`

**Remove:** All JSX, `TrackRow`, `rulerTicks`, `formatRulerLabel`, all constants — everything moves into `Timeline.tsx`.

**Add:** `Timeline` from `components/app/Timeline`.

- [ ] **Step 1: Rewrite the file**

```tsx
import React from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { Timeline } from '@/components/app/Timeline'

interface TimelinePaneProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}

export function TimelinePane({ project, videoInfo }: TimelinePaneProps): React.ReactElement {
  return <Timeline project={project} videoInfo={videoInfo} />
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/TimelinePane.tsx
git commit -m "refactor(editor): replace TimelinePane JSX with Timeline component"
```

---

### Task 27: Rewrite EditorTabsPane.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx`

**Change:** Racedash Cloud footer raw `<button>` (disabled) → shadcn `Button` (variant ghost, size sm, disabled).

- [ ] **Step 1: Replace the footer button**

Replace:
```tsx
<button
  disabled
  className="cursor-not-allowed rounded px-3 py-1 text-xs text-muted-foreground opacity-40"
>
  Sign in
</button>
```

With:
```tsx
<Button variant="ghost" size="sm" disabled>
  Sign in
</Button>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/EditorTabsPane.tsx
git commit -m "refactor(editor): replace raw footer button with shadcn Button in EditorTabsPane"
```

---

### Task 28: Rewrite OverlayPickerModal.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/OverlayPickerModal.tsx`

**Remove:** `fixed inset-0` manual backdrop div; `onClick` backdrop-close handler.

**Add:** `Dialog`/`DialogContent` wrapper. Props: add `open: boolean`; rename `onClose` → `onOpenChange: (open: boolean) => void`.

> **Note:** This will cause a TypeScript error in `StyleTab.tsx` (wrong props) — that's fixed in Task 29.

- [ ] **Step 1: Update OverlayPickerModal.tsx**

1. Add import: `import { Dialog, DialogContent } from '@/components/ui/dialog'`
2. Update props interface:
```tsx
interface OverlayPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: OverlayType
  onApply: (overlay: OverlayType) => void
}
```
3. Replace the outer `<div className="fixed inset-0 z-50...">` and inner card `<div>` with:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="w-[740px] max-w-[740px]">
    {/* existing inner content unchanged, minus the wrapper divs */}
  </DialogContent>
</Dialog>
```
4. In the Cancel button handler: `onClick={() => onOpenChange(false)}`.

- [ ] **Step 2: Verify TypeScript (expect error in StyleTab.tsx — fixed in Task 29)**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/OverlayPickerModal.tsx
git commit -m "refactor(editor): wrap OverlayPickerModal in shadcn Dialog"
```

---

### Task 29: Rewrite StyleTab.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx`

**Remove:** Inlined `SectionLabel`, `ColourRow`, `isValidHex`, `ColourRowProps`. Remove `useRef` import (was only used by the inline `ColourRow`).

**Add:** `SectionLabel`, `ColourRow` from `components/app/`; update `OverlayPickerModal` call site; replace raw "Change" button with `Button`.

- [ ] **Step 1: Update StyleTab.tsx**

1. Remove inlined `isValidHex`, `SectionLabel`, `ColourRow`, `ColourRowProps`.
2. Remove `useRef` from the React import if not used elsewhere.
3. Add:
```tsx
import { SectionLabel } from '@/components/app/SectionLabel'
import { ColourRow } from '@/components/app/ColourRow'
```
4. Replace the conditional `{showOverlayPicker && (<OverlayPickerModal ... onClose={...} />)}` with an always-rendered dialog controlled by `open`:
```tsx
<OverlayPickerModal
  open={showOverlayPicker}
  onOpenChange={setShowOverlayPicker}
  current={overlayType}
  onApply={(overlay) => { setOverlayType(overlay); setShowOverlayPicker(false) }}
/>
```
5. Replace raw `<button onClick={() => setShowOverlayPicker(true)} ...>Change</button>` with:
```tsx
<Button variant="ghost" size="sm" onClick={() => setShowOverlayPicker(true)}>
  Change
</Button>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/StyleTab.tsx
git commit -m "refactor(editor): replace inlined SectionLabel/ColourRow with app components in StyleTab"
```

---

### Task 30: Rewrite ExportTab.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`

**Remove:** Inlined `SectionLabel`, `InfoRow`, `ToggleGroup`/`ToggleGroupProps`; manual `<div>` progress bar.

**Add:** `SectionLabel`, `InfoRow` from `components/app/`; `ToggleGroup`/`ToggleGroupItem` from `components/ui/toggle-group`; `Progress` from `components/ui/progress`; `Button` for "Show in Finder".

- [ ] **Step 1: Update ExportTab.tsx**

1. Remove inlined `SectionLabel`, `InfoRow`, `ToggleGroup`, `ToggleGroupProps` definitions.
2. Add:
```tsx
import { SectionLabel } from '@/components/app/SectionLabel'
import { InfoRow } from '@/components/app/InfoRow'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress } from '@/components/ui/progress'
```
3. Replace each `<ToggleGroup options={...} value={...} onChange={...} />` with shadcn `ToggleGroup`:
```tsx
<ToggleGroup
  type="single"
  value={outputResolution}
  onValueChange={(val) => { if (val) setOutputResolution(val as OutputResolution) }}
  className="flex flex-wrap gap-1"
>
  {resolutionOptions.map((o) => (
    <ToggleGroupItem
      key={o.value}
      value={o.value}
      disabled={o.disabled}
      className="rounded px-3 py-1 text-xs"
    >
      {o.label}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```
Apply the same pattern to `frameRateOptions` and `renderModeOptions`.

4. Replace the manual progress bar `<div>`:
```tsx
// Remove the <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">...</div>
// Replace with:
<Progress value={Math.round(renderProgress * 100)} />
```
5. Replace the "Show in Finder" raw `<button>` with:
```tsx
<Button
  variant="link"
  size="sm"
  onClick={() => window.racedash.revealInFinder(lastRender.outputPath)}
  className="shrink-0 p-0 text-xs"
>
  Show in Finder
</Button>
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx
git commit -m "refactor(editor): replace inlined primitives with app/ui components in ExportTab"
```

---

### Task 31: Rewrite TimingTab.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/screens/editor/tabs/TimingTab.tsx`

**Remove:** Inlined `SectionLabel`; raw `<table>` block; driver picker `fixed inset-0` inline modal; segment selector raw `<button>` loop; `openDriverPicker` callback and `driversResult`/`driversLoading`/`driversError` state (now inside `DriverPickerModal`); local `LapRow` interface.

**Add:** `SectionLabel`, `TimingTable`/`LapRow`, `DriverPickerModal`, `ToggleGroup`/`ToggleGroupItem`; replace "Change", "Edit", "+ Add" raw buttons with `Button`.

- [ ] **Step 1: Update TimingTab.tsx**

1. Remove inlined `SectionLabel` function.
2. Remove `driversResult`, `driversLoading`, `driversError` state and `openDriverPicker` callback.
3. Remove the inline driver picker modal block `{showDriverPicker && (<div className="fixed inset-0...">)}`.
4. Remove local `LapRow` interface.
5. Add:
```tsx
import { SectionLabel } from '@/components/app/SectionLabel'
import { TimingTable } from '@/components/app/TimingTable'
import type { LapRow } from '@/components/app/TimingTable'
import { DriverPickerModal } from '@/components/app/DriverPickerModal'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
```
6. Add `DriverPickerModal` (always rendered):
```tsx
<DriverPickerModal
  open={showDriverPicker}
  onOpenChange={setShowDriverPicker}
  configPath={project.projectPath}
  onSelect={(name) => setSelectedDriver(name)}
/>
```
7. Replace the segment selector raw button loop with:
```tsx
{segmentLabels.length > 1 && (
  <ToggleGroup
    type="single"
    value={String(activeSegment)}
    onValueChange={(val) => { if (val !== undefined) setActiveSegment(Number(val)) }}
    className="mb-3 flex gap-1"
  >
    {segmentLabels.map((label, i) => (
      <ToggleGroupItem key={i} value={String(i)} className="rounded px-3 py-1 text-xs">
        {label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
)}
```
8. Replace the `<table>` block with:
```tsx
{!timingLoading && !timingError && lapRows.length > 0 && (
  <TimingTable rows={lapRows} bestLapTimeMs={bestLapTime ?? undefined} />
)}
```
9. Replace "Change" raw button: `<Button variant="ghost" size="sm" onClick={() => setShowDriverPicker(true)}>Change</Button>`
10. Replace "Edit" raw button: `<Button variant="ghost" size="sm">Edit</Button>`
11. Replace "+ Add" raw button: `<Button variant="ghost" size="sm" onClick={() => setShowOverrideForm((v) => !v)}>+ Add</Button>`
12. Replace the override remove `<button>` (×): `<Button variant="ghost" size="icon" className="ml-auto h-5 w-5 hover:text-destructive" onClick={...}>×</Button>`

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/desktop && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/screens/editor/tabs/TimingTab.tsx
git commit -m "refactor(editor): replace inlined primitives with app components in TimingTab"
```

---

### Task 32: Delete obsolete files

**Files:**
- Delete: `apps/desktop/src/renderer/src/components/ui/file-drop.tsx`
- Delete: `apps/desktop/src/renderer/src/screens/wizard/WizardStepIndicator.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm apps/desktop/src/renderer/src/components/ui/file-drop.tsx
rm apps/desktop/src/renderer/src/screens/wizard/WizardStepIndicator.tsx
```

- [ ] **Step 2: Verify no dangling imports**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors. If any file still imports from these deleted paths, fix the import first.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: delete obsolete file-drop.tsx and WizardStepIndicator.tsx"
```

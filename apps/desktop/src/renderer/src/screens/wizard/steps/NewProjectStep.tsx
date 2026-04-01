import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { VideoFileList } from '@/components/video/VideoFileList'
import { smartSortVideoPaths } from '@/utils/videoFileOrder'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'

interface NewProjectStepProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  videoPaths: string[]
  onVideoPathsChange: (paths: string[]) => void
  saveDir: string
  onSaveDirChange: (dir: string) => void
}

/** Derive a project name from the first video filename. */
function suggestName(videoPath: string): string {
  const filename = videoPath.split(/[\\/]/).pop() ?? ''
  return filename
    .replace(/\.[^.]+$/, '')  // remove extension
    .replace(/_?\d{4}$/, '')  // remove trailing 4-digit pattern
}

export function NewProjectStep({
  projectName,
  onProjectNameChange,
  videoPaths,
  onVideoPathsChange,
  saveDir,
  onSaveDirChange,
}: NewProjectStepProps): React.ReactElement {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  async function handleBrowseVideos() {
    const selected = await window.racedash.openFiles({
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (!selected || selected.length === 0) return

    const existingSet = new Set(videoPaths)
    const newPaths = selected.filter((p) => !existingSet.has(p))
    if (newPaths.length === 0) return

    const merged = [...videoPaths, ...newPaths]
    const sorted = smartSortVideoPaths(merged)
    onVideoPathsChange(sorted)

    // Auto-suggest name from first video if name is empty
    if (!projectName && sorted.length > 0) {
      const suggested = suggestName(sorted[0])
      if (suggested) onProjectNameChange(suggested)
    }
  }

  async function handleBrowseSaveDir() {
    const dir = await window.racedash.openDirectory()
    if (dir) onSaveDirChange(dir)
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField label="Project name">
        <Input
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="e.g. Brands Hatch — March 2026"
          autoFocus
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Videos</p>
          <Button variant="outline" size="sm" onClick={handleBrowseVideos}>
            Browse files
          </Button>
        </div>

        {videoPaths.length === 0 ? (
          <button
            type="button"
            onClick={handleBrowseVideos}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <p className="text-sm font-medium text-foreground">Click to select video files</p>
            <p className="text-xs text-muted-foreground">.mp4, .mov</p>
          </button>
        ) : (
          <VideoFileList paths={videoPaths} onChange={onVideoPathsChange} />
        )}
      </div>

      {/* Advanced Settings accordion */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Advanced settings
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/20 p-4">
          <FormField label="Save location">
            <div className="flex gap-2">
              <Input
                value={saveDir}
                onChange={(e) => onSaveDirChange(e.target.value)}
                placeholder="~/Videos/racedash/project-name/"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleBrowseSaveDir} aria-label="Browse folder">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </FormField>
        </div>
      )}
    </div>
  )
}

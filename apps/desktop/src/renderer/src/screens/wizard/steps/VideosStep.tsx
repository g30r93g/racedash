import React from 'react'
import { Button } from '@/components/ui/button'
import { VideoFileList } from '@/components/video/VideoFileList'
import { Spinner } from '@/components/loaders/Spinner'

interface VideosStepProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
  joining?: boolean
  joinError?: string
}

export function VideosStep({ videoPaths, onChange, joining, joinError }: VideosStepProps) {
  async function handleBrowse() {
    const paths = await window.racedash.openFiles({
      title: 'Select video files',
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'MP4', 'MOV'] }],
    })
    if (!paths) return
    const combined = [...videoPaths, ...paths.filter((p) => !videoPaths.includes(p))]
    onChange(combined)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Select your video files</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your GoPro chapter files. If your recording spans multiple files, select them
          all — they'll be joined in the order shown below.
        </p>
      </div>

      <Button variant="outline" onClick={handleBrowse} className="self-start">
        Browse files…
      </Button>

      <VideoFileList paths={videoPaths} onChange={onChange} />

      {joining && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner
            name="checkerboard"
            size="1rem"
            color="currentColor"
            speed={2.5}
            ignoreReducedMotion
            label="Joining video files"
          />
          Joining video files…
        </p>
      )}
      {joinError && (
        <p className="text-sm text-destructive">{joinError}</p>
      )}
    </div>
  )
}

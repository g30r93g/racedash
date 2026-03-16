import React from 'react'
import { FileUpload } from '@/components/app/FileUpload'
import { VideoFileList } from '@/components/app/VideoFileList'

interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
  joining?: boolean
  joinError?: string
}

export function Step1Videos({ videoPaths, onChange, joining, joinError }: Step1VideosProps) {
  function handleNewFiles(newPaths: string[]) {
    // Append, deduping by path
    const combined = [...videoPaths, ...newPaths.filter((p) => !videoPaths.includes(p))]
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

      <FileUpload
        multiple={true}
        accept={['mp4', 'mov', 'MP4', 'MOV']}
        onFiles={handleNewFiles}
        placeholder="Drop files here or browse"
        hint="Supports .mp4 and .mov files"
      />

      <VideoFileList paths={videoPaths} onChange={onChange} />

      {joining && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Joining video files…
        </p>
      )}
      {joinError && (
        <p className="text-sm text-destructive">{joinError}</p>
      )}
    </div>
  )
}

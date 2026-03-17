import { VideoFileList } from '@/components/app/VideoFileList'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
  joining?: boolean
  joinProgress?: number
  joinError?: string
}

export function Step1Videos({
  videoPaths,
  onChange,
  joining,
  joinProgress = 0,
  joinError,
}: Step1VideosProps) {
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
        <div className="rounded-md border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">Joining video files…</span>
            <span className="tabular-nums text-muted-foreground">{Math.round(joinProgress * 100)}%</span>
          </div>
          <Progress value={joinProgress * 100} className="mt-3 h-2" />
        </div>
      )}
      {joinError && (
        <p className="text-sm text-destructive">{joinError}</p>
      )}
    </div>
  )
}

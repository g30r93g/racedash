import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { YouTubeUploadMetadata } from '../../../../types/ipc'

interface YouTubeUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (metadata: YouTubeUploadMetadata) => Promise<void>
  defaultTitle: string
  creditBalance: number
}

export function YouTubeUploadDialog({
  open,
  onOpenChange,
  onUpload,
  defaultTitle,
  creditBalance,
}: YouTubeUploadDialogProps): React.ReactElement {
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('unlisted')
  const [submitting, setSubmitting] = useState(false)

  const insufficientCredits = creditBalance < 10
  const canSubmit = title.trim().length > 0 && title.length <= 100 && !insufficientCredits && !submitting

  async function handleUpload() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onUpload({ title: title.trim(), description, privacy })
      onOpenChange(false)
    } catch (err) {
      // Let parent handle errors
      console.error('Upload failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Upload to YouTube</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yt-title" className="text-xs">
              Title
            </Label>
            <Input
              id="yt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground text-right">{title.length}/100</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yt-description" className="text-xs">
              Description
            </Label>
            <textarea
              id="yt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={3}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yt-privacy" className="text-xs">
              Privacy
            </Label>
            <Select value={privacy} onValueChange={(v) => setPrivacy(v as typeof privacy)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="unlisted">Unlisted</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-accent/40 px-3 py-2">
            <p className="text-xs text-foreground">
              This upload will use <strong>10 RC</strong>
            </p>
            <p className="text-xs text-muted-foreground">Your balance: {creditBalance} RC</p>
          </div>

          {insufficientCredits && (
            <p className="text-xs text-destructive">
              You need at least 10 RC to upload. Top up credits in the Account tab.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpload} disabled={!canSubmit}>
            {submitting ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

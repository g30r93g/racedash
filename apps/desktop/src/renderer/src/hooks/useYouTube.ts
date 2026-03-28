import { useState, useEffect, useCallback } from 'react'
import type { YouTubeConnectionStatus, YouTubeUploadMetadata, SocialUploadStatus } from '../../../types/ipc'

export function useYouTube() {
  const [status, setStatus] = useState<YouTubeConnectionStatus>({ connected: false, account: null })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.racedash.youtube.getStatus()
      setStatus(result)
    } catch {
      setStatus({ connected: false, account: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const connect = useCallback(async () => {
    const result = await window.racedash.youtube.connect()
    setStatus(result)
    return result
  }, [])

  const disconnect = useCallback(async () => {
    await window.racedash.youtube.disconnect()
    setStatus({ connected: false, account: null })
  }, [])

  return { status, loading, connect, disconnect, refresh }
}

export function useYouTubeUploads(jobId: string | null) {
  const [uploads, setUploads] = useState<SocialUploadStatus[]>([])

  const poll = useCallback(async () => {
    if (!jobId) return
    try {
      const result = await window.racedash.youtube.getUploads(jobId)
      setUploads(result)
    } catch {
      // ignore
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return
    poll()

    // Poll while any upload is in a non-terminal state
    const interval = setInterval(() => {
      const hasActive = uploads.some((u) => ['queued', 'uploading', 'processing'].includes(u.status))
      if (hasActive) poll()
    }, 10_000)

    return () => clearInterval(interval)
  }, [jobId, poll, uploads])

  const upload = useCallback(
    async (metadata: YouTubeUploadMetadata) => {
      if (!jobId) throw new Error('No job selected')
      const result = await window.racedash.youtube.upload(jobId, metadata)
      await poll()
      return result
    },
    [jobId, poll],
  )

  return { uploads, upload, poll }
}

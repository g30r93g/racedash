import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import { VideoPane, type VideoPaneHandle } from './VideoPane'
import { Timeline } from '@/components/app/Timeline'
import { EditorTabsPane } from './EditorTabsPane'
import type { Override } from './tabs/TimingTab'

function parsePositionString(pos: string): number {
  return parseInt(pos.replace(/^P/i, ''), 10)
}

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor({ project, onClose }: EditorProps): React.ReactElement {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)

  useEffect(() => {
    if (project.videoPaths.length === 0) return
    window.racedash
      .getVideoInfo(project.videoPaths[0])
      .then(setVideoInfo)
      .catch((err: unknown) => {
        console.warn('[Editor] getVideoInfo failed:', err)
      })
  }, [project.videoPaths])

  useEffect(() => {
    if (videoInfo === null) return
    window.racedash
      .generateTimestamps({ configPath: project.configPath, fps: videoInfo.fps })
      .then(setTimestampsResult)
      .catch((err: unknown) => {
        console.warn('[Editor] generateTimestamps failed:', err)
      })
  }, [project.configPath, videoInfo])

  const [overrides, setOverrides] = useState<Override[]>([])
  const overridesInitialisedRef = useRef(false)

  // Load initial overrides from config.json
  useEffect(() => {
    if (overridesInitialisedRef.current) return
    overridesInitialisedRef.current = true
    window.racedash.readProjectConfig(project.configPath).then((config) => {
      const segments = (config.segments ?? []) as Array<{ positionOverrides?: Array<{ timestamp: string; position: number }> }>
      const loaded: Override[] = []
      segments.forEach((seg, segmentIndex) => {
        for (const o of seg.positionOverrides ?? []) {
          loaded.push({ id: crypto.randomUUID(), segmentIndex, timecode: o.timestamp, position: `P${o.position}` })
        }
      })
      setOverrides(loaded)
    }).catch(() => { /* config may have no overrides yet */ })
  }, [project.configPath])

  // Auto-save overrides to config.json whenever they change (skip initial empty state)
  const overridesSavedRef = useRef(false)
  useEffect(() => {
    if (!overridesInitialisedRef.current) return
    if (!overridesSavedRef.current && overrides.length === 0) return
    overridesSavedRef.current = true
    const payload = overrides.map(({ segmentIndex, timecode, position }) => ({
      segmentIndex,
      timestamp: timecode,
      position: parsePositionString(position),
    }))
    window.racedash.updateProjectConfigOverrides(project.configPath, payload).catch((err: unknown) => {
      console.warn('[Editor] failed to save position overrides:', err)
    })
  }, [overrides, project.configPath])

  const [playing, setPlaying] = useState(false)
  const videoPaneRef = useRef<VideoPaneHandle>(null)
  const handleTimeUpdate = useCallback((t: number) => setCurrentTime(t), [])
  const handleSeek = useCallback((t: number) => videoPaneRef.current?.seek(t), [])
  const handleSave = useCallback(() => {
    videoPaneRef.current?.pause()
    onClose()
  }, [onClose])

  return (
    <div className="grid h-full w-full grid-cols-[1fr_430px] overflow-hidden">
      {/* Left pane — video fills remaining height, timeline pinned to bottom */}
      <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
        <VideoPane ref={videoPaneRef} videoPath={project.videoPaths[0]} fps={videoInfo?.fps} onTimeUpdate={handleTimeUpdate} onPlayingChange={setPlaying} />
        <Timeline
          project={project}
          videoInfo={videoInfo}
          currentTime={currentTime}
          timestampsResult={timestampsResult}
          overrides={overrides}
          onSeek={handleSeek}
        />
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex min-w-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane project={project} videoInfo={videoInfo} currentTime={currentTime} playing={playing} onSave={handleSave} overrides={overrides} onOverridesChange={setOverrides} />
      </div>
    </div>
  )
}

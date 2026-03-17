import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import { VideoPane, type VideoPaneHandle } from './VideoPane'
import { Timeline } from '@/components/app/Timeline'
import { EditorTabsPane } from './EditorTabsPane'
import type { Override } from './tabs/TimingTab'
import type { StyleState } from './tabs/StyleTab'
import type { BoxPosition, CornerPosition, OverlayProps } from '@racedash/core'

function parsePositionString(pos: string): number {
  return parseInt(pos.replace(/^P/i, ''), 10)
}

// ── Style history reducer ────────────────────────────────────────────────────

interface StyleHistoryState {
  history: StyleState[]
  cursor: number
}

type StyleHistoryAction =
  | { type: 'change'; next: StyleState }
  | { type: 'init'; initial: StyleState }
  | { type: 'undo' }
  | { type: 'redo' }

function styleHistoryReducer(state: StyleHistoryState, action: StyleHistoryAction): StyleHistoryState {
  switch (action.type) {
    case 'init':
      return { history: [action.initial], cursor: 0 }
    case 'change': {
      const base = state.history.slice(0, state.cursor + 1)
      const newHistory = [...base, action.next].slice(-50)
      return { history: newHistory, cursor: Math.min(state.cursor + 1, 49) }
    }
    case 'undo':
      return { ...state, cursor: Math.max(state.cursor - 1, 0) }
    case 'redo':
      return { ...state, cursor: Math.min(state.cursor + 1, state.history.length - 1) }
  }
}

const DEFAULT_STYLE_STATE: StyleState = { overlayType: 'banner', styling: {} }

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

  // ── Style state + undo/redo history ─────────────────────────────────────────
  const [styleHistoryState, dispatchStyle] = useReducer(styleHistoryReducer, {
    history: [DEFAULT_STYLE_STATE],
    cursor: 0,
  })
  const styleState = styleHistoryState.history[styleHistoryState.cursor]
  const canUndo = styleHistoryState.cursor > 0
  const canRedo = styleHistoryState.cursor < styleHistoryState.history.length - 1

  // Load initial style from config.json on mount
  useEffect(() => {
    window.racedash.readProjectConfig(project.configPath).then((config) => {
      const overlayType = (config.overlayType as StyleState['overlayType']) ?? 'banner'
      const styling = (config.styling as StyleState['styling']) ?? {}
      const boxPosition = config.boxPosition as BoxPosition | undefined
      const qualifyingTablePosition = config.qualifyingTablePosition as CornerPosition | undefined
      dispatchStyle({ type: 'init', initial: { overlayType, styling, boxPosition, qualifyingTablePosition } })
    }).catch(() => { /* no style saved yet — defaults are fine */ })
  }, [project.configPath])

  const handleStyleChange = useCallback((next: StyleState) => {
    dispatchStyle({ type: 'change', next })
    window.racedash.saveStyleToConfig(project.configPath, next.overlayType, next.styling, { boxPosition: next.boxPosition, qualifyingTablePosition: next.qualifyingTablePosition })
      .catch((err: unknown) => { console.warn('[Editor] saveStyleToConfig failed:', err) })
  }, [project.configPath])

  const handleUndo = useCallback(() => {
    const newCursor = Math.max(styleHistoryState.cursor - 1, 0)
    const next = styleHistoryState.history[newCursor]
    dispatchStyle({ type: 'undo' })
    window.racedash.saveStyleToConfig(project.configPath, next.overlayType, next.styling, { boxPosition: next.boxPosition, qualifyingTablePosition: next.qualifyingTablePosition })
      .catch((err: unknown) => { console.warn('[Editor] saveStyleToConfig (undo) failed:', err) })
  }, [styleHistoryState, project.configPath])

  const handleRedo = useCallback(() => {
    const newCursor = Math.min(styleHistoryState.cursor + 1, styleHistoryState.history.length - 1)
    const next = styleHistoryState.history[newCursor]
    dispatchStyle({ type: 'redo' })
    window.racedash.saveStyleToConfig(project.configPath, next.overlayType, next.styling, { boxPosition: next.boxPosition, qualifyingTablePosition: next.qualifyingTablePosition })
      .catch((err: unknown) => { console.warn('[Editor] saveStyleToConfig (redo) failed:', err) })
  }, [styleHistoryState, project.configPath])

  // Keyboard undo/redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

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

  const overlayProps = useMemo<OverlayProps | undefined>(() => {
    if (!timestampsResult || !videoInfo) return undefined
    return {
      segments: timestampsResult.sessionSegments,
      startingGridPosition: timestampsResult.startingGridPosition,
      fps: videoInfo.fps,
      durationInFrames: Math.ceil(videoInfo.durationSeconds * videoInfo.fps),
      videoWidth: videoInfo.width,
      videoHeight: videoInfo.height,
      boxPosition: styleState.boxPosition,
      qualifyingTablePosition: styleState.qualifyingTablePosition,
      styling: styleState.styling,
    }
  }, [timestampsResult, videoInfo, styleState])

  return (
    <div className="grid h-full w-full grid-cols-[1fr_430px] overflow-hidden">
      {/* Left pane — video fills remaining height, timeline pinned to bottom */}
      <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
        <VideoPane ref={videoPaneRef} videoPath={project.videoPaths[0]} fps={videoInfo?.fps} onTimeUpdate={handleTimeUpdate} onPlayingChange={setPlaying} overlayType={styleState.overlayType} overlayProps={overlayProps} />
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
        <EditorTabsPane project={project} videoInfo={videoInfo} currentTime={currentTime} playing={playing} onSave={handleSave} overrides={overrides} onOverridesChange={setOverrides} styleState={styleState} onStyleChange={handleStyleChange} onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo} />
      </div>
    </div>
  )
}

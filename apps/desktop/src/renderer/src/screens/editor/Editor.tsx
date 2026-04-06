import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import type { Boundary, CutRegion, Transition, TransitionType } from '../../../../types/videoEditing'
import { VideoEditingDrawer } from '@/components/video-editing/VideoEditingDrawer'
import { CutRegionList } from '@/components/video-editing/CutRegionList'
import { TransitionPills } from '@/components/video-editing/TransitionPills'
import { inferCutBounds } from '@/lib/videoEditing'
import { useSegmentBuffers, useBoundaries, useReconciledTransitions, useFrameMapping } from '@/hooks/useVideoEditing'
import { toast } from 'sonner'
import { useMultiVideo } from '../../hooks/useMultiVideo'
import { VideoPane, type VideoPaneHandle } from './VideoPane'
import { Timeline, type TimelineHandle } from '@/components/video/Timeline'
import type { TimelineViewMode } from '@/components/video/timeline/Timeline'
import { EditorTabsPane } from './EditorTabsPane'
import type { Override } from './tabs/TimingTab'
import type { StyleState } from './tabs/StyleTab'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayProps } from '@racedash/core'
import { useAuth } from '../../hooks/useAuth'
import { useLicense } from '../../hooks/useLicense'

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

const DEFAULT_STYLE_STATE: StyleState = {
  overlayType: 'banner',
  styling: {},
  overlayComponents: { leaderboard: 'on' },
}

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor({ project, onClose }: EditorProps): React.ReactElement {
  const { user, license: authLicense, isSignedIn, signIn } = useAuth()
  const { license: liveLicense } = useLicense(isSignedIn)
  const displayLicense = liveLicense ?? authLicense
  const [projectState, setProjectState] = useState(project)
  const [configRevision, setConfigRevision] = useState(0)
  const [timingRevision, setTimingRevision] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [cutRegions, setCutRegions] = useState<CutRegion[]>(projectState.cutRegions ?? [])
  const [transitions, setTransitions] = useState<Transition[]>(projectState.transitions ?? [])
  const multiVideoInfo = useMultiVideo(projectState.videoPaths)

  // Derive a VideoInfo-compatible object for downstream components (memoized to avoid
  // re-triggering the generateTimestamps effect on every render):
  const videoInfo: VideoInfo | null = useMemo(
    () =>
      multiVideoInfo
        ? {
            fps: multiVideoInfo.fps,
            durationSeconds: multiVideoInfo.totalDurationSeconds,
            width: multiVideoInfo.width,
            height: multiVideoInfo.height,
          }
        : null,
    [multiVideoInfo],
  )

  const timelineRef = useRef<TimelineHandle>(null)
  const currentTimeRef = useRef(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)
  const [timingLoading, setTimingLoading] = useState(false)
  const [timingError, setTimingError] = useState<string | null>(null)

  useEffect(() => {
    if (videoInfo === null) return
    let cancelled = false
    setTimingLoading(true)
    setTimingError(null)
    window.racedash
      .generateTimestamps({ configPath: projectState.configPath, fps: videoInfo.fps })
      .then((result) => {
        if (!cancelled) setTimestampsResult(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setTimingError(err instanceof Error ? err.message : String(err))
        console.warn('[Editor] generateTimestamps failed:', err)
      })
      .finally(() => {
        if (!cancelled) setTimingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectState.configPath, videoInfo, timingRevision])

  // ── Style state + undo/redo history ─────────────────────────────────────────
  const [styleHistoryState, dispatchStyle] = useReducer(styleHistoryReducer, {
    history: [DEFAULT_STYLE_STATE],
    cursor: 0,
  })
  const styleState = styleHistoryState.history[styleHistoryState.cursor]
  const canUndo = styleHistoryState.cursor > 0
  const canRedo = styleHistoryState.cursor < styleHistoryState.history.length - 1

  // Load initial style from config.json on mount (and after project edit)
  useEffect(() => {
    window.racedash
      .readProjectConfig(projectState.configPath)
      .then((config) => {
        const overlayType = (config.overlayType as StyleState['overlayType']) ?? 'banner'
        const styling = (config.styling as StyleState['styling']) ?? {}
        const boxPosition = config.boxPosition as BoxPosition | undefined
        const qualifyingTablePosition = config.qualifyingTablePosition as CornerPosition | undefined
        const overlayComponents =
          (config.overlayComponents as OverlayComponentsConfig | undefined) ?? DEFAULT_STYLE_STATE.overlayComponents
        const segmentStyles = (config.segmentStyles as StyleState['segmentStyles']) ?? undefined
        dispatchStyle({
          type: 'init',
          initial: { overlayType, styling, boxPosition, qualifyingTablePosition, overlayComponents, segmentStyles },
        })
      })
      .catch(() => {
        /* no style saved yet — defaults are fine */
      })
  }, [projectState.configPath, configRevision])

  const handleStyleChange = useCallback(
    (next: StyleState) => {
      dispatchStyle({ type: 'change', next })
      window.racedash
        .saveStyleToConfig(projectState.configPath, next.overlayType, next.styling, {
          boxPosition: next.boxPosition,
          qualifyingTablePosition: next.qualifyingTablePosition,
          overlayComponents: next.overlayComponents,
          segmentStyles: next.segmentStyles,
        })
        .catch((err: unknown) => {
          console.warn('[Editor] saveStyleToConfig failed:', err)
        })
    },
    [projectState.configPath],
  )

  const handleUndo = useCallback(() => {
    const newCursor = Math.max(styleHistoryState.cursor - 1, 0)
    const next = styleHistoryState.history[newCursor]
    dispatchStyle({ type: 'undo' })
    window.racedash
      .saveStyleToConfig(projectState.configPath, next.overlayType, next.styling, {
        boxPosition: next.boxPosition,
        qualifyingTablePosition: next.qualifyingTablePosition,
        overlayComponents: next.overlayComponents,
      })
      .catch((err: unknown) => {
        console.warn('[Editor] saveStyleToConfig (undo) failed:', err)
      })
  }, [styleHistoryState, projectState.configPath])

  const handleRedo = useCallback(() => {
    const newCursor = Math.min(styleHistoryState.cursor + 1, styleHistoryState.history.length - 1)
    const next = styleHistoryState.history[newCursor]
    dispatchStyle({ type: 'redo' })
    window.racedash
      .saveStyleToConfig(projectState.configPath, next.overlayType, next.styling, {
        boxPosition: next.boxPosition,
        qualifyingTablePosition: next.qualifyingTablePosition,
        overlayComponents: next.overlayComponents,
      })
      .catch((err: unknown) => {
        console.warn('[Editor] saveStyleToConfig (redo) failed:', err)
      })
  }, [styleHistoryState, projectState.configPath])

  // Keyboard undo/redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  const [overrides, setOverrides] = useState<Override[]>([])
  const overridesInitialisedRef = useRef(false)

  // Load initial overrides from config.json
  useEffect(() => {
    if (overridesInitialisedRef.current && configRevision === 0) return
    overridesInitialisedRef.current = true
    window.racedash
      .readProjectConfig(projectState.configPath)
      .then((config) => {
        const segments = (config.segments ?? []) as Array<{
          positionOverrides?: Array<{ timestamp: string; position: number }>
        }>
        const loaded: Override[] = []
        segments.forEach((seg, segmentIndex) => {
          for (const o of seg.positionOverrides ?? []) {
            loaded.push({ id: crypto.randomUUID(), segmentIndex, timecode: o.timestamp, position: `P${o.position}` })
          }
        })
        setOverrides(loaded)
      })
      .catch(() => {
        /* config may have no overrides yet */
      })
  }, [projectState.configPath, configRevision])

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
    window.racedash
      .updateProjectConfigOverrides(projectState.configPath, payload)
      .then(() => {
        // Only bump timingRevision so the engine re-generates with updated
        // overrides.  Do NOT bump configRevision here – that would trigger
        // the overrides-load effect, which produces new objects (new UUIDs),
        // which re-triggers this save effect, creating an infinite loop that
        // causes the timing table to flicker.
        setTimingRevision((r) => r + 1)
      })
      .catch((err: unknown) => {
        console.warn('[Editor] failed to save position overrides:', err)
      })
  }, [overrides, projectState.configPath])

  // Auto-save video editing state to project.json
  const videoEditingSavedRef = useRef(false)
  useEffect(() => {
    if (!videoEditingSavedRef.current && cutRegions.length === 0 && transitions.length === 0) return
    videoEditingSavedRef.current = true
    window.racedash
      .updateProjectVideoEditing(projectState.projectPath, { cutRegions, transitions })
      .catch((err: unknown) => {
        console.warn('[Editor] failed to save video editing state:', err)
      })
  }, [cutRegions, transitions, projectState.configPath])

  // ── Video editing: segment spans, boundaries, transitions ──────────────────
  const fps = videoInfo?.fps ?? 60
  const totalFrames = Math.ceil((videoInfo?.durationSeconds ?? 0) * fps)

  const segmentBuffers = useSegmentBuffers(styleState.styling, fps)

  const segmentSpansWithIds = useMemo(() => {
    return (projectState.segments ?? []).map((seg, i) => {
      const startSeconds = timestampsResult?.offsets[i] ?? (seg.videoOffsetFrame ?? 0) / fps
      const rawSeg = timestampsResult?.segments[i] as any
      const laps = rawSeg?.selectedDriver?.laps as Array<{ cumulative: number }> | undefined
      const lastLap = laps?.[laps.length - 1]
      const endSeconds = lastLap ? startSeconds + lastLap.cumulative : startSeconds
      return {
        id: seg.id,
        startFrame: Math.round(startSeconds * fps),
        endFrame: Math.round(endSeconds * fps),
      }
    })
  }, [projectState.segments, timestampsResult, fps])

  const boundaries = useBoundaries(totalFrames, cutRegions, segmentSpansWithIds, fps)
  const frameMapping = useFrameMapping(cutRegions, transitions, fps)

  const { kept: reconciledTransitions, removed } = useReconciledTransitions(transitions, boundaries)

  useEffect(() => {
    if (removed.length > 0) {
      setTransitions(reconciledTransitions)
    }
  }, [removed.length]) // Only react to changes in removed count

  const handleAddCut = useCallback(() => {
    const playheadFrame = Math.round(currentTimeRef.current * fps)
    const spans = segmentSpansWithIds.map(({ startFrame, endFrame }) => ({ startFrame, endFrame }))
    const newCut = inferCutBounds(playheadFrame, spans, segmentBuffers, totalFrames)
    if (!newCut) {
      toast.error('No dead space at playhead position')
      return
    }
    setCutRegions((prev) => [...prev, newCut])
  }, [fps, segmentSpansWithIds, segmentBuffers, totalFrames])

  const handleUpdateCut = useCallback((updated: CutRegion) => {
    setCutRegions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }, [])

  const handleDeleteCut = useCallback((id: string) => {
    setCutRegions((prev) => prev.filter((c) => c.id !== id))
    setTransitions((prev) => prev.filter((t) => t.boundaryId !== `cut:${id}`))
  }, [])

  const handleAddTransition = useCallback((type: TransitionType, boundaryId?: string) => {
    const targetId = boundaryId ?? boundaries.find((b) => !transitions.some((t) => t.boundaryId === b.id))?.id
    if (!targetId) {
      toast.error('No available boundary for transition')
      return
    }

    const boundary = boundaries.find((b) => b.id === targetId)
    if (!boundary) return

    if (transitions.some((t) => t.boundaryId === targetId)) {
      toast.error('This boundary already has a transition')
      return
    }

    if (!boundary.allowedTypes.includes(type)) {
      toast.error(`${type} is not compatible with ${boundary.label}`)
      return
    }

    setTransitions((prev) => [...prev, {
      id: crypto.randomUUID(),
      boundaryId: targetId,
      type,
      durationMs: 500,
    }])
  }, [boundaries, transitions])

  const handleUpdateTransition = useCallback((updated: Transition) => {
    setTransitions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }, [])

  const handleDeleteTransition = useCallback((id: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const [timelineViewMode, setTimelineViewMode] = useState<TimelineViewMode>('source')
  const [playing, setPlaying] = useState(false)
  const videoPaneRef = useRef<VideoPaneHandle>(null)
  // Update timeline imperatively every frame; batch React state at 4Hz for TimingTab
  const timeUpdateFrameRef = useRef(0)
  const handleTimeUpdate = useCallback((t: number) => {
    currentTimeRef.current = t
    const displayTime = timelineViewMode === 'project'
      ? frameMapping.toOutput(Math.round(t * fps)) / fps
      : t
    timelineRef.current?.seek(displayTime)
    // Throttle React state updates to ~4Hz (every 15 frames at 60fps)
    timeUpdateFrameRef.current++
    if (timeUpdateFrameRef.current % 15 === 0) {
      setCurrentTime(displayTime)
    }
  }, [timelineViewMode, frameMapping, fps])
  const handleSeek = useCallback((t: number) => {
    const sourceTime = timelineViewMode === 'project'
      ? frameMapping.toSource(Math.round(t * fps)) / fps
      : t
    videoPaneRef.current?.seek(sourceTime)
  }, [timelineViewMode, frameMapping, fps])
  const togglePlayPause = useCallback(() => {
    if (playing) {
      videoPaneRef.current?.pause()
    } else {
      videoPaneRef.current?.play()
    }
  }, [playing])

  // Space bar to toggle play/pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      togglePlayPause()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [togglePlayPause])

  const handleSave = useCallback(() => {
    videoPaneRef.current?.pause()
    onClose()
  }, [onClose])

  const handleProjectUpdate = useCallback((updated: ProjectData) => {
    setProjectState(updated)
    setConfigRevision((r) => r + 1)
    setTimingRevision((r) => r + 1)
    setOverrides([])
    overridesSavedRef.current = false
  }, [])

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
      overlayComponents: styleState.overlayComponents,
      styling: styleState.styling,
    }
  }, [timestampsResult, videoInfo, styleState])

  return (
    <div className={`grid h-full w-full overflow-hidden ${drawerOpen ? 'grid-cols-[256px_1fr_430px]' : 'grid-cols-[1fr_430px]'}`}>
      {/* Left drawer — video editing controls */}
      {drawerOpen && (
        <VideoEditingDrawer>
          <CutRegionList
            cuts={cutRegions}
            fps={fps}
            onAdd={handleAddCut}
            onUpdate={handleUpdateCut}
            onDelete={handleDeleteCut}
            disabled={!timestampsResult}
          />
          <TransitionPills onAdd={handleAddTransition} />
        </VideoEditingDrawer>
      )}

      {/* Center pane — video fills remaining height, timeline pinned to bottom */}
      <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
        <VideoPane
          ref={videoPaneRef}
          multiVideoInfo={multiVideoInfo}
          onTimeUpdate={handleTimeUpdate}
          onPlayingChange={setPlaying}
          overlayType={styleState.overlayType}
          overlayProps={overlayProps}
        />
        <Timeline
          ref={timelineRef}
          project={projectState}
          videoInfo={videoInfo}
          multiVideoInfo={multiVideoInfo}
          timestampsResult={timestampsResult}
          overrides={overrides}
          onSeek={handleSeek}
          viewMode={timelineViewMode}
          onViewModeChange={setTimelineViewMode}
          cutRegions={cutRegions}
          onCutClick={handleUpdateCut}
          boundaries={boundaries}
          transitions={transitions}
          onTransitionUpdate={handleUpdateTransition}
          onTransitionDelete={handleDeleteTransition}
        />
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex min-w-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane
          project={projectState}
          videoInfo={videoInfo}
          currentTime={currentTime}
          playing={playing}
          onSave={handleSave}
          overrides={overrides}
          onOverridesChange={setOverrides}
          styleState={styleState}
          onStyleChange={handleStyleChange}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          timestampsResult={timestampsResult}
          timingLoading={timingLoading}
          timingError={timingError}
          onProjectUpdate={handleProjectUpdate}
          authUser={user ? { name: user.name } : null}
          licenseTier={displayLicense?.tier ?? null}
          onSignIn={signIn}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((o) => !o)}
          cutRegions={cutRegions}
          transitions={transitions}
        />
      </div>
    </div>
  )
}

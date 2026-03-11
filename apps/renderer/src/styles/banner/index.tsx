import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapAtTime } from '../../timing'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { buildLeaderboard } from '../../leaderboard'

const DEFAULT_ACCENT = '#3DD73D'

export const Banner: React.FC<OverlayProps> = ({
  segments, fps, startingGridPosition,
  accentColor, textColor, timerTextColor, timerBgColor, labelWindowSeconds,
  qualifyingTablePosition,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps, mode } = segment

  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const showTable = segment.leaderboardDrivers != null

  // Live position from the qualifying table leaderboard (qualifying/practice only).
  const livePosition = useMemo<number | null>(() => {
    if (!showTable || mode === 'race') return null
    const leaderboard = buildLeaderboard(segment.leaderboardDrivers!, currentTime, mode)
    return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
  }, [showTable, mode, segment.leaderboardDrivers, currentTime, session.driver.kart])
  const accent = accentColor ?? DEFAULT_ACCENT
  const text = textColor ?? 'white'

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, currentTime), [session.timestamps, currentTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])
  const raceEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const outerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10 * scale,
    overflow: 'hidden',
  }), [scale])

  const bgStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    inset: 0,
    background: accent,
    opacity: 0.82,
  }), [accent])

  const wrapperStyle: React.CSSProperties = useMemo(() => ({
    position: 'relative',
    display: 'flex',
  }), [])

  const raceStart = session.timestamps[0].ytSeconds
  if (currentTime < raceStart && !isEnd) return null

  if (showTimePanels) {
    return (
      <AbsoluteFill>
        <div style={outerStyle}>
          <div style={bgStyle} />
          <div style={wrapperStyle}>
            <PositionCounter
              timestamps={session.timestamps}
              currentLaps={session.laps}
              sessionAllLaps={sessionAllLaps}
              currentIdx={currentIdx}
              currentTime={currentTime}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
              livePosition={livePosition}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="last"
                textColor={text}
              />
            </div>
            <LapTimerTrap
              timestamps={session.timestamps}
              lapColors={lapColors}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              raceEnd={raceEnd}
              textColor={timerTextColor ?? text}
              bgColor={timerBgColor}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="best"
                textColor={text}
              />
            </div>
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
            />
          </div>
        </div>
        {showTable && (
          <LeaderboardTable
            mode={mode}
            leaderboardDrivers={segment.leaderboardDrivers!}
            ourKart={session.driver.kart}
            fps={fps}
            accentColor={accent}
            anchorTop={140}
            position={qualifyingTablePosition ?? 'top-right'}
            raceLapSnapshots={segment.raceLapSnapshots}
          />
        )}
        {label && <SegmentLabel label={label} scale={scale} />}
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill>
      <div style={outerStyle}>
        <div style={bgStyle} />
        <div style={wrapperStyle}>
          <PositionCounter
            timestamps={session.timestamps}
            currentLaps={session.laps}
            sessionAllLaps={sessionAllLaps}
            currentIdx={currentIdx}
            currentTime={currentTime}
            mode={mode}
            startingGridPosition={startingGridPosition}
            textColor={text}
          />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <LapTimerTrap
              timestamps={session.timestamps}
              lapColors={lapColors}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              raceEnd={raceEnd}
              textColor={timerTextColor ?? text}
              bgColor={timerBgColor}
            />
          </div>
          <LapCounter
            timestamps={session.timestamps}
            currentLap={currentLap}
            currentTime={currentTime}
            textColor={text}
          />
        </div>
      </div>
      {showTable && (
        <LeaderboardTable
          mode={mode}
          leaderboardDrivers={segment.leaderboardDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          accentColor={accent}
          position={qualifyingTablePosition}
          raceLapSnapshots={segment.raceLapSnapshots}
        />
      )}
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}

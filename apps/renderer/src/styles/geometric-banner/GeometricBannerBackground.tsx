import React from 'react'

// Path d-strings are verbatim from geometric-banner.svg (viewBox 0 0 1010.181 67.30343).
// The group transform translate(4.1444685,42.938681) is preserved so shapes sit as authored.
// preserveAspectRatio="none" scales uniformly to any width × height.

const POSITION_COUNTER_D = 'm 143.04581,-42.938599 c 6.63767,0.07099 5.25944,2.485501 3.49433,3.989714 L 80.359531,19.851679 c -2.518313,2.237487 -6.12775,4.413286 -11.02226,4.485021 -3.64206,0.05337 -3.67408,0 -3.67408,0 l -69.8076598,2.33e-4 v -67.275532 z'
const LAST_LAP_D          = 'm 211.60347,-42.938681 -5.2e-4,3.16e-4 h -50.11051 c -5.96244,-0.0027 -8.32391,0.560708 -11.42902,3.41601 l -31.65065,27.897091 c -3.8609,3.4030271 1.04522,3.6278624 2.41019,3.6278624 h 50.37109 176.04145 c 7.2083,0.036725 7.85831,-0.1709424 11.58831,-3.4585904 l 31.60234,-27.854511 c 3.8609,-3.403028 -1.04522,-3.628178 -2.41019,-3.628178 z'
const LAP_TIMER_D         = 'm 403.36589,-36.587177 c -0.0577,0 -0.18134,0.01363 -0.25271,0.01489 -2.11492,0.02027 -2.42522,0.169942 -3.81947,1.398854 l -28.37314,24.991883 c -0.93178,0.821276 -1.21731,1.4045192 -1.18123,1.8451045 0.002,0.083661 0.0373,0.1806002 0.0649,0.2755152 0.0225,0.045118 0.0294,0.096636 0.0605,0.1374924 0.15101,0.3730236 0.44146,0.803098 1.07272,1.3594946 l 28.37315,24.9918843 c 0.43781,0.397737 1.70456,1.378577 3.81947,1.398853 0.0715,0.0012 0.19504,0.01489 0.25272,0.01489 h 148.74363 l 4.3e-4,-2.67e-4 h 45.41579 c 0.11961,0 0.16969,-0.0032 0.28061,-0.0032 h 0.45097 c 0.0245,0 0.0804,-0.0062 0.10761,-0.0064 2.25163,-0.01491 2.53899,-0.144359 3.965,-1.40045 l 28.37229,-24.9916212 c 0.9344,-0.8230628 1.21781,-1.4071641 1.17992,-1.8480303 -8.5e-4,-0.087341 -0.0373,-0.1886105 -0.0671,-0.2882808 -0.0201,-0.038172 -0.0255,-0.082478 -0.0518,-0.1175465 -0.14842,-0.3751043 -0.44034,-0.808925 -1.07795,-1.3709292 l -28.37235,-24.991911 c -1.4254,-1.256355 -1.71338,-1.385538 -3.96501,-1.40045 -0.0271,-1.98e-4 -0.083,-0.0064 -0.10761,-0.0064 h -0.45097 c -0.11092,-6.1e-5 -0.161,-0.0032 -0.28061,-0.0032 h -45.4158 l -4.3e-4,-2.67e-4 z'
const PREVIOUS_LAP_D      = 'm 790.28853,-42.934343 5.2e-4,3.17e-4 h 50.11051 c 5.96244,-0.0024 8.32391,0.560706 11.42902,3.416005 l 31.65065,27.897095 c 3.8609,3.4030294 -1.04522,3.627861 -2.41019,3.627861 H 830.69795 654.6565 c -7.2083,0.036744 -7.85831,-0.1709431 -11.58831,-3.45859 l -31.60234,-27.85451 c -3.8609,-3.403029 1.04522,-3.628178 2.41019,-3.628178 z'
const LAP_COUNTER_D       = 'm 858.84619,-42.934264 c -6.63767,0.071 -5.25944,2.485502 -3.49433,3.989718 l 66.18061,58.80056 c 2.51831,2.237488 6.12775,4.413287 11.02226,4.485023 3.64206,0.05335 3.67408,0 3.67408,0 l 69.80769,-0.0041 v -67.275532 z'

interface GeometricBannerBackgroundProps {
  width: number
  height: number
  positionCounterColor: string
  lastLapColor: string      // pass 'none' in race mode
  lapTimerFill: string      // pre-computed dynamic colour (neutral or flash)
  previousLapColor: string  // pass 'none' in race mode
  lapCounterColor: string
  opacity: number           // SVG-level opacity; multiplies all fills including flash colours
}

export const GeometricBannerBackground: React.FC<GeometricBannerBackgroundProps> = ({
  width, height,
  positionCounterColor, lastLapColor, lapTimerFill, previousLapColor, lapCounterColor,
  opacity,
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 1010.181 67.30343"
    preserveAspectRatio="none"
    opacity={opacity}
    style={{ position: 'absolute', inset: 0 }}
  >
    <g transform="translate(4.1444685,42.938681)">
      <path id="position-counter" d={POSITION_COUNTER_D} fill={positionCounterColor} opacity={opacity} />
      <path id="last-lap"         d={LAST_LAP_D}         fill={lastLapColor}         opacity={opacity} />
      <path id="lap-timer"        d={LAP_TIMER_D}        fill={lapTimerFill}         opacity={opacity} />
      <path id="previous-lap"     d={PREVIOUS_LAP_D}     fill={previousLapColor}     opacity={opacity} />
      <path id="lap-counter"      d={LAP_COUNTER_D}      fill={lapCounterColor}      opacity={opacity} />
    </g>
  </svg>
)

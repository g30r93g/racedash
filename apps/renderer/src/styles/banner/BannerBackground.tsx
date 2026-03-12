import React from 'react'
import { buildBannerPath } from './buildBannerPath'

interface BannerBackgroundProps {
  width: number        // rendered banner width in px
  height: number       // rendered banner height in px
  accentColor: string  // outer zone fill (expected opaque; opacity controlled by accentOpacity)
  accentOpacity: number
  darkColor: string    // center zone fill (may include alpha, e.g. 'rgba(107,33,168,0.95)')
  rise: number         // scaled px: how far above banner bottom the center section ends
  centerStart: number  // scaled px: x at which dark center begins (left boundary)
  centerEnd: number    // scaled px: x at which dark center ends (right boundary)
}

export const BannerBackground: React.FC<BannerBackgroundProps> = ({
  width, height, accentColor, accentOpacity, darkColor, rise, centerStart, centerEnd,
}) => {
  const d = buildBannerPath({ width, height, centerStart, centerEnd, rise })

  const scale = width / 1920
  const curveInset = Math.min(45 * scale, centerStart, width - centerEnd)
  const r = (n: number) => Math.round(n * 100) / 100
  const trapezoidD = [
    `M ${r(centerStart)} 0`,
    `L ${r(centerEnd)} 0`,
    `L ${r(centerEnd - curveInset)} ${r(height)}`,
    `L ${r(centerStart + curveInset)} ${r(height)}`,
    'Z',
  ].join(' ')

  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0 }}
    >
      <path d={d} fill={accentColor} opacity={accentOpacity} />
      <path d={trapezoidD} fill={darkColor} />
    </svg>
  )
}

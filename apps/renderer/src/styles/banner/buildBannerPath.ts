interface BuildBannerPathOptions {
  width: number
  height: number
  centerStart: number
  centerEnd: number
  rise: number
}

/**
 * Builds the SVG `d` string for the dark center S-curve shape.
 *
 * The shape starts flush with the top edge (y=0), uses cubic bezier S-curves
 * on each side, and has a flat bottom at (height - rise).
 *
 * Left S-curve: P0=(centerStart,0) → P3=(centerStart-curveInset, height-rise)
 * Right S-curve: P0=(centerEnd+curveInset, height-rise) → P3=(centerEnd, 0)
 * Control points share x with their respective anchor, creating vertical
 * tangents at both ends and a true S-inflection in the middle.
 */
export function buildBannerPath({
  width,
  height,
  centerStart,
  centerEnd,
  rise,
}: BuildBannerPathOptions): string {
  const scale = width / 1920
  const rawInset = 45 * scale
  const curveInset = Math.min(rawInset, centerStart, width - centerEnd)

  const cp1y = 0.3 * height
  const cp2y = 0.7 * height
  const bottomY = height - rise

  const lx0 = centerStart
  const lx3 = centerStart - curveInset
  const rx0 = centerEnd + curveInset
  const rx3 = centerEnd

  const r = (n: number) => Math.round(n * 100) / 100

  return [
    `M ${r(lx0)} 0`,
    `C ${r(lx0)} ${r(cp1y)} ${r(lx3)} ${r(cp2y)} ${r(lx3)} ${r(bottomY)}`,
    `L ${r(rx0)} ${r(bottomY)}`,
    `C ${r(rx0)} ${r(cp2y)} ${r(rx3)} ${r(cp1y)} ${r(rx3)} 0`,
    'Z',
  ].join(' ')
}

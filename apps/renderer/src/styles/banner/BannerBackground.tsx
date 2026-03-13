import React from 'react'

// Coordinate system: 160 units wide × 30.010578 units tall (Inkscape viewBox).
// Paths below have the layer translate(-20,-20) baked in so they start at (0,0).
// buildBgPath / buildTimerPath scale every coordinate to the target (w, h).

function buildBgPath(w: number, h: number): string {
  const sx = w / 160
  const sy = h / 30.010578
  const x = (v: number) => Math.round(v * sx * 1000) / 1000
  const y = (v: number) => Math.round(v * sy * 1000) / 1000

  // Relative commands (h, v, c, l) use dx/dy — scaled the same way.
  // Absolute commands (H) use target x directly.
  return [
    `M 0,0`,
    `h ${w}`,                                                                                       // top edge, full width
    `v ${y(28)}`,                                                                                   // right edge down
    `c 0,${y(0.942809)} ${x(-1.05719)},${y(2)} ${x(-2)},${y(2)}`,                                 // bottom-right rounded corner
    `h ${x(-4)}`,                                                                                   // bottom-right flat
    `c 0,0 ${x(0.003)},${y(4.62e-4)} ${x(-1)},0`,                                                 // start of right notch
    `${x(-1.49942)},${y(-6.9e-4)} ${x(-2.18098)},${y(-0.771467)} ${x(-3)},${y(-2)}`,              // right notch upper curve
    `l ${x(-8)},${y(-12)}`,                                                                         // right notch diagonal (56.31° — arctan(12/8) = arctan(1.5))
    `c ${x(-0.69697)},${y(-1.045457)} ${x(-1.72939)},${y(-1.998893)} ${x(-3)},${y(-2)}`,          // right notch lower curve
    `${x(-1.01808)},${y(-8.87e-4)} ${x(-1)},0 ${x(-1)},0`,                                        // right notch inner corner
    `H ${x(22)}`,                                                                                   // center flat (rises to top)
    `c 0,0 ${x(0.0089)},${y(-0.0014)} ${x(-1)},0`,                                                // left notch inner corner
    `${x(-1.022697)},${y(0.0014)} ${x(-2.225713)},${y(0.83857)} ${x(-3)},${y(2)}`,               // left notch lower curve
    `l ${x(-8)},${y(12)}`,                                                                          // left notch diagonal (56.31° — arctan(12/8) = arctan(1.5))
    `c ${x(-0.67147)},${y(1.007206)} ${x(-1.66783)},${y(1.968012)} ${x(-3)},${y(2)}`,            // left notch upper curve
    `${x(-0.991283)},${y(0.0238)} ${x(-1)},0 ${x(-1)},0`,                                         // end of left notch
    `H ${x(2)}`,                                                                                    // bottom-left flat
    `c ${x(-0.942809)},0 ${x(-2)},${y(-1.057191)} ${x(-2)},${y(-2)}`,                             // bottom-left rounded corner
    `z`,
  ].join(' ')
}

function buildTimerPath(w: number, h: number): string {
  const sx = w / 160
  const sy = h / 30.010578
  const x = (v: number) => Math.round(v * sx * 1000) / 1000
  const y = (v: number) => Math.round(v * sy * 1000) / 1000

  // Isosceles trapezoid: wide at top (x=55→105), tapering with curved lower corners to a flat base.
  // Centered at w/2 (55+105)/2 = 80 → 80*sx = w/2 ✓
  return [
    `M ${x(55)},0`,
    `l ${x(8.926883)},${y(22.317207)}`,                                                             // left diagonal
    `C ${x(64.523249)},${y(23.808122)} ${x(66.322236)},${y(25)} ${x(67.928)},${y(25)}`,           // bottom-left curve
    `h ${x(24.144)}`,                                                                               // bottom flat
    `c ${x(2.47714)},0 ${x(3.12838)},${y(-0.500958)} ${x(4.00124)},${y(-2.683112)}`,              // bottom-right curve
    `L ${x(105)},0`,                                                                                // right diagonal back to top
    `Z`,
  ].join(' ')
}

interface BannerBackgroundProps {
  width: number
  height: number
  bgFill: string
  opacity: number
  timerFill: string  // timer zone fill — changes dynamically on lap flash
}

export const BannerBackground: React.FC<BannerBackgroundProps> = ({
  width, height, bgFill, opacity, timerFill,
}) => (
  <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
    <path d={buildBgPath(width, height)} fill={bgFill} opacity={opacity} />
    <path d={buildTimerPath(width, height)} fill={timerFill} />
  </svg>
)

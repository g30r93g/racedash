# Banner S-Curve Shape Redesign

**Date:** 2026-03-12
**Status:** Approved

## Overview

Redesign the banner overlay's background to use an SVG-based shape where the center (dark) timer section has S-curved sides, creating an elongated-S profile along the bottom edge of the banner. The outer (accent-coloured) sections remain flat rectangles. Both race and practice/qualifying layouts use the same shape.

## Shape Geometry

The banner is split into two colour zones:

- **Outer / accent zone**: full-width, full-height rectangle behind the position, time panels, and lap counter.
- **Dark center overlay**: sits flush with the top edge, S-curved sides, flat bottom that ends `rise` pixels above the banner's actual bottom.

Reading left-to-right along the bottom edge the profile undulates:

```
outer bottom ──S-curve up── center bottom ──S-curve down── outer bottom
```

This undulation is the "elongated S."

### Constraints

| Property | Value |
|---|---|
| Top-left corner radius | 0 (sharp) |
| Top-right corner radius | 0 (sharp) |
| Bottom corner radius | Existing `bannerRadius` value |
| Center section rise (`sRise`) | Default 18px (before scale), configurable |
| Top corners of dark shape | Flush with banner top edge (y = 0) |
| `overflow: hidden` on outer container | Retained (clips children to the container boundary) |

### Banner dimensions

The banner height is `80 * scale` where `scale = width / 1920`. The outer container (`outerStyle`) must have an explicit `height: 80 * scale` set so that the absolutely-positioned `<BannerBackground>` SVG has a definite height to fill. `BannerBackground` must **not** call `useVideoConfig` internally — it receives all geometry as plain-number props.

### Boundary calculation — both layouts

The same `centerStart` / `centerEnd` formula is used for both race and practice/qualifying layouts, based on the practice/qualifying fixed widths. This ensures the dark center region has a consistent visual width across both modes (race mode will gain time panels in a future task, at which point both layouts will be identical):

```
timeLabelPanelWidth = max(0, (totalWidth − 180*scale − 180*scale − 300*scale) / 2)
centerStart         = 180*scale + timeLabelPanelWidth
centerEnd           = totalWidth − 180*scale − timeLabelPanelWidth
```

`timeLabelPanelWidth` is clamped to `0` from below to guard against very narrow widths. At standard 1920px this value is positive and symmetric.

The boundaries are derived purely from fixed-width constants and never from measured DOM layout. When `TimeLabelPanel` renders `null` (before race start or before lap 1), its flex container still occupies the same `flex: 1` space, so the SVG boundaries remain correct.

### S-curve construction

The dark center is a closed SVG path. Define:

- `H` = `80 * scale`
- `rise` = `sRise * scale`
- `curveInset` = `min(45 * scale, centerStart, totalWidth − centerEnd)` — clamped so the curve never exits the banner bounds
- `cp1y` = `0.3 * H`
- `cp2y` = `0.7 * H`

Full SVG path (`d` string):

```
M  centerStart                0
C  centerStart                cp1y
   (centerStart − curveInset) cp2y
   (centerStart − curveInset) (H − rise)
L  (centerEnd + curveInset)   (H − rise)
C  (centerEnd + curveInset)   cp2y
   centerEnd                  cp1y
   centerEnd                  0
Z
```

**How the S-curve works:** For the left edge, P0 = `(centerStart, 0)` and P3 = `(centerStart − curveInset, H − rise)`. Control point P1 = `(centerStart, cp1y)` shares the x of P0, and P2 = `(centerStart − curveInset, cp2y)` shares the x of P3. This makes the tangent vertical at both ends, with the horizontal transition occurring in the middle — producing a true S-inflection. The right edge is the mirror image, with `curveInset` added rather than subtracted.

## Component Structure

### New file: `BannerBackground.tsx`

Props:

```ts
interface BannerBackgroundProps {
  width:         number  // rendered banner width in px
  height:        number  // rendered banner height in px (= 80 * scale)
  accentColor:   string  // outer zone fill — expected to be an opaque colour value (e.g. '#3DD73D'); opacity is controlled separately via accentOpacity
  accentOpacity: number  // outer zone opacity (maps from existing bannerOpacity)
  darkColor:     string  // center zone fill — may include alpha (e.g. 'rgba(107,33,168,0.95)'); SVG path renders at opacity 1 so the colour's own alpha is the sole opacity control
  rise:          number  // scaled px: how far above banner bottom the center section ends
  centerStart:   number  // scaled px: x at which the dark center begins
  centerEnd:     number  // scaled px: x at which the dark center ends
}
```

Renders a `<svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>`:

1. `<rect x={0} y={0} width={width} height={height} fill={accentColor} opacity={accentOpacity} />` — full-width accent background
2. `<path d={computedPath} fill={darkColor} />` — dark center shape, no additional opacity attribute

### Modified: `Banner/index.tsx`

- Add explicit `height: 80 * scale` to `outerStyle`.
- Replace `borderRadius: bannerRadius` in `outerStyle` with `borderBottomLeftRadius: bannerRadius, borderBottomRightRadius: bannerRadius`.
- Retain `overflow: hidden` in `outerStyle`.
- Remove the `bgStyle` object, the `bgStyle` div, and the `EndCaps` constant entirely.
- Compute `centerStart` / `centerEnd` once using the shared formula above (same value used for both layouts).
- Replace the background div and EndCaps with `<BannerBackground width={width} height={80 * scale} accentColor={bannerBg} accentOpacity={bannerOpacity} darkColor={timerBackground} rise={(styling?.banner?.sRise ?? 18) * scale} centerStart={centerStart} centerEnd={centerEnd} />` in both the `showTimePanels` branch and the race layout branch.

### Modified: `packages/core/src/index.ts` — `BannerStyling` interface

Add one optional field to the existing `BannerStyling` interface, following the same pattern as existing fields:

```ts
/** Pre-scale px height by which the dark center section's bottom sits above the banner bottom. Default 18. */
sRise?: number
```

### Unchanged components

`LapTimerTrap`, `TimeLabelPanel`, `PositionCounter`, `LapCounter` — all render on top of the new SVG background unchanged.

## Configurability

| Styling key | Default | Description |
|---|---|---|
| `styling.banner.sRise` | `18` | Pre-scale px height difference between outer and center section bottoms |

All other visual properties (`accentColor`, `bannerBg`, `bannerOpacity`, `timerBgColor`, flash colours) already exist and continue to work without change.

## Out of Scope

- Adding time panels to race mode layout — flagged as a separate follow-up task.
- Any changes to leaderboard, segment label, or other overlay components.

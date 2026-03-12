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

### S-curve construction

Each side of the dark center is a single cubic bezier:

- **Left side**: from `(centerStart, 0)` to `(centerStart − curveInset, H − rise)`
- **Right side**: from `(centerEnd, 0)` to `(centerEnd + curveInset, H − rise)`

Both control points are placed vertically (one at ~30% height, one at ~70% height) to produce a true S-inflection rather than a simple arc. `curveInset` is a fixed proportion of `H` (approximately `H * 0.6`).

### Boundary calculation

```
centerStart = positionCounterWidth + timeLabelPanelWidth
centerEnd   = totalWidth − lapCounterWidth − timeLabelPanelWidth

positionCounterWidth = 180 * scale
lapCounterWidth      = 180 * scale
timeLabelPanelWidth  = (totalWidth − 180*scale − 180*scale − 300*scale) / 2
```

`timeLabelPanelWidth` is derived rather than fixed because `TimeLabelPanel` uses `flex: 1`.

## Component Structure

### New file: `BannerBackground.tsx`

```
Props:
  width:         number   — rendered banner width in px
  height:        number   — rendered banner height in px
  accentColor:   string   — outer zone fill
  accentOpacity: number   — outer zone opacity
  darkColor:     string   — center zone fill (bound to timerBackground for flashing)
  rise:          number   — how many px above banner bottom the center section ends
  centerStart:   number   — x at which the dark center begins (left boundary)
  centerEnd:     number   — x at which the dark center ends (right boundary)
```

Renders a single `<svg>` with `width`/`height` matching the container:

1. `<rect>` — full-width accent background with `opacity={accentOpacity}`
2. `<path>` — dark center shape (closed path: straight top, right S-curve, straight bottom, left S-curve reversed)

### Modified: `Banner/index.tsx`

- Replace `bgStyle` div and `EndCaps` with `<BannerBackground>` component.
- Pass `darkColor={timerBackground}` — no new flashing logic needed.
- Compute `centerStart` / `centerEnd` from the fixed widths above.
- Change outer container `borderRadius` to apply only to bottom corners (`borderBottomLeftRadius`, `borderBottomRightRadius`); remove top-corner radius.
- Add `styling?.banner?.sRise` with default `18` (before scale).

### Unchanged components

`LapTimerTrap`, `TimeLabelPanel`, `PositionCounter`, `LapCounter` — all render on top of the new SVG background unchanged.

## Configurability

| Styling key | Default | Description |
|---|---|---|
| `styling.banner.sRise` | `18` | Pre-scale px height difference between outer and center section bottoms |

All other visual properties (accent colour, timer bg, opacity, flash colours) already exist and continue to work without change.

## Out of Scope

- Adding time panels to race mode layout — flagged as a separate follow-up task.
- Any changes to leaderboard, segment label, or other overlay components.

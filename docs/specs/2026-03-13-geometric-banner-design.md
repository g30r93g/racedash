# Geometric Banner Overlay Style — Design Spec

**Date:** 2026-03-13
**Status:** Approved

---

## Overview

Add a new `geometric-banner` overlay style that uses a five-section Inkscape-authored SVG as the background. Each section corresponds to a functional area of the existing `banner` style and has an independently configurable fill colour. The existing content components (`PositionCounter`, `LapTimerTrap`, `LapCounter`, `TimeLabelPanel`) are reused and positioned over the geometric background.

---

## Source SVG

The SVG file must be committed to the repository at:

```
apps/renderer/src/styles/geometric-banner/geometric-banner.svg
```

Original location: `/Users/g30r93g/Desktop/geometric-banner.svg`

- **Canvas size:** 3818 px wide (the SVG's authored width; close to 4K/3840), `viewBox="0 0 1010.181 110.2687"`
- **Group transform:** `translate(4.1444685, 42.938681)` applied to all five paths
- **Paths and their semantic roles:**

| SVG `id`           | Role                                    | Default colour |
|--------------------|-----------------------------------------|----------------|
| `position-counter` | Left rounded cap — position number      | `#0bc770`      |
| `last-lap`         | Left parallelogram — last lap time      | `#16aa9c`      |
| `lap-timer`        | Centre hexagon — current lap timer      | `#0e0ab8`      |
| `previous-lap`     | Right parallelogram — best/prev lap     | `#7c16aa`      |
| `lap-counter`      | Right rounded cap — lap count           | `#c70b4d`      |

> **Note on the group transform:** With `preserveAspectRatio="none"` the `viewBox` scales both axes independently. The group `translate` is in viewBox units so it scales with the viewBox; no paths are clipped at normal banner aspect ratios. At extreme width-to-height ratios, verify visually that no paths are clipped.

---

## Files to Create / Modify

| Action | Path |
|--------|------|
| Create | `apps/renderer/src/styles/geometric-banner/geometric-banner.svg` |
| Create | `apps/renderer/src/styles/geometric-banner/GeometricBannerBackground.tsx` |
| Create | `apps/renderer/src/styles/geometric-banner/index.tsx` |
| Modify | `packages/core/src/index.ts` |
| Modify | `apps/renderer/src/registry.ts` |

---

## `GeometricBannerBackground` Component

Renders a single `<svg>` using the verbatim path `d` attributes from the Inkscape export:

```tsx
<svg
  width={width}
  height={height}
  viewBox="0 0 1010.181 110.2687"
  preserveAspectRatio="none"
  opacity={opacity}
  style={{ position: 'absolute', inset: 0 }}
>
  <g transform="translate(4.1444685,42.938681)">
    <path id="position-counter" d="..." fill={positionCounterColor} />
    <path id="last-lap"         d="..." fill={lastLapColor} />
    <path id="lap-timer"        d="..." fill={lapTimerFill} />
    <path id="previous-lap"     d="..." fill={previousLapColor} />
    <path id="lap-counter"      d="..." fill={lapCounterColor} />
  </g>
</svg>
```

Props:

```ts
interface GeometricBannerBackgroundProps {
  width: number
  height: number
  positionCounterColor: string
  lastLapColor: string    // pass 'none' in race mode to hide shape
  lapTimerFill: string    // pre-computed dynamic colour (neutral or flash); mirrors timerFill in BannerBackground
  previousLapColor: string  // pass 'none' in race mode to hide shape
  lapCounterColor: string
  opacity: number         // background fill opacity (like BannerStyling.bgOpacity); applied via svg opacity attr, distinct from FadeStyling
}
```

`preserveAspectRatio="none"` scales all five shapes uniformly to fill any `width × height`. In race mode, `lastLapColor` and `previousLapColor` are passed as `"none"` so those shapes are invisible (transparent gaps showing the video beneath — intentional geometric aesthetic).

**`lapTimerFill` receives the already-resolved runtime colour** (neutral, purple, green, or red) computed by the parent component — it does not receive the raw styling default. This mirrors exactly how `BannerBackground` receives `timerFill`.

---

## `GeometricBanner` Component

Located at `apps/renderer/src/styles/geometric-banner/index.tsx`.

### Banner height

Derived from the SVG's natural aspect ratio:

```ts
const bannerHeight = Math.round(width * (110.2687 / 1010.181))
// ≈ 209 px at 1920 px, ≈ 418 px at 3840 px
```

### Opacity

Two independent opacity values:

- **Background fill opacity** (`GeometricBannerStyling.opacity`, default `1`) — passed as the `opacity` prop to `GeometricBannerBackground`, applied as the SVG `opacity` attribute. Controls how opaque the geometric shapes are. Note: SVG `opacity` multiplies all fill alphas, including the timer shape's flash colour (which already embeds `0.95` alpha), so values below 1 will further dim flash colours.
- **Fade animation opacity** (`FadeStyling`) — applied to the `AbsoluteFill` wrapper exactly as in `Banner`. These two are fully independent.

### Lap flash logic

Identical to `Banner`. A `timerColorMap` maps `neutral | purple | green | red` to configurable colours:

```ts
const timerColorMap = {
  neutral: styling?.geometricBanner?.lapTimerNeutralColor ?? '#0e0ab8',
  purple:  styling?.geometricBanner?.lapColorPurple ?? 'rgba(107,33,168,0.95)',
  green:   styling?.geometricBanner?.lapColorGreen  ?? 'rgba(21,128,61,0.95)',
  red:     styling?.geometricBanner?.lapColorRed    ?? 'rgba(185,28,28,0.95)',
}
```

The resolved `timerBackground` colour is passed as `lapTimerFill` to `GeometricBannerBackground`.

### Practice / qualifying layout (all 5 sections visible)

```
[ PositionCounter ] [ TimeLabelPanel (last) ] [ LapTimerTrap ] [ TimeLabelPanel (best) ] [ LapCounter ]
```

### Race layout (`last-lap` and `previous-lap` paths hidden)

```
[ PositionCounter ] [ spacer flex:1 ] [ LapTimerTrap ] [ spacer flex:1 ] [ LapCounter ]
```

Both spacers use `flex: 1` so `LapTimerTrap` is centred in the remaining space between the two caps.

Both layouts use a `flex` row div positioned over `GeometricBannerBackground`, matching the existing `Banner` pattern.

### LeaderboardTable

Supported identically to `Banner`. In qualifying mode, `anchorTop` should be set to `bannerHeight + 30` (i.e. `Math.round(width * (110.2687 / 1010.181)) + 30`) so the table sits just below the geometric banner, scaled to the actual render width.

### Other features

Fade (`FadeStyling`), `SegmentLabel`, and `LeaderboardTable` are supported identically to `Banner`.

---

## `GeometricBannerStyling` Interface (core)

Add to `packages/core/src/index.ts`:

```ts
export interface GeometricBannerStyling {
  positionCounterColor?: string  // position-counter fill        (default: #0bc770)
  lastLapColor?: string          // last-lap fill                (default: #16aa9c)
  lapTimerNeutralColor?: string  // lap-timer neutral fill       (default: #0e0ab8)
  previousLapColor?: string      // previous-lap fill            (default: #7c16aa)
  lapCounterColor?: string       // lap-counter fill             (default: #c70b4d)
  lapColorPurple?: string        // personal best flash          (default: rgba(107,33,168,0.95))
  lapColorGreen?: string         // session best flash           (default: rgba(21,128,61,0.95))
  lapColorRed?: string           // slower lap flash             (default: rgba(185,28,28,0.95))
  timerTextColor?: string        // timer text colour            (default: white)
  flashDuration?: number         // flash duration in s          (default: 2)
  opacity?: number               // background fill opacity      (default: 1)
}
```

Add to `OverlayStyling`:

```ts
geometricBanner?: GeometricBannerStyling
```

---

## Registry Entry

```ts
'geometric-banner': {
  component: GeometricBanner,
  width: 1920,
  height: 500,          // tall canvas to accommodate leaderboard (matches banner)
  overlayX: 0,
  overlayY: 0,
  scaleWithVideo: true,
},
```

The physical banner shape occupies only the top ~209 px of the 500 px canvas at 1920 px; the remaining space is transparent and used by `LeaderboardTable` and `SegmentLabel`.

---

## What Is NOT in Scope

- No new test files (the SVG paths are embedded verbatim; there is no coordinate math to unit-test)
- No changes to existing styles
- No leaderboard layout changes (reuses existing `LeaderboardTable` unchanged)

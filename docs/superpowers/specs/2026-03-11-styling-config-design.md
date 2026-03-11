# Styling Config Refactor — Design Spec

**Date:** 2026-03-11

## Overview

Consolidate all color/styling configuration under a `styling` object in the JSON config file. Remove the existing flat color fields from `RenderConfig` and `OverlayProps`, remove styling-related CLI flags, and expose previously-hardcoded `LeaderboardTable` colors as configurable values.

---

## 1. Config File Schema

The `RenderConfig` interface gains a `styling` field. The existing flat fields (`accentColor`, `textColor`, `timerTextColor`, `timerBgColor`) are **removed**.

```typescript
interface LeaderboardStylingConfig {
  bgColor?: string           // default row background       (default: rgba(0,0,0,0.65))
  ourRowBgColor?: string     // our-kart row background      (default: rgba(0,0,0,0.82))
  textColor?: string         // driver name text             (default: white)
  positionTextColor?: string // position label (non-P1)      (default: rgba(255,255,255,0.5))
  kartTextColor?: string     // kart number column           (default: rgba(255,255,255,0.7))
  lapTimeTextColor?: string  // lap/interval time (non-P1)   (default: rgba(255,255,255,0.8))
  separatorColor?: string    // thin line between row groups (default: rgba(255,255,255,0.15))
}

interface BannerStylingConfig {
  timerTextColor?: string  // lap timer text color        (default: white)
  timerBgColor?: string    // lap timer background color  (default: #111111)
}

// No separate StylingConfig — the CLI imports OverlayStyling from @racedash/core directly.
// RenderConfig.styling uses the same type as OverlayProps.styling, so no transformation
// is needed when passing the value through to OverlayProps.

interface RenderConfig {
  segments: SegmentConfig[]
  driver?: string
  qualifyingTablePosition?: BoxPosition
  styling?: OverlayStyling  // imported from @racedash/core
}
```

Example config file:

```json
{
  "driver": "George",
  "segments": [
    { "mode": "qualifying", "url": "https://...", "offset": "0:02:15.500" }
  ],
  "styling": {
    "accentColor": "#3DD73D",
    "textColor": "white",
    "leaderboard": {
      "bgColor": "rgba(0,0,0,0.65)",
      "ourRowBgColor": "rgba(0,0,0,0.82)",
      "textColor": "white",
      "positionTextColor": "rgba(255,255,255,0.5)",
      "kartTextColor": "rgba(255,255,255,0.7)",
      "lapTimeTextColor": "rgba(255,255,255,0.8)",
      "separatorColor": "rgba(255,255,255,0.15)"
    },
    "banner": {
      "timerTextColor": "white",
      "timerBgColor": "#111111"
    }
  }
}
```

---

## 2. CLI Changes

The following flags are **removed** from the `render` command:

- `--accent-color`
- `--text-color`
- `--timer-text-color`
- `--timer-bg-color`

All styling is config-file-only.

**`RenderOpts`** drops `accentColor`, `textColor`, `timerTextColor`, `timerBgColor`.

**`LoadedConfig`** drops `configAccentColor`, `configTextColor`, `configTimerTextColor`, `configTimerBgColor` and gains `styling?: OverlayStyling` (imported from `@racedash/core`). The existing `configTablePosition` field is **retained** — only the four color fields are replaced.

**`loadRenderConfig`** reads `config.styling` and returns it verbatim as `styling` in `LoadedConfig`. No transformation is needed because `RenderConfig.styling` and `OverlayProps.styling` share the same `OverlayStyling` type. No CLI-flag merging is needed since the flags no longer exist.

The destructure at the `loadRenderConfig` call site becomes:
```typescript
const { segments: segmentConfigs, driverQuery, configTablePosition, styling } = await loadRenderConfig(opts)
```

The four `resolvedAccent`, `resolvedText`, `resolvedTimerText`, `resolvedTimerBg` variable declarations and the four `stat(...)` calls that print them are **removed**. The `colorSwatch`, `parseColor`, and `NAMED_COLORS` helpers become dead code and are **removed**.

---

## 3. `OverlayProps` and Core Types

In `packages/core/src/index.ts`, the four flat color fields on `OverlayProps` are **replaced** with a single `styling` field:

```diff
- accentColor?: string
- textColor?: string
- timerTextColor?: string
- timerBgColor?: string
+ styling?: OverlayStyling
```

Three new exported interfaces are added:

```typescript
export interface LeaderboardStyling {
  bgColor?: string
  ourRowBgColor?: string
  textColor?: string
  positionTextColor?: string
  kartTextColor?: string
  lapTimeTextColor?: string
  separatorColor?: string
}

export interface BannerStyling {
  timerTextColor?: string
  timerBgColor?: string
}

export interface OverlayStyling {
  accentColor?: string
  textColor?: string
  leaderboard?: LeaderboardStyling
  banner?: BannerStyling
}
```

The CLI constructs `overlayProps.styling` directly from `loadedConfig.styling` (or `undefined` if the config has no `styling` block).

---

## 4. `LeaderboardTable` Component

`LeaderboardTableProps` gains a `leaderboardStyling` prop. The existing `accentColor` prop is retained:

```typescript
interface LeaderboardTableProps {
  leaderboardDrivers: LeaderboardDriver[]
  ourKart: string
  mode: LeaderboardMode
  fps: number
  accentColor?: string
  leaderboardStyling?: LeaderboardStyling
  position?: BoxPosition
  anchorTop?: number
  raceLapSnapshots?: RaceLapSnapshot[]
}
```

`leaderboardStyling` is destructured in **both** `LeaderboardTable` and `TableRow` (it is passed as a prop to `TableRow`). Each hardcoded color is replaced with a value from `leaderboardStyling` with a fallback to the existing default:

| Element | New prop | Consumed by | Current hardcoded value |
|---|---|---|---|
| Default row background | `bgColor` | `TableRow` | `rgba(0,0,0,0.65)` |
| Our-row background | `ourRowBgColor` | `TableRow` | `rgba(0,0,0,0.82)` |
| Driver name text | `textColor` | `TableRow` | `white` |
| Position label (non-P1) | `positionTextColor` | `TableRow` | `rgba(255,255,255,0.5)` |
| Kart number column | `kartTextColor` | `TableRow` | `rgba(255,255,255,0.7)` |
| Lap/interval time (non-P1) | `lapTimeTextColor` | `TableRow` | `rgba(255,255,255,0.8)` |
| Separator line | `separatorColor` | `LeaderboardTable` | `rgba(255,255,255,0.15)` |

`separatorColor` is consumed directly in the `LeaderboardTable` render loop (the separator `<div>` is rendered there, not inside `TableRow`). All other props are consumed inside `TableRow`.

`accentColor` continues to drive: P1 position label, our-row left border, our-row background gradient overlay, and P1 lap time color.

Updated component signatures:

```typescript
// LeaderboardTable — add leaderboardStyling to props and destructure
export const LeaderboardTable = React.memo(function LeaderboardTable({
  leaderboardDrivers, ourKart, mode, fps,
  accentColor = '#3DD73D',
  leaderboardStyling,
  position = 'bottom-right',
  anchorTop,
  raceLapSnapshots,
}: LeaderboardTableProps) { ... })

// TableRow — add leaderboardStyling to props and destructure
const TableRow = React.memo(function TableRow({
  position, kart, name, lapDisplay, isOurs, isP1, accentColor, leaderboardStyling, sc,
}: TableRowProps) { ... })
```

---

## 5. Style Components

All four style components receive `styling?: OverlayStyling` from `OverlayProps` instead of the former flat fields.

**Banner (`banner/index.tsx`)** — the only style that used the flat color props:
- Replace `accentColor ?? DEFAULT_ACCENT` with `styling?.accentColor ?? DEFAULT_ACCENT`. `DEFAULT_ACCENT` remains a local constant in this file.
- Replace `textColor ?? 'white'` with `styling?.textColor ?? 'white'`.
- Replace `timerTextColor` with `styling?.banner?.timerTextColor`.
- Replace `timerBgColor` with `styling?.banner?.timerBgColor`.
- Pass `styling?.leaderboard` as `leaderboardStyling` to `<LeaderboardTable />`.

**Esports, Minimal, Modern** — these never destructured or used the flat color props; no color-prop changes are required. Two changes each:
1. Pass `styling?.leaderboard` as `leaderboardStyling` to `<LeaderboardTable />`.
2. Remove the now-meaningless `accentColor={undefined}` argument from each `<LeaderboardTable />` call (these styles do not provide an accent color; omitting the prop lets the component use its own default).

---

## 6. Files Changed

| Action | File |
|---|---|
| Modify | `packages/core/src/index.ts` |
| Modify | `apps/cli/src/index.ts` |
| Modify | `apps/renderer/src/components/shared/LeaderboardTable.tsx` |
| Modify | `apps/renderer/src/styles/banner/index.tsx` |
| No change | `apps/renderer/src/styles/banner/LapTimerTrap.tsx` | Already accepts `textColor?` and `bgColor?` props — interface unchanged |
| Modify | `apps/renderer/src/styles/esports/index.tsx` |
| Modify | `apps/renderer/src/styles/minimal/index.tsx` |
| Modify | `apps/renderer/src/styles/modern/index.tsx` |

---

## 7. Backward Compatibility

This is a breaking change on two surfaces:

1. **Config file format**: Any existing config file with flat `accentColor`, `textColor`, `timerTextColor`, or `timerBgColor` fields must be updated to nest them under `styling`. No migration shim is provided.

2. **`OverlayProps` wire format**: Any code that constructs `OverlayProps` directly must be updated to use `styling` instead of the four flat fields. The Remotion preview root (`apps/renderer/src/Root.tsx`) does not set any color fields in `defaultProps`, so no source edits are required there — the updated type is picked up automatically.

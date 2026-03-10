# Position Counter Design

## Summary

Add a position counter at the top-left of the geometric overlay, mirroring the existing `LapCounter` at top-right. A new `--mode` CLI flag (`practice|qualifying|race`) controls how position is computed.

## Data Flow

1. CLI `render` command accepts `--mode <practice|qualifying|race>` (required option)
2. `mode` is added to `OverlayProps` in `@racedash/core`
3. `Geometric` component passes `mode` down to a new `PositionCounter` component

## Position Calculation (Approach A — Per-lap-capped)

Position is computed at each lap crossing and held until the next crossing.

### Race mode

At lap N completion, compare:
- Current driver: `session.laps[N-1].cumulative`
- Each other driver: `sessionAllLaps[i][N-1]?.cumulative`

Drivers who have not yet completed N laps are ranked behind the current driver.
Position = count of drivers whose cumulative at lap N < current driver's cumulative + 1.

### Practice / Qualifying mode

At lap N completion, compare personal bests through lap N:
- Current driver best: `Math.min(...session.laps.slice(0, N).map(l => l.lapTime))`
- Each other driver best: `Math.min(...sessionAllLaps[i].slice(0, N).map(l => l.lapTime))` (capped to their available laps)

Drivers with no laps through N are excluded from comparison.
Position = count of other drivers whose best-through-N < current driver's best-through-N + 1.

Between lap crossings, position from the previous lap is displayed.
Before the race starts (before `timestamps[0].ytSeconds`), the component renders null.

## Components

### `PositionCounter.tsx`

New component in `apps/renderer/src/styles/geometric/`.

Props: `{ timestamps: LapTimestamp[], session: SessionData, sessionAllLaps: Lap[][], fps: number, mode: 'practice' | 'qualifying' | 'race' }`

Visual: Right-angle trapezoid flush to top-left, mirroring `LapCounter`:
- Size: 180×80
- Clip path: `polygon(0 0, 100% 0, 83% 100%, 0 100%)` (right side angled, left edge vertical)
- Background: `rgba(0,0,0,0.65)`
- Text: `P{n}` (e.g. `P3`), same font/size as `LapCounter` (28px, weight 400)
- Padding on left to offset from angled edge

### `Geometric` layout update

```tsx
{/* Position counter: left-angle trapezium flush to top-left */}
<div style={{ position: 'absolute', top: 0, left: 0 }}>
  <PositionCounter ... />
</div>
```

## Core Type Change

```ts
// packages/core/src/index.ts
export interface OverlayProps {
  session: SessionData
  sessionAllLaps: Lap[][]
  mode: 'practice' | 'qualifying' | 'race'
  fps: number
  durationInFrames: number
}
```

## CLI Change

```ts
interface RenderOpts {
  // ...existing...
  mode: 'practice' | 'qualifying' | 'race'
}

program
  .command('render <url> [driver]')
  // ...
  .requiredOption('--mode <mode>', 'Session mode: practice, qualifying, or race')
```

Validate that mode is one of the three values, error and exit otherwise.

## `Root.tsx` Default Props

Update `defaultProps` to include `mode: 'race'` for Remotion Studio preview.

## Files to Create

- `apps/renderer/src/styles/geometric/PositionCounter.tsx`

## Files to Modify

- `packages/core/src/index.ts` — add `mode` to `OverlayProps`
- `apps/renderer/src/styles/geometric/index.tsx` — add `PositionCounter` to layout
- `apps/renderer/src/Root.tsx` — add `mode: 'race'` to `defaultProps`
- `apps/cli/src/index.ts` — add `--mode` option and validation

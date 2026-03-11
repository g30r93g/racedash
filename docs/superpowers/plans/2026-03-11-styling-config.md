# Styling Config Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all color config under a `styling` object in the JSON config file, expose previously-hardcoded `LeaderboardTable` colors, and remove styling-related CLI flags.

**Architecture:** Add `LeaderboardStyling`, `BannerStyling`, `OverlayStyling` interfaces to `@racedash/core` and replace the four flat color fields on `OverlayProps` with `styling?: OverlayStyling`. Thread `styling` through CLI → `OverlayProps` → style components → `LeaderboardTable`. The CLI stops accepting colour flags; all styling is config-file-only.

**Tech Stack:** TypeScript, React (Remotion), Vitest, pnpm workspaces

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `packages/core/src/index.ts` | Add 3 new exported interfaces; replace 4 flat fields on `OverlayProps` with `styling?: OverlayStyling` |
| Modify | `apps/renderer/src/components/shared/LeaderboardTable.tsx` | Add `leaderboardStyling?: LeaderboardStyling` prop to `LeaderboardTableProps` and `TableRowProps`; replace all 7 hardcoded colours with prop + fallback |
| Modify | `apps/cli/src/index.ts` | Remove 4 CLI option declarations; drop 4 fields from `RenderOpts`; update `RenderConfig`, `LoadedConfig`, `loadRenderConfig`; remove resolved-colour vars, stat lines, and dead helpers |
| Modify | `apps/renderer/src/styles/banner/index.tsx` | Destructure `styling` instead of 4 flat fields; derive `accent`/`text`/timer colours from `styling.*` |
| Modify | `apps/renderer/src/styles/esports/index.tsx` | Add `styling` destructure; replace `accentColor={undefined}` with `leaderboardStyling={styling?.leaderboard}` |
| Modify | `apps/renderer/src/styles/minimal/index.tsx` | Same as esports |
| Modify | `apps/renderer/src/styles/modern/index.tsx` | Same as esports |

---

## How to verify at each step

- **TypeScript (core/CLI):** `pnpm --filter @racedash/core exec tsc --noEmit` and `pnpm --filter cli exec tsc --noEmit`
- **Renderer tests:** `pnpm --filter renderer test` — 99 tests in 5 files must continue to pass
- **Renderer TypeScript:** `pnpm --filter renderer build` (runs `tsc --noEmit`)

---

## Chunk 1: Core types

### Task 1: Add styling interfaces and update `OverlayProps`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Open `packages/core/src/index.ts` and locate `OverlayProps`**

  It starts around line 52. The four flat colour fields to replace are:
  ```ts
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  ```

- [ ] **Step 2: Add the three new exported interfaces immediately before `OverlayProps`**

  Insert this block just above the `export interface OverlayProps` line:

  ```ts
  export interface LeaderboardStyling {
    bgColor?: string           // default row background      (default: rgba(0,0,0,0.65))
    ourRowBgColor?: string     // our-kart row background     (default: rgba(0,0,0,0.82))
    textColor?: string         // driver name text            (default: white)
    positionTextColor?: string // position label (non-P1)     (default: rgba(255,255,255,0.5))
    kartTextColor?: string     // kart number column          (default: rgba(255,255,255,0.7))
    lapTimeTextColor?: string  // lap/interval time (non-P1)  (default: rgba(255,255,255,0.8))
    separatorColor?: string    // thin line between groups    (default: rgba(255,255,255,0.15))
  }

  export interface BannerStyling {
    timerTextColor?: string  // lap timer text color   (default: white)
    timerBgColor?: string    // lap timer background   (default: #111111)
  }

  export interface OverlayStyling {
    accentColor?: string       // global accent         (default: #3DD73D)
    textColor?: string         // global text color     (default: white)
    leaderboard?: LeaderboardStyling
    banner?: BannerStyling
  }
  ```

- [ ] **Step 3: Replace the four flat colour fields on `OverlayProps` with `styling`**

  Remove:
  ```ts
  accentColor?: string    // hex/CSS color for style accent (e.g. banner green band)
  textColor?: string      // hex/CSS color for overlay text (default: white)
  timerTextColor?: string // hex/CSS color for the lap timer text (default: white)
  timerBgColor?: string   // hex/CSS color for the lap timer background (default: #111111)
  ```

  Replace with:
  ```ts
  styling?: OverlayStyling
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  pnpm --filter @racedash/core exec tsc --noEmit
  ```

  Expected: no errors. (Downstream packages will break until their tasks are complete — that's expected.)

- [ ] **Step 5: Commit**

  ```bash
  git add packages/core/src/index.ts
  git commit -m "feat(core): add OverlayStyling interfaces and replace flat colour fields on OverlayProps"
  ```

---

## Chunk 2: LeaderboardTable component

### Task 2: Add `leaderboardStyling` prop and apply colour fallbacks

**Files:**
- Modify: `apps/renderer/src/components/shared/LeaderboardTable.tsx`

- [ ] **Step 1: Import `LeaderboardStyling` from `@racedash/core`**

  The existing import line is:
  ```ts
  import type { BoxPosition, LeaderboardDriver, RaceLapSnapshot } from '@racedash/core'
  ```

  Add `LeaderboardStyling` to the import:
  ```ts
  import type { BoxPosition, LeaderboardDriver, LeaderboardStyling, RaceLapSnapshot } from '@racedash/core'
  ```

- [ ] **Step 2: Add `leaderboardStyling` to `LeaderboardTableProps`**

  Add after the existing `accentColor?: string` field:
  ```ts
  leaderboardStyling?: LeaderboardStyling
  ```

- [ ] **Step 3: Add `leaderboardStyling` to the `LeaderboardTable` destructure and default**

  Current signature (line ~21):
  ```ts
  export const LeaderboardTable = React.memo(function LeaderboardTable({
    leaderboardDrivers,
    ourKart,
    mode,
    fps,
    accentColor = '#3DD73D',
    position = 'bottom-right',
    anchorTop,
    raceLapSnapshots,
  }: LeaderboardTableProps) {
  ```

  Add `leaderboardStyling,` after `accentColor = '#3DD73D',`:
  ```ts
  export const LeaderboardTable = React.memo(function LeaderboardTable({
    leaderboardDrivers,
    ourKart,
    mode,
    fps,
    accentColor = '#3DD73D',
    leaderboardStyling,
    position = 'bottom-right',
    anchorTop,
    raceLapSnapshots,
  }: LeaderboardTableProps) {
  ```

- [ ] **Step 4: Apply `separatorColor` in the separator `<div>` inside `LeaderboardTable`**

  The separator `<div>` currently is (line ~84):
  ```tsx
  <div style={{ height: 1 * sc, background: 'rgba(255,255,255,0.15)', margin: `${3 * sc}px 0` }} />
  ```

  Replace with:
  ```tsx
  <div style={{ height: 1 * sc, background: leaderboardStyling?.separatorColor ?? 'rgba(255,255,255,0.15)', margin: `${3 * sc}px 0` }} />
  ```

- [ ] **Step 5: Pass `leaderboardStyling` to `<TableRow />`**

  Each `<TableRow />` call (line ~86) currently passes:
  ```tsx
  <TableRow
    position={row.position}
    kart={row.kart}
    name={row.name}
    lapDisplay={lapDisplay}
    isOurs={isOurs}
    isP1={isP1}
    accentColor={accentColor}
    sc={sc}
  />
  ```

  Add `leaderboardStyling={leaderboardStyling}`:
  ```tsx
  <TableRow
    position={row.position}
    kart={row.kart}
    name={row.name}
    lapDisplay={lapDisplay}
    isOurs={isOurs}
    isP1={isP1}
    accentColor={accentColor}
    leaderboardStyling={leaderboardStyling}
    sc={sc}
  />
  ```

- [ ] **Step 6: Add `leaderboardStyling` to `TableRowProps` and the `TableRow` destructure**

  Add to `TableRowProps` after `accentColor: string`:
  ```ts
  leaderboardStyling?: LeaderboardStyling
  ```

  Add `leaderboardStyling,` to the `TableRow` destructure after `accentColor`.

- [ ] **Step 7: Replace all 6 hardcoded colours inside `TableRow` with prop + fallback**

  The `rowStyle` block and the `<span>` elements inside `TableRow` currently use hardcoded values. Replace each one:

  **`rowStyle` — two background colours:**
  ```ts
  // Before:
  background: isOurs
    ? `linear-gradient(${accentColor}30, ${accentColor}30), rgba(0,0,0,0.82)`
    : 'rgba(0,0,0,0.65)',

  // After:
  background: isOurs
    ? `linear-gradient(${accentColor}30, ${accentColor}30), ${leaderboardStyling?.ourRowBgColor ?? 'rgba(0,0,0,0.82)'}`
    : (leaderboardStyling?.bgColor ?? 'rgba(0,0,0,0.65)'),
  ```

  **Position label `<span>` — `color`:**
  ```ts
  // Before:
  color: isP1 ? accentColor : 'rgba(255,255,255,0.5)'

  // After:
  color: isP1 ? accentColor : (leaderboardStyling?.positionTextColor ?? 'rgba(255,255,255,0.5)')
  ```

  **Kart number `<span>` — `color`:**
  ```ts
  // Before:
  color: 'rgba(255,255,255,0.7)'

  // After:
  color: leaderboardStyling?.kartTextColor ?? 'rgba(255,255,255,0.7)'
  ```

  **Driver name `<span>` — `color`:**
  ```ts
  // Before:
  color: 'white'

  // After:
  color: leaderboardStyling?.textColor ?? 'white'
  ```

  **Lap display `<span>` — `color`:**
  ```ts
  // Before:
  color: isP1 ? accentColor : 'rgba(255,255,255,0.8)'

  // After:
  color: isP1 ? accentColor : (leaderboardStyling?.lapTimeTextColor ?? 'rgba(255,255,255,0.8)')
  ```

- [ ] **Step 8: Verify renderer TypeScript and tests**

  ```bash
  pnpm --filter renderer build
  pnpm --filter renderer test
  ```

  Expected: TypeScript clean, 99 tests pass.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/renderer/src/components/shared/LeaderboardTable.tsx
  git commit -m "feat(renderer): add leaderboardStyling prop to LeaderboardTable with colour fallbacks"
  ```

---

## Chunk 3: CLI

### Task 3: Update config types and `loadRenderConfig`

**Files:**
- Modify: `apps/cli/src/index.ts`

- [ ] **Step 1: Add `OverlayStyling` to the `@racedash/core` import**

  Find the existing core import (near the top of the file). It currently imports `BoxPosition`, `SessionMode`, and `OverlayProps` among others. Add `OverlayStyling`:

  ```ts
  import type { ..., OverlayStyling } from '@racedash/core'
  ```

  (Keep whatever other types are already imported; just add `OverlayStyling` to the list.)

- [ ] **Step 2: Update `RenderConfig` — remove four flat colour fields, add `styling`**

  Current `RenderConfig` (around line 539):
  ```ts
  interface RenderConfig {
    segments: SegmentConfig[]
    driver?: string
    qualifyingTablePosition?: BoxPosition
    accentColor?: string
    textColor?: string
    timerTextColor?: string
    timerBgColor?: string
  }
  ```

  Replace with:
  ```ts
  interface RenderConfig {
    segments: SegmentConfig[]
    driver?: string
    qualifyingTablePosition?: BoxPosition
    styling?: OverlayStyling
  }
  ```

- [ ] **Step 3: Update `LoadedConfig` — remove four colour fields, add `styling`**

  Current `LoadedConfig` (around line 549):
  ```ts
  interface LoadedConfig {
    segments: SegmentConfig[]
    driverQuery: string
    configTablePosition?: BoxPosition
    configAccentColor?: string
    configTextColor?: string
    configTimerTextColor?: string
    configTimerBgColor?: string
  }
  ```

  Replace with:
  ```ts
  interface LoadedConfig {
    segments: SegmentConfig[]
    driverQuery: string
    configTablePosition?: BoxPosition
    styling?: OverlayStyling
  }
  ```

- [ ] **Step 4: Update `loadRenderConfig` — read `config.styling`, drop four colour fields**

  Inside the config-file branch of `loadRenderConfig` (around line 574), the current return is:
  ```ts
  return {
    segments: config.segments,
    driverQuery,
    configTablePosition: config.qualifyingTablePosition,
    configAccentColor: config.accentColor,
    configTextColor: config.textColor,
    configTimerTextColor: config.timerTextColor,
    configTimerBgColor: config.timerBgColor,
  }
  ```

  Replace with:
  ```ts
  return {
    segments: config.segments,
    driverQuery,
    configTablePosition: config.qualifyingTablePosition,
    styling: config.styling,
  }
  ```

- [ ] **Step 5: Update the `loadRenderConfig` call site — remove four colour destructure fields**

  Around line 204, the destructure currently is:
  ```ts
  const { segments: segmentConfigs, driverQuery, configTablePosition, configAccentColor, configTextColor, configTimerTextColor, configTimerBgColor } = await loadRenderConfig(opts)
  ```

  Replace with:
  ```ts
  const { segments: segmentConfigs, driverQuery, configTablePosition, styling } = await loadRenderConfig(opts)
  ```

- [ ] **Step 6: Remove the four `resolved*` variables and their `stat()` calls**

  Lines 346–354 contain the four variable declarations, four `stat()` calls, and a trailing blank `process.stderr.write('\n')` that serves as the section separator:
  ```ts
  const resolvedAccent    = opts.accentColor    ?? configAccentColor    ?? '#3DD73D'
  const resolvedText      = opts.textColor      ?? configTextColor      ?? 'white'
  const resolvedTimerText = opts.timerTextColor ?? configTimerTextColor ?? 'white'
  const resolvedTimerBg   = opts.timerBgColor   ?? configTimerBgColor   ?? '#111111'
  stat('Accent',      `${colorSwatch(resolvedAccent)}${resolvedAccent}`)
  stat('Text',        `${colorSwatch(resolvedText)}${resolvedText}`)
  stat('Timer text',  `${colorSwatch(resolvedTimerText)}${resolvedTimerText}`)
  stat('Timer bg',    `${colorSwatch(resolvedTimerBg)}${resolvedTimerBg}`)
  process.stderr.write('\n')
  ```

  Delete all nine lines. There is already a `process.stderr.write('\n')` at line 342 (before the Video stat), so removing this second one is safe.

- [ ] **Step 7: Update `overlayProps` construction — replace four flat fields with `styling`**

  Around lines 356–370, the `overlayProps` object sets:
  ```ts
  accentColor: resolvedAccent,
  textColor: resolvedText,
  timerTextColor: resolvedTimerText,
  timerBgColor: resolvedTimerBg,
  ```

  Replace all four with:
  ```ts
  styling,
  ```

- [ ] **Step 8: Remove the four CLI option declarations from the `render` command**

  Find and delete these four `.option(...)` lines:
  ```ts
  .option('--accent-color <color>', 'Accent color (CSS color or hex, e.g. #3DD73D)')
  .option('--text-color <color>', 'Text color for the overlay (default: white)')
  .option('--timer-text-color <color>', 'Text color for the lap timer (default: white)')
  .option('--timer-bg-color <color>', 'Background color for the lap timer (default: #111111)')
  ```

- [ ] **Step 9: Remove the four fields from `RenderOpts`**

  Current `RenderOpts` (around line 134) includes:
  ```ts
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  ```

  Delete all four lines.

- [ ] **Step 10: Remove the dead `NAMED_COLORS`, `parseColor`, and `colorSwatch` helpers**

  Around lines 459–486, delete the entire block:
  ```ts
  // Named CSS colours → hex (covers the most likely values users would pass)
  const NAMED_COLORS: Record<string, string> = { ... }

  function parseColor(color: string): [number, number, number] | null { ... }

  function colorSwatch(color: string): string { ... }
  ```

- [ ] **Step 11: Verify CLI TypeScript**

  ```bash
  pnpm --filter cli exec tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 12: Verify renderer tests still pass (no regressions)**

  ```bash
  pnpm --filter renderer test
  ```

  Expected: 99 tests pass.

- [ ] **Step 13: Commit**

  ```bash
  git add apps/cli/src/index.ts
  git commit -m "feat(cli): remove styling flags, thread styling object through to OverlayProps"
  ```

---

## Chunk 4: Style components

### Task 4: Update Banner style

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`

- [ ] **Step 1: Update the `Banner` destructure — replace four flat colour fields with `styling`**

  Current destructure (line ~19):
  ```ts
  export const Banner: React.FC<OverlayProps> = ({
    segments, fps, startingGridPosition,
    accentColor, textColor, timerTextColor, timerBgColor, labelWindowSeconds,
    qualifyingTablePosition,
  }) => {
  ```

  Replace with:
  ```ts
  export const Banner: React.FC<OverlayProps> = ({
    segments, fps, startingGridPosition,
    styling, labelWindowSeconds,
    qualifyingTablePosition,
  }) => {
  ```

- [ ] **Step 2: Update the `accent` and `text` derived variables**

  Current (around line 40):
  ```ts
  const accent = accentColor ?? DEFAULT_ACCENT
  const text = textColor ?? 'white'
  ```

  Replace with:
  ```ts
  const accent = styling?.accentColor ?? DEFAULT_ACCENT
  const text = styling?.textColor ?? 'white'
  ```

- [ ] **Step 3: Update the two `<LapTimerTrap />` calls — replace direct props with `styling.banner.*`**

  There are two `<LapTimerTrap />` calls in the component. Each has `textColor` and `bgColor` props fed from the old flat variables. Find each one and update:

  ```tsx
  // Before:
  textColor={timerTextColor ?? text}
  bgColor={timerBgColor}

  // After:
  textColor={styling?.banner?.timerTextColor ?? text}
  bgColor={styling?.banner?.timerBgColor}
  ```

- [ ] **Step 4: Update the two `<LeaderboardTable />` calls — add `leaderboardStyling`**

  Both `<LeaderboardTable />` calls in `Banner` (one in the qual/practice branch, one in the race branch) currently pass `accentColor={accent}`. Add `leaderboardStyling={styling?.leaderboard}` to each:

  ```tsx
  // Before (each call):
  accentColor={accent}

  // After (each call):
  accentColor={accent}
  leaderboardStyling={styling?.leaderboard}
  ```

- [ ] **Step 5: Verify renderer TypeScript and tests**

  ```bash
  pnpm --filter renderer build
  pnpm --filter renderer test
  ```

  Expected: TypeScript clean, 99 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/renderer/src/styles/banner/index.tsx
  git commit -m "feat(renderer): update Banner to read colours from styling object"
  ```

### Task 5: Update Esports, Minimal, and Modern styles

**Files:**
- Modify: `apps/renderer/src/styles/esports/index.tsx`
- Modify: `apps/renderer/src/styles/minimal/index.tsx`
- Modify: `apps/renderer/src/styles/modern/index.tsx`

For each of the three files, the changes are identical in structure:

- [ ] **Step 1: Add `styling` to the component destructure**

  Each component has a slightly different destructure. Update each one individually:

  **Esports** (line 88):
  ```ts
  // Before:
  export const Esports: React.FC<OverlayProps> = ({ segments, fps, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  // After:
  export const Esports: React.FC<OverlayProps> = ({ segments, fps, styling, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  ```

  **Minimal** (line 48):
  ```ts
  // Before:
  export const Minimal: React.FC<OverlayProps> = ({ segments, fps, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  // After:
  export const Minimal: React.FC<OverlayProps> = ({ segments, fps, styling, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  ```

  **Modern** (line 13) — note: `Modern` does **not** have a `boxPosition` parameter:
  ```ts
  // Before:
  export const Modern: React.FC<OverlayProps> = ({ segments, fps, labelWindowSeconds, qualifyingTablePosition }) => {
  // After:
  export const Modern: React.FC<OverlayProps> = ({ segments, fps, styling, labelWindowSeconds, qualifyingTablePosition }) => {
  ```

- [ ] **Step 2: Update the `<LeaderboardTable />` call in each file**

  Each currently passes `accentColor={undefined}`. Replace that argument with `leaderboardStyling={styling?.leaderboard}` (remove `accentColor={undefined}` entirely, since omitting the prop lets the component fall back to its own default):

  ```tsx
  // Before:
  <LeaderboardTable
    ...
    accentColor={undefined}
    ...
  />

  // After:
  <LeaderboardTable
    ...
    leaderboardStyling={styling?.leaderboard}
    ...
  />
  ```

- [ ] **Step 3: Verify renderer TypeScript and tests**

  ```bash
  pnpm --filter renderer build
  pnpm --filter renderer test
  ```

  Expected: TypeScript clean, 99 tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/renderer/src/styles/esports/index.tsx \
          apps/renderer/src/styles/minimal/index.tsx \
          apps/renderer/src/styles/modern/index.tsx
  git commit -m "feat(renderer): pass leaderboardStyling to LeaderboardTable in esports/minimal/modern"
  ```

---

## Final verification

- [ ] **Full build passes**

  ```bash
  pnpm build
  ```

  Expected: all packages compile without errors.

- [ ] **All tests pass**

  ```bash
  pnpm --filter renderer test
  ```

  Expected: 99 tests in 5 files pass.

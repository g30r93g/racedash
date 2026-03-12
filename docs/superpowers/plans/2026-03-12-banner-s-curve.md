# Banner S-Curve Shape Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the banner's flat-coloured background with an SVG shape where the dark center timer section has S-curved sides, giving the banner an elongated-S profile along its bottom edge.

**Architecture:** A new pure-function `buildBannerPath` computes the SVG `d` string from scaled geometry values; a thin `BannerBackground` React component wraps it into an `<svg>`; `Banner/index.tsx` is updated to use `BannerBackground` in place of the existing `bgStyle` div and `EndCaps`. The `BannerStyling` type gains one optional field (`sRise`).

**Tech Stack:** React, TypeScript, SVG (inline), Remotion (video config), Vitest (tests)

---

## Chunk 1: Type change and path builder

### Task 1: Add `sRise` to `BannerStyling`

**Files:**
- Modify: `packages/core/src/index.ts:84-94`

- [ ] **Step 1: Add the field**

In `packages/core/src/index.ts`, inside the `BannerStyling` interface (after the `flashDuration` line), add:

```ts
  sRise?: number           // dark center rise above banner bottom in ref px (default: 18)
```

The full interface should now read:

```ts
export interface BannerStyling {
  bgColor?: string         // banner background color        (default: inherits OverlayStyling.accentColor)
  bgOpacity?: number       // banner background opacity      (default: 0.82)
  borderRadius?: number    // outer border radius in ref px  (default: 10)
  timerTextColor?: string  // lap timer text color           (default: white)
  timerBgColor?: string    // lap timer background           (default: #111111)
  lapColorPurple?: string  // personal best lap flash color  (default: rgba(107,33,168,0.95))
  lapColorGreen?: string   // session best lap flash color   (default: rgba(21,128,61,0.95))
  lapColorRed?: string     // slower lap flash color         (default: rgba(185,28,28,0.95))
  flashDuration?: number   // lap color flash duration in s  (default: 2)
  sRise?: number           // dark center rise above banner bottom in ref px (default: 18)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/g30r93g/Projects/racedash && npx turbo build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add sRise to BannerStyling interface"
```

---

### Task 2: Implement and test the SVG path builder

**Files:**
- Create: `apps/renderer/src/styles/banner/buildBannerPath.ts`
- Create: `apps/renderer/src/styles/banner/buildBannerPath.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/renderer/src/styles/banner/buildBannerPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBannerPath } from './buildBannerPath'

describe('buildBannerPath', () => {
  it('returns a non-empty string', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    expect(typeof d).toBe('string')
    expect(d.length).toBeGreaterThan(0)
  })

  it('starts with M and ends with Z', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    expect(d.trimStart().startsWith('M')).toBe(true)
    expect(d.trimEnd().endsWith('Z')).toBe(true)
  })

  it('path starts at centerStart, 0', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    // First move command should be to (centerStart, 0)
    expect(d).toMatch(/^M\s*810\s+0/)
  })

  it('path contains the flat bottom line at H - rise', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    const bottomY = 80 - 18 // = 62
    expect(d).toContain(`${bottomY}`)
  })

  it('clamps curveInset when centerStart is very small', () => {
    // centerStart = 10 — curveInset must not go below 0
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 10, centerEnd: 1910, rise: 18 })
    expect(typeof d).toBe('string')
    expect(d.length).toBeGreaterThan(0)
    // The bottom-left anchor x must be >= 0
    expect(d).not.toMatch(/C\s*-/)
  })

  it('produces different paths for different rise values', () => {
    const d1 = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 10 })
    const d2 = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 30 })
    expect(d1).not.toBe(d2)
  })

  it('centerStart === 0 and centerEnd === width produces a full-width dark rect path', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 0, centerEnd: 1920, rise: 18 })
    expect(typeof d).toBe('string')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/renderer && npx vitest run src/styles/banner/buildBannerPath.test.ts 2>&1
```

Expected: FAIL — `buildBannerPath` is not defined / module not found.

- [ ] **Step 3: Implement `buildBannerPath`**

Create `apps/renderer/src/styles/banner/buildBannerPath.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/renderer && npx vitest run src/styles/banner/buildBannerPath.test.ts 2>&1
```

Expected: all 7 tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd /Users/g30r93g/Projects/racedash && npx turbo test 2>&1 | tail -15
```

Expected: all existing tests continue to pass, plus 7 new tests from `buildBannerPath.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/styles/banner/buildBannerPath.ts \
        apps/renderer/src/styles/banner/buildBannerPath.test.ts
git commit -m "feat(renderer): add buildBannerPath pure function with tests"
```

---

## Chunk 2: BannerBackground component and Banner integration

### Task 3: Create `BannerBackground` component

**Files:**
- Create: `apps/renderer/src/styles/banner/BannerBackground.tsx`

`BannerBackground` is a pure presentational component — all geometry arrives via props. It does **not** call `useVideoConfig`.

- [ ] **Step 1: Create the component**

Create `apps/renderer/src/styles/banner/BannerBackground.tsx`:

```tsx
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

  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0 }}
    >
      <rect x={0} y={0} width={width} height={height} fill={accentColor} opacity={accentOpacity} />
      <path d={d} fill={darkColor} />
    </svg>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/g30r93g/Projects/racedash && npx turbo build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/styles/banner/BannerBackground.tsx
git commit -m "feat(renderer): add BannerBackground SVG component"
```

---

### Task 4: Wire `BannerBackground` into `Banner/index.tsx`

**Files:**
- Modify: `apps/renderer/src/styles/banner/index.tsx`

- [ ] **Step 1: Add the import**

At the top of `apps/renderer/src/styles/banner/index.tsx`, add:

```ts
import { BannerBackground } from './BannerBackground'
```

- [ ] **Step 2: Update `outerStyle`**

Replace:

```ts
const outerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  borderRadius: bannerRadius,
  overflow: 'hidden',
}
```

With:

```ts
const bannerHeight = 80 * scale

const outerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: bannerHeight,
  borderBottomLeftRadius: bannerRadius,
  borderBottomRightRadius: bannerRadius,
  overflow: 'hidden',
}
```

- [ ] **Step 3: Compute shared boundary values**

Add these computed values after the `outerStyle` block (before the `bgStyle` block):

```ts
const timeLabelPanelWidth = Math.max(0, (width - 180 * scale - 180 * scale - 300 * scale) / 2)
const centerStart = 180 * scale + timeLabelPanelWidth
const centerEnd = width - 180 * scale - timeLabelPanelWidth
const sRise = (styling?.banner?.sRise ?? 18) * scale
```

- [ ] **Step 4: Remove `bgStyle`, `wrapperStyle` opacity, and `EndCaps`**

Remove the entire `bgStyle` object:

```ts
// DELETE this block:
const bgStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: bannerBg,
  opacity: bannerOpacity,
}
```

Remove the `EndCaps` constant and the `capSize` variable that only exists to support it:

```ts
// DELETE this block:
const capSize = 36 * scale
const EndCaps = (
  <>
    <div style={{ position: 'absolute', bottom: 0, left: 0, width: capSize, height: capSize, background: timerBackground, borderTopRightRadius: capSize }} />
    <div style={{ position: 'absolute', bottom: 0, right: 0, width: capSize, height: capSize, background: timerBackground, borderTopLeftRadius: capSize }} />
  </>
)
```

- [ ] **Step 5: Replace background div + EndCaps in both JSX branches**

In the `showTimePanels` branch, replace:

```tsx
<div style={outerStyle}>
  <div style={bgStyle} />
  {EndCaps}
  <div style={wrapperStyle}>
```

With:

```tsx
<div style={outerStyle}>
  <BannerBackground
    width={width}
    height={bannerHeight}
    accentColor={bannerBg}
    accentOpacity={bannerOpacity}
    darkColor={timerBackground}
    rise={sRise}
    centerStart={centerStart}
    centerEnd={centerEnd}
  />
  <div style={wrapperStyle}>
```

In the race layout branch, replace:

```tsx
<div style={outerStyle}>
  <div style={bgStyle} />
  {EndCaps}
  <div style={wrapperStyle}>
```

With:

```tsx
<div style={outerStyle}>
  <BannerBackground
    width={width}
    height={bannerHeight}
    accentColor={bannerBg}
    accentOpacity={bannerOpacity}
    darkColor={timerBackground}
    rise={sRise}
    centerStart={centerStart}
    centerEnd={centerEnd}
  />
  <div style={wrapperStyle}>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/g30r93g/Projects/racedash && npx turbo build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 7: Run full test suite**

```bash
cd /Users/g30r93g/Projects/racedash && npx turbo test 2>&1 | tail -15
```

Expected: all 112 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/renderer/src/styles/banner/index.tsx
git commit -m "feat(renderer): apply BannerBackground S-curve shape to banner overlay"
```

---

## Final verification

- [ ] Open Remotion preview and confirm:
  - Banner has sharp top-left and top-right corners
  - Center dark section has smooth S-curved transitions to green outer sections
  - Bottom of center section sits ~18px above the banner's bottom edge
  - Flash colours (purple/green/red) still appear correctly on the center section when a lap completes
  - Both race and practice/qualifying layouts render correctly

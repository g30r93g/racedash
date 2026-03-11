# Race Leaderboard Lap Data Pivot — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the timing-derived race leaderboard with authoritative lap-by-lap snapshots from the Alpha Timing `/replay` endpoint, fixing incorrect orderings caused by spin-penalty laps.

**Architecture:** Parse `lapData` JSON from the replay page in the scraper; build video-timestamped `RaceLapSnapshot[]` in the CLI; thread snapshots through `SessionSegment` → `LeaderboardTable` → `buildLeaderboard`, which picks the applicable snapshot at each video frame. Qualifying/practice and `PositionCounter` are untouched.

**Tech Stack:** TypeScript, Bun, Vitest, Remotion, cheerio (scraper), commander (CLI).

**Spec:** `docs/superpowers/specs/2026-03-11-race-leaderboard-lap-data-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `packages/core/src/index.ts` | Add `RaceLapEntry`, `RaceLapSnapshot` types; update `SessionSegment` |
| Modify | `packages/scraper/src/index.ts` | Add `fetchReplayHtml`, `parseReplayLapData`, `ReplayLapEntry`, `ReplayLapData` |
| Create | `packages/scraper/src/__fixtures__/replay_sample.html` | Minimal lapData fixture for scraper tests |
| Modify | `packages/scraper/src/index.test.ts` | Tests for `parseReplayLapData` |
| Modify | `apps/cli/src/index.ts` | Add replay fetch, `buildRaceLapSnapshots`, attach snapshots to segment |
| Modify | `apps/renderer/src/leaderboard.ts` | Add snapshot path to `buildLeaderboard` |
| Modify | `apps/renderer/src/leaderboard.test.ts` | Tests for snapshot path in `buildLeaderboard` |
| Modify | `apps/renderer/src/components/shared/LeaderboardTable.tsx` | Add `raceLapSnapshots` prop |
| Modify | `apps/renderer/src/styles/banner/index.tsx` | `livePosition` guard + `raceLapSnapshots` prop (2 call sites) |
| Modify | `apps/renderer/src/styles/esports/index.tsx` | `raceLapSnapshots` prop |
| Modify | `apps/renderer/src/styles/minimal/index.tsx` | `raceLapSnapshots` prop |
| Modify | `apps/renderer/src/styles/modern/index.tsx` | `raceLapSnapshots` prop |

---

## Chunk 1: Core Types + Scraper

### Task 1: Add core types

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Add `RaceLapEntry` and `RaceLapSnapshot` to `packages/core/src/index.ts`**, and add `raceLapSnapshots` to `SessionSegment`. Also update the `leaderboardDrivers` comment.

  Insert before `export type SessionMode` (i.e. after the closing `}` of `LeaderboardDriver` and the blank line that follows it):
  ```ts
  export interface RaceLapEntry {
    kart: string
    name: string
    position: number
    lapsCompleted: number
    gapToLeader: string      // verbatim from wire; "0.000", "1 L", "6 L" — reserved for future display use
    intervalToAhead: string  // "" for P1, otherwise unsigned decimal e.g. "0.333"
  }

  export interface RaceLapSnapshot {
    leaderLap: number        // 1-based (1 = after leader's first lap)
    videoTimestamp: number   // absolute seconds into video when this snapshot activates
    entries: RaceLapEntry[]  // ordered P1 → last place
  }
  ```

  In `SessionSegment`, add after `leaderboardDrivers`:
  ```ts
  raceLapSnapshots?: RaceLapSnapshot[]
  ```

  Update the `leaderboardDrivers` comment from:
  ```ts
  leaderboardDrivers?: LeaderboardDriver[]  // drives QualifyingTable; populated for qualifying + practice
  ```
  to:
  ```ts
  leaderboardDrivers?: LeaderboardDriver[]  // populated for all modes; used by PositionCounter (all modes) and LeaderboardTable (qualifying + practice only)
  ```

- [ ] **Verify TypeScript compiles** — run `bun run build` from the repo root; expect success with no errors related to the new types.

- [ ] **Commit**
  ```bash
  git add packages/core/src/index.ts
  git commit -m "feat(core): add RaceLapEntry, RaceLapSnapshot types and SessionSegment.raceLapSnapshots"
  ```

---

### Task 2: Create scraper fixture

**Files:**
- Create: `packages/scraper/src/__fixtures__/replay_sample.html`

The fixture contains 2 snapshots. Snapshot 0 is pre-race (lapsCompleted=0). Snapshot 1 has 3 drivers: P1 (kart 71, 1 lap), P2 (kart 89, 1 lap, 0.099s behind), P3 (kart 47, 0 laps — lapped by 1).

- [ ] **Create `packages/scraper/src/__fixtures__/replay_sample.html`**:
  ```html
  <html>
  <body>
  <script type="application/json" id="lapData">
  {
    "laps": [
      [
        {"C":1,"D":[["=",""],["1",""],["71",""],["Royal Holloway A",""],["0",""],["0.000",""],["0.000",""],["0.000",""],["0.000",""],["",""],["",""]]},
        {"C":2,"D":[["=",""],["2",""],["89",""],["Birmingham C",""],["0",""],["0.044",""],["0.044",""],["0.044",""],["0.044",""],["0.044",""],["",""]]}
      ],
      [
        {"C":1,"D":[["=",""],["1",""],["71",""],["Royal Holloway A",""],["1",""],["1:09.707",""],["1:09.707",""],["1:09.707",""],["0.000",""],["",""],["",""]]},
        {"C":2,"D":[["=",""],["2",""],["89",""],["Birmingham C",""],["1",""],["1:09.806",""],["1:09.762",""],["1:09.762",""],["0.099",""],["0.099",""],["",""]]},
        {"C":3,"D":[["=",""],["3",""],["47",""],["Penalized A",""],["0",""],["1:12.000",""],["1:12.000",""],["1:12.000",""],["1 L",""],["5.200",""],["",""]]}
      ]
    ]
  }
  </script>
  </body>
  </html>
  ```

- [ ] **No commit needed** — will be committed with scraper tests in Task 4.

---

### Task 3: Write failing scraper tests

**Files:**
- Modify: `packages/scraper/src/index.test.ts`

- [ ] **Extend the existing import** at the top of the test file (line 4):
  ```ts
  import { parseDrivers, parseGrid, parseReplayLapData } from './index'
  ```

- [ ] **Add the test suite** at the bottom of `packages/scraper/src/index.test.ts`:
  ```ts
  const replayHtml = readFileSync(
    join(__dirname, '__fixtures__/replay_sample.html'),
    'utf8',
  )

  describe('parseReplayLapData', () => {
    it('returns an array with 2 snapshots (index 0 = pre-race preserved)', () => {
      const data = parseReplayLapData(replayHtml)
      expect(data).toHaveLength(2)
    })

    it('snapshot 0 has 2 entries with lapsCompleted=0', () => {
      const [snap0] = parseReplayLapData(replayHtml)
      expect(snap0).toHaveLength(2)
      expect(snap0[0].lapsCompleted).toBe(0)
      expect(snap0[1].lapsCompleted).toBe(0)
    })

    it('snapshot 1 maps all fields correctly for P1', () => {
      const [, snap1] = parseReplayLapData(replayHtml)
      const p1 = snap1[0]
      expect(p1.driverId).toBe(1)
      expect(p1.position).toBe(1)
      expect(p1.kart).toBe('71')
      expect(p1.name).toBe('Royal Holloway A')
      expect(p1.lapsCompleted).toBe(1)
      expect(p1.totalSeconds).toBeCloseTo(69.707)
      expect(p1.gapToLeader).toBe('0.000')
      expect(p1.intervalToAhead).toBe('')
    })

    it('snapshot 1 maps P2 interval correctly', () => {
      const [, snap1] = parseReplayLapData(replayHtml)
      expect(snap1[1].intervalToAhead).toBe('0.099')
      expect(snap1[1].gapToLeader).toBe('0.099')
    })

    it('snapshot 1 maps P3 (lapped driver) correctly', () => {
      const [, snap1] = parseReplayLapData(replayHtml)
      const p3 = snap1[2]
      expect(p3.position).toBe(3)
      expect(p3.lapsCompleted).toBe(0)
      expect(p3.gapToLeader).toBe('1 L')
      expect(p3.intervalToAhead).toBe('5.200')
    })

    it('totalSeconds is null for empty totalTime string', () => {
      const html = replayHtml.replace('"1:09.707"', '""')
      const [, snap1] = parseReplayLapData(html)
      expect(snap1[0].totalSeconds).toBeNull()
    })

    it('totalSeconds is null for non-empty string without a colon', () => {
      const html = replayHtml.replace('"1:09.707"', '"69707"')
      const [, snap1] = parseReplayLapData(html)
      expect(snap1[0].totalSeconds).toBeNull()
    })

    it('returns [] when laps array is empty', () => {
      const html = '<html><body><script type="application/json" id="lapData">{"laps":[]}</script></body></html>'
      expect(parseReplayLapData(html)).toEqual([])
    })

    it('throws when lapData script tag is absent', () => {
      expect(() => parseReplayLapData('<html></html>')).toThrow()
    })

    it('throws when JSON lacks a laps array', () => {
      const html = '<html><body><script type="application/json" id="lapData">{"notLaps":[]}</script></body></html>'
      expect(() => parseReplayLapData(html)).toThrow()
    })
  })
  ```

- [ ] **Run tests to confirm they fail**:
  ```bash
  cd /path/to/racedash
  bun test packages/scraper/src/index.test.ts
  ```
  Expected: failures like `parseReplayLapData is not a function`.

---

### Task 4: Implement scraper functions

**Files:**
- Modify: `packages/scraper/src/index.ts`

- [ ] **Add the exported types** near the top of `packages/scraper/src/index.ts` (after the existing imports and `DriverRow`/`GridEntry` interfaces):
  ```ts
  export interface ReplayLapEntry {
    driverId: number
    position: number
    kart: string
    name: string
    lapsCompleted: number
    totalSeconds: number | null  // null if parseLapTimeStr returns null for D[5][0]
    gapToLeader: string          // verbatim from D[8][0]
    intervalToAhead: string      // unsigned decimal or "" for P1; from D[9][0]
  }

  // Index 0 = pre-race; index N (N ≥ 1) = after leader's Nth lap
  export type ReplayLapData = ReplayLapEntry[][]
  ```

- [ ] **Add `fetchReplayHtml`** after the existing `fetchGridHtml` function:
  ```ts
  export async function fetchReplayHtml(url: string): Promise<string> {
    return fetchTab(url, '/replay')
  }
  ```

- [ ] **Add `parseReplayLapData`** after `parseGrid`:
  ```ts
  export function parseReplayLapData(html: string): ReplayLapData {
    const $ = cheerio.load(html)
    const tag = $('script[type="application/json"]#lapData')
    if (!tag.length) throw new Error('Could not find lapData script tag in HTML')

    const raw = JSON.parse(tag.text())
    if (!Array.isArray(raw.laps)) throw new Error('lapData JSON is missing a "laps" array')

    return (raw.laps as unknown[][]).map(snapshot =>
      (snapshot as Array<{ C: number; D: [string, string][] }>).map(entry => ({
        driverId: entry.C,
        position: parseInt(entry.D[1][0], 10),
        kart: entry.D[2][0],
        name: entry.D[3][0],
        lapsCompleted: parseInt(entry.D[4][0], 10),
        totalSeconds: parseLapTimeStr(entry.D[5][0]),
        gapToLeader: entry.D[8][0],
        intervalToAhead: entry.D[9][0],
      })),
    )
  }
  ```

- [ ] **Run scraper tests to confirm they pass**:
  ```bash
  bun test packages/scraper/src/index.test.ts
  ```
  Expected: all tests pass.

- [ ] **Commit**:
  ```bash
  git add packages/scraper/src/index.ts packages/scraper/src/index.test.ts packages/scraper/src/__fixtures__/replay_sample.html
  git commit -m "feat(scraper): add fetchReplayHtml and parseReplayLapData"
  ```

---

## Chunk 2: Renderer — Snapshot Path in `buildLeaderboard`

### Task 5: Write failing renderer tests for snapshot path

**Files:**
- Modify: `apps/renderer/src/leaderboard.test.ts`

- [ ] **Add import for `RaceLapSnapshot`** at the top of `apps/renderer/src/leaderboard.test.ts`:
  ```ts
  import type { RaceLapSnapshot } from '@racedash/core'
  ```

- [ ] **Add helper function** before the existing test suites:
  ```ts
  function makeSnapshot(
    videoTimestamp: number,
    entries: Array<{ kart: string; name?: string; position: number; lapsCompleted: number; intervalToAhead: string; gapToLeader?: string }>,
  ): RaceLapSnapshot {
    return {
      leaderLap: 1,
      videoTimestamp,
      entries: entries.map(e => ({
        kart: e.kart,
        name: e.name ?? `Driver ${e.kart}`,
        position: e.position,
        lapsCompleted: e.lapsCompleted,
        gapToLeader: e.gapToLeader ?? '0.000',
        intervalToAhead: e.intervalToAhead,
      })),
    }
  }
  ```

- [ ] **Add the snapshot test suite** at the bottom of `apps/renderer/src/leaderboard.test.ts`:
  ```ts
  describe('buildLeaderboard (race mode, raceLapSnapshots)', () => {
    const snap1 = makeSnapshot(70, [
      { kart: '71', position: 1, lapsCompleted: 1, intervalToAhead: '' },
      { kart: '89', position: 2, lapsCompleted: 1, intervalToAhead: '0.099' },
      { kart: '47', position: 3, lapsCompleted: 0, intervalToAhead: '5.200', gapToLeader: '1 L' },
    ])
    const snap2 = makeSnapshot(140, [
      { kart: '71', position: 1, lapsCompleted: 2, intervalToAhead: '' },
      { kart: '89', position: 2, lapsCompleted: 2, intervalToAhead: '0.210' },
      { kart: '47', position: 3, lapsCompleted: 1, intervalToAhead: '3.100', gapToLeader: '1 L' },
    ])
    const snapshots = [snap1, snap2]

    it('returns [] before first snapshot (currentTime < videoTimestamp)', () => {
      const lb = buildLeaderboard([], 0, 'race', undefined, snapshots)
      expect(lb).toEqual([])
    })

    it('selects first snapshot at exact videoTimestamp boundary (inclusive)', () => {
      const lb = buildLeaderboard([], 70, 'race', undefined, snapshots)
      expect(lb).toHaveLength(3)
      expect(lb[0].kart).toBe('71')
    })

    it('selects first snapshot before second (currentTime=100)', () => {
      const lb = buildLeaderboard([], 100, 'race', undefined, snapshots)
      expect(lb[1].kart).toBe('89')
      expect(lb[1].lapsCompleted).toBe(1)
    })

    it('selects second snapshot at its boundary (currentTime=140)', () => {
      const lb = buildLeaderboard([], 140, 'race', undefined, snapshots)
      expect(lb[1].lapsCompleted).toBe(2)
    })

    it('P1 interval is null', () => {
      const lb = buildLeaderboard([], 70, 'race', undefined, snapshots)
      expect(lb[0].interval).toBeNull()
    })

    it('same-lap interval gets "+" prefix', () => {
      const lb = buildLeaderboard([], 70, 'race', undefined, snapshots)
      expect(lb[1].interval).toBe('+0.099')
    })

    it('lapped driver shows "+1L"', () => {
      const lb = buildLeaderboard([], 70, 'race', undefined, snapshots)
      expect(lb[2].interval).toBe('+1L')
    })

    it('lapped by multiple shows "+NL"', () => {
      const snap = makeSnapshot(70, [
        { kart: '1', position: 1, lapsCompleted: 5, intervalToAhead: '' },
        { kart: '2', position: 2, lapsCompleted: 2, intervalToAhead: '3.000', gapToLeader: '3 L' },
      ])
      const lb = buildLeaderboard([], 70, 'race', undefined, [snap])
      expect(lb[1].interval).toBe('+3L')
    })

    it('malformed intervalToAhead (empty, non-P1) falls back to "+0.000"', () => {
      const snap = makeSnapshot(70, [
        { kart: '1', position: 1, lapsCompleted: 1, intervalToAhead: '' },
        { kart: '2', position: 2, lapsCompleted: 1, intervalToAhead: '' },
      ])
      const lb = buildLeaderboard([], 70, 'race', undefined, [snap])
      expect(lb[1].interval).toBe('+0.000')
    })

    it('positions come from snapshot, ourKart has no effect on ordering', () => {
      const lb = buildLeaderboard([], 70, 'race', '89', snapshots)
      expect(lb[0].kart).toBe('71')
      expect(lb[1].kart).toBe('89')
    })

    it('assigns correct 1-indexed positions from snapshot', () => {
      const lb = buildLeaderboard([], 70, 'race', undefined, snapshots)
      expect(lb.map(d => d.position)).toEqual([1, 2, 3])
    })

    it('raceLapSnapshots: [] returns [] without fallback', () => {
      // Passing drivers with completed laps to confirm fallback is NOT used
      const lb = buildLeaderboard(DRIVERS, 200, 'race', undefined, [])
      expect(lb).toEqual([])
    })

    it('raceLapSnapshots: undefined falls back to timing path', () => {
      // At t=200, all DRIVERS have completed laps — timing path should return results
      const lb = buildLeaderboard(DRIVERS, 200, 'race', undefined, undefined)
      expect(lb.length).toBeGreaterThan(0)
    })
  })
  ```

- [ ] **Run tests to confirm they fail**:
  ```bash
  bun test apps/renderer/src/leaderboard.test.ts
  ```
  Expected: TypeScript compile errors on the 5-arg `buildLeaderboard` calls (the 5th parameter does not exist yet). This is the expected pre-implementation failure.

---

### Task 6: Implement snapshot path in `buildLeaderboard`

**Files:**
- Modify: `apps/renderer/src/leaderboard.ts`

- [ ] **Add `RaceLapSnapshot` to the import** at the top of `apps/renderer/src/leaderboard.ts`:
  ```ts
  import type { LeaderboardDriver, RaceLapSnapshot } from '@racedash/core'
  ```

- [ ] **Update `buildLeaderboard` signature** to accept the optional 5th parameter:
  ```ts
  export function buildLeaderboard(
    drivers: LeaderboardDriver[],
    currentTime: number,
    mode: LeaderboardMode,
    ourKart?: string,
    raceLapSnapshots?: RaceLapSnapshot[],
  ): RankedDriver[] {
    if (mode === 'race') return buildRaceLeaderboard(drivers, currentTime, ourKart, raceLapSnapshots)
    // ... rest unchanged
  ```

- [ ] **Update `buildRaceLeaderboard` signature** to accept snapshots, and add the snapshot branch at the top:
  ```ts
  function buildRaceLeaderboard(
    drivers: LeaderboardDriver[],
    currentTime: number,
    ourKart?: string,
    raceLapSnapshots?: RaceLapSnapshot[],
  ): RankedDriver[] {
    // Snapshot path
    if (raceLapSnapshots !== undefined) {
      return buildRaceLeaderboardFromSnapshots(raceLapSnapshots, currentTime)
    }
    // ... existing timing-based implementation unchanged
  ```

- [ ] **Add `buildRaceLeaderboardFromSnapshots`** as a new private function at the bottom of `apps/renderer/src/leaderboard.ts`:
  ```ts
  function buildRaceLeaderboardFromSnapshots(
    snapshots: RaceLapSnapshot[],
    currentTime: number,
  ): RankedDriver[] {
    // Find last snapshot where videoTimestamp <= currentTime
    let active: RaceLapSnapshot | undefined
    for (const snap of snapshots) {
      if (snap.videoTimestamp <= currentTime) active = snap
    }
    if (!active) return []

    const { entries } = active
    return entries.map((entry, i) => {
      let interval: string | null
      if (entry.position === 1) {
        interval = null
      } else {
        const ahead = entries[i - 1]
        const lapDiff = ahead.lapsCompleted - entry.lapsCompleted
        if (lapDiff > 0) {
          interval = `+${lapDiff}L`
        } else if (lapDiff < 0) {
          // Impossible in well-formed data (entry has more laps than car ahead); defensive fallback
          interval = '+0.000'
        } else if (entry.intervalToAhead === '') {
          interval = '+0.000'
        } else {
          interval = `+${entry.intervalToAhead}`
        }
      }
      return {
        kart: entry.kart,
        name: entry.name,
        timestamps: [],
        position: entry.position,
        best: Infinity,
        lapsCompleted: entry.lapsCompleted,
        cumulativeTime: 0,
        interval,
      }
    })
  }
  ```

- [ ] **Run tests to confirm they pass**:
  ```bash
  bun test apps/renderer/src/leaderboard.test.ts
  ```
  Expected: all tests pass including existing suites.

- [ ] **Commit**:
  ```bash
  git add apps/renderer/src/leaderboard.ts apps/renderer/src/leaderboard.test.ts
  git commit -m "feat(renderer): add snapshot path to buildLeaderboard for race mode"
  ```

---

## Chunk 3: CLI + Renderer Wiring

### Task 7: Unit-test `buildRaceLapSnapshots`

**Files:**
- Create: `apps/cli/src/index.test.ts`

`buildRaceLapSnapshots` will be exported from `apps/cli/src/index.ts` (added in Task 8). Write the test file first; it will fail with an import error until Task 8 is complete. That is the expected TDD red step.

- [ ] **Create `apps/cli/src/index.test.ts`**:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { buildRaceLapSnapshots } from './index'
  import type { ReplayLapData } from '@racedash/scraper'

  describe('buildRaceLapSnapshots', () => {
    const replayData: ReplayLapData = [
      // snapshot 0 (pre-race) — skipped
      [
        { driverId: 1, position: 1, kart: '71', name: 'Driver A', lapsCompleted: 0, totalSeconds: null, gapToLeader: '0.000', intervalToAhead: '' },
      ],
      // snapshot 1 — P1 has valid totalSeconds
      [
        { driverId: 1, position: 1, kart: '71', name: 'Driver A', lapsCompleted: 1, totalSeconds: 69.707, gapToLeader: '0.000', intervalToAhead: '' },
        { driverId: 2, position: 2, kart: '89', name: 'Driver B', lapsCompleted: 1, totalSeconds: 69.806, gapToLeader: '0.099', intervalToAhead: '0.099' },
      ],
      // snapshot 2 — P1 has null totalSeconds (malformed) — should be skipped
      [
        { driverId: 1, position: 1, kart: '71', name: 'Driver A', lapsCompleted: 2, totalSeconds: null, gapToLeader: '0.000', intervalToAhead: '' },
      ],
    ]

    it('skips snapshot 0 (pre-race): no entry with leaderLap=0 in result', () => {
      const result = buildRaceLapSnapshots(replayData, 0)
      expect(result.find(s => s.leaderLap === 0)).toBeUndefined()
    })

    it('computes videoTimestamp = offsetSeconds + P1 totalSeconds', () => {
      const result = buildRaceLapSnapshots(replayData, 100)
      expect(result[0].videoTimestamp).toBeCloseTo(100 + 69.707)
    })

    it('skips snapshot where P1 totalSeconds is null', () => {
      const result = buildRaceLapSnapshots(replayData, 0)
      // snapshot 2 (leaderLap=2) should be absent
      expect(result).toHaveLength(1)
      expect(result[0].leaderLap).toBe(1)
    })

    it('returns [] when all snapshots have null P1 totalSeconds', () => {
      const allNull: ReplayLapData = [
        [{ driverId: 1, position: 1, kart: '1', name: 'A', lapsCompleted: 0, totalSeconds: null, gapToLeader: '0.000', intervalToAhead: '' }],
        [{ driverId: 1, position: 1, kart: '1', name: 'A', lapsCompleted: 1, totalSeconds: null, gapToLeader: '0.000', intervalToAhead: '' }],
      ]
      expect(buildRaceLapSnapshots(allNull, 0)).toEqual([])
    })

    it('maps RaceLapEntry fields correctly (omits totalSeconds and driverId)', () => {
      const result = buildRaceLapSnapshots(replayData, 0)
      const entry = result[0].entries[1]
      expect(entry).toEqual({
        kart: '89',
        name: 'Driver B',
        position: 2,
        lapsCompleted: 1,
        gapToLeader: '0.099',
        intervalToAhead: '0.099',
      })
      expect('totalSeconds' in entry).toBe(false)
      expect('driverId' in entry).toBe(false)
    })
  })
  ```

- [ ] **Run tests to confirm they fail** (function not yet exported or implemented):
  ```bash
  bun test apps/cli/src/index.test.ts
  ```
  Expected: import/compile error — `buildRaceLapSnapshots` does not exist yet. This is correct TDD red.

---

### Task 8: Implement `buildRaceLapSnapshots` in CLI

**Files:**
- Modify: `apps/cli/src/index.ts`

- [ ] **Update imports** at the top of `apps/cli/src/index.ts`:
  - In the `@racedash/scraper` import, add `fetchReplayHtml` and `parseReplayLapData`
  - Add a type-only import: `import type { ReplayLapData } from '@racedash/scraper'`
  - In the `@racedash/core` import, add `RaceLapEntry` and `RaceLapSnapshot`

- [ ] **Add `export function buildRaceLapSnapshots`** after the existing `buildLeaderboardDrivers` function (around line 55):
  ```ts
  export function buildRaceLapSnapshots(
    replayData: ReplayLapData,
    offsetSeconds: number,
  ): RaceLapSnapshot[] {
    const result: RaceLapSnapshot[] = []
    for (let i = 1; i < replayData.length; i++) {
      const snapshot = replayData[i]
      const p1 = snapshot.find(e => e.position === 1)
      if (!p1 || p1.totalSeconds === null) continue
      const videoTimestamp = offsetSeconds + p1.totalSeconds
      const entries: RaceLapEntry[] = snapshot.map(e => ({
        kart: e.kart,
        name: e.name,
        position: e.position,
        lapsCompleted: e.lapsCompleted,
        gapToLeader: e.gapToLeader,
        intervalToAhead: e.intervalToAhead,
      }))
      result.push({ leaderLap: i, videoTimestamp, entries })
    }
    return result
  }
  ```

- [ ] **Add replay to the parallel fetch block**. The current `Promise.all` spreads two arrays: `segmentConfigs.map(fetchHtml)` and `raceSegmentIndices.map(fetchGridHtml)`. Add a third spread that fetches-and-parses replay data for each race segment in one step (so that both fetch and parse errors reject the whole Promise.all per spec):

  ```ts
  const [[durationSeconds, videoResolution], fetchResults] = await Promise.all([
    Promise.all([getVideoDuration(videoPath), getVideoResolution(videoPath)]),
    Promise.all([
      ...segmentConfigs.map(sc => fetchHtml(sc.url)),
      ...raceSegmentIndices.map(i => fetchGridHtml(segmentConfigs[i].url)),
      ...raceSegmentIndices.map(i => fetchReplayHtml(segmentConfigs[i].url).then(parseReplayLapData)),
    ]),
  ])
  ```

  Then update the three result slices (replacing the existing two-slice block):
  ```ts
  const htmls      = fetchResults.slice(0, segmentConfigs.length)
  const gridHtmls  = fetchResults.slice(segmentConfigs.length, segmentConfigs.length + raceSegmentIndices.length)
  const replayData = fetchResults.slice(segmentConfigs.length + raceSegmentIndices.length) as ReplayLapData[]
  ```

- [ ] **Use the pre-parsed `replayData` in the segment loop**. Inside the `for (let i = 0; ...)` loop, after the existing `gridHtmls` block (~line 270), add:

  ```ts
  let raceLapSnapshots: RaceLapSnapshot[] | undefined
  if (mode === 'race') {
    const raceIdx = raceSegmentIndices.indexOf(i)
    if (raceIdx >= 0) {
      // offsetSeconds is snappedOffsets[i], already declared above in this loop iteration
      raceLapSnapshots = buildRaceLapSnapshots(replayData[raceIdx], offsetSeconds)
      if (raceLapSnapshots.length === 0) {
        process.stderr.write(`\n  ⚠  No valid lap snapshots found in replay for segment ${i + 1}\n`)
      }
    }
  }
  ```

- [ ] **Attach `raceLapSnapshots` to the segment push** (around line 292):
  ```ts
  segments.push({
    mode,
    session,
    sessionAllLaps: allDrivers.map(d => d.laps),
    leaderboardDrivers: mode === 'race'
      ? buildRaceDrivers(allDrivers, offsetSeconds)
      : buildLeaderboardDrivers(allDrivers, driver.kart, offsetSeconds),
    raceLapSnapshots,   // ← add this line
    label: sc.label,
  })
  ```

- [ ] **Run CLI unit tests to confirm they pass**:
  ```bash
  bun test apps/cli/src/index.test.ts
  ```
  Expected: all 5 `buildRaceLapSnapshots` tests pass.

- [ ] **Verify TypeScript compiles**:
  ```bash
  bun run build
  ```
  Expected: no errors.

- [ ] **Commit**:
  ```bash
  git add apps/cli/src/index.ts apps/cli/src/index.test.ts
  git commit -m "feat(cli): fetch replay, build RaceLapSnapshot[] and attach to race segments"
  ```

---

### Task 9: Wire `raceLapSnapshots` through the renderer

**Files:**
- Modify: `apps/renderer/src/components/shared/LeaderboardTable.tsx`
- Modify: `apps/renderer/src/styles/banner/index.tsx`
- Modify: `apps/renderer/src/styles/esports/index.tsx`
- Modify: `apps/renderer/src/styles/minimal/index.tsx`
- Modify: `apps/renderer/src/styles/modern/index.tsx`

- [ ] **Update `LeaderboardTable.tsx`** — add the `raceLapSnapshots` prop:

  Add to the import at the top:
  ```ts
  import type { BoxPosition, LeaderboardDriver, RaceLapSnapshot } from '@racedash/core'
  ```

  Add to `LeaderboardTableProps`:
  ```ts
  raceLapSnapshots?: RaceLapSnapshot[]
  ```

  Add to the destructured props in the function signature:
  ```ts
  export const LeaderboardTable = React.memo(function LeaderboardTable({
    leaderboardDrivers,
    ourKart,
    mode,
    fps,
    accentColor = '#3DD73D',
    position = 'bottom-right',
    anchorTop,
    raceLapSnapshots,  // ← add
  }: LeaderboardTableProps) {
  ```

  Update the `buildLeaderboard` call inside the memo:
  ```ts
  const leaderboard = useMemo(
    () => buildLeaderboard(leaderboardDrivers, currentTime, mode, ourKart, raceLapSnapshots),
    [leaderboardDrivers, currentTime, mode, ourKart, raceLapSnapshots],
  )
  ```

- [ ] **Update `banner/index.tsx`**:

  **Change 1 — `livePosition` guard** (around line 35-36). The current code is:
  ```ts
  const livePosition = useMemo<number | null>(() => {
    if (!showTable) return null
    const leaderboard = buildLeaderboard(segment.leaderboardDrivers!, currentTime, mode)
    return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
  }, [showTable, segment.leaderboardDrivers, currentTime, mode, session.driver.kart])
  ```
  Change only the guard on line 36 — add `|| mode === 'race'`:
  ```ts
  const livePosition = useMemo<number | null>(() => {
    if (!showTable || mode === 'race') return null
    const leaderboard = buildLeaderboard(segment.leaderboardDrivers!, currentTime, mode)
    return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
  }, [showTable, segment.leaderboardDrivers, currentTime, mode, session.driver.kart])
  ```
  The dependency array already contains `mode` — do not change it.

  **Change 2 — both `LeaderboardTable` call sites** (around lines 128 and 180). Add `raceLapSnapshots={segment.raceLapSnapshots}` to **both**:
  ```tsx
  <LeaderboardTable
    leaderboardDrivers={segment.leaderboardDrivers!}
    ourKart={session.driver.kart}
    mode={mode}
    fps={fps}
    raceLapSnapshots={segment.raceLapSnapshots}
    {/* ...other existing props unchanged */}
  />
  ```

- [ ] **Update `esports/index.tsx`** — add `raceLapSnapshots={segment.raceLapSnapshots}` to the single `LeaderboardTable` call site (around line 222).

- [ ] **Update `minimal/index.tsx`** — add `raceLapSnapshots={segment.raceLapSnapshots}` to the single `LeaderboardTable` call site (around line 172).

- [ ] **Update `modern/index.tsx`** — add `raceLapSnapshots={segment.raceLapSnapshots}` to the single `LeaderboardTable` call site (around line 148).

- [ ] **Verify the `livePosition` guard is correct** — search for the guard in the file and confirm it reads `if (!showTable || mode === 'race') return null`:
  ```bash
  grep -n "mode === 'race'" apps/renderer/src/styles/banner/index.tsx
  ```
  Expected: one match inside the `livePosition` useMemo.

- [ ] **Run all renderer tests** to confirm nothing is broken:
  ```bash
  bun test apps/renderer/src/
  ```
  Expected: all existing tests pass.

- [ ] **Run full test suite**:
  ```bash
  bun test
  ```
  Expected: all tests pass.

- [ ] **Commit**:
  ```bash
  git add apps/renderer/src/components/shared/LeaderboardTable.tsx \
           apps/renderer/src/styles/banner/index.tsx \
           apps/renderer/src/styles/esports/index.tsx \
           apps/renderer/src/styles/minimal/index.tsx \
           apps/renderer/src/styles/modern/index.tsx
  git commit -m "feat(renderer): wire raceLapSnapshots through LeaderboardTable and all style components"
  ```

---

## Done

All tasks complete. The race leaderboard now uses authoritative lap-by-lap positions from the Alpha Timing replay endpoint. Qualifying/practice, `PositionCounter`, and all existing tests are unchanged.

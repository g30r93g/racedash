import type { Lap } from '@racedash/core'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

export interface DriverRow {
  kart: string
  name: string
  laps: Lap[]
}

export interface GridEntry {
  position: number
  kart: string
  name: string
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36'

export const MAX_REQUESTS_PER_WINDOW = 10
export const WINDOW_MS = 60_000 // 1 minute
const requestTimestamps = new Map<string, number[]>()

/** @internal Clear rate-limit state between tests. */
export function _resetRateLimit(): void {
  requestTimestamps.clear()
}

async function waitForRateLimit(url: string): Promise<void> {
  let backoffAttempt = 0
  let timestamps = requestTimestamps.get(url)
  if (!timestamps) {
    timestamps = []
    requestTimestamps.set(url, timestamps)
  }

  while (true) {
    const now = Date.now()
    // Purge timestamps outside the current window
    while (timestamps.length > 0 && timestamps[0] <= now - WINDOW_MS) {
      timestamps.shift()
    }
    if (timestamps.length < MAX_REQUESTS_PER_WINDOW) {
      timestamps.push(now)
      return
    }
    // Wait with exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
    const delay = Math.min(1000 * 2 ** backoffAttempt, 30_000)
    backoffAttempt++
    console.debug(`[scraper] Rate limit hit for ${url}, waiting ${delay}ms before retrying...`)
    await new Promise((r) => setTimeout(r, delay))
  }
}

export async function fetchHtml(url: string): Promise<string> {
  return fetchTab(url, '/laptimes')
}

export async function fetchGridHtml(url: string): Promise<string> {
  return fetchTab(url, '/grid')
}

async function fetchTab(url: string, tab: string, retries = 3, timeoutMs = 30_000): Promise<string> {
  const resolved = normaliseUrl(url, tab)
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await waitForRateLimit(resolved)
      const res = await fetch(resolved, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${resolved}`)
      return res.text()
    } catch (err) {
      lastError = err
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }
  }
  throw lastError
}

export function parseDrivers(html: string): DriverRow[] {
  const $ = cheerio.load(html)
  const tbody = $('table.at-lap-chart-legend-table tbody')
  if (!tbody.length) throw new Error('Could not find laptimes table in HTML')
  return tbody
    .find('tr')
    .map((_, row) => parseRow($, row))
    .get()
}

function parseRow($: cheerio.CheerioAPI, row: AnyNode): DriverRow {
  const cells = $(row).find('td')
  const spans = cells.eq(0).find('.at-lap-chart-legend-table-competitor span')
  const kart = spans.eq(0).text().trim()
  const name = spans.eq(1).text().trim()

  const laps: Lap[] = []
  let cumulative = 0
  cells.slice(1).each((i, cell) => {
    const text = $(cell).find('div').text().trim()
    const lapTime = parseLapTimeStr(text)
    if (lapTime === null) return
    cumulative = Math.round((cumulative + lapTime) * 1000) / 1000
    laps.push({ number: i + 1, lapTime, cumulative })
  })

  return { kart, name, laps }
}

function parseLapTimeStr(s: string): number | null {
  s = s.trim()
  if (!s) return null
  if (!s.includes(':')) {
    if (!s.includes('.')) return null
    const result = parseFloat(s)
    return isNaN(result) ? null : result
  }
  const [minutesPart, rest] = s.split(':')
  const result = parseInt(minutesPart, 10) * 60 + parseFloat(rest)
  if (isNaN(result)) return null
  return result
}

export function parseGrid(html: string): GridEntry[] {
  const $ = cheerio.load(html)
  const tbody = $('table.at-session-results-table tbody')
  if (!tbody.length) throw new Error('Could not find grid table in HTML')
  return tbody
    .find('tr')
    .map((_, row) => {
      const cells = $(row).find('td')
      const position = parseInt(cells.eq(0).text().trim(), 10)
      const kart = cells.eq(1).find('span').text().trim()
      const name = cells.eq(2).text().trim()
      return { position, kart, name }
    })
    .get()
    .filter((e: GridEntry) => !isNaN(e.position))
}

function normaliseUrl(url: string, tab: string): string {
  const tabs = ['/result', '/laptimes', '/lapchart', '/replay', '/grid']
  for (const t of tabs) {
    if (url.endsWith(t)) return url.slice(0, -t.length) + tab
  }
  return url.replace(/\/$/, '') + tab
}

export interface ReplayLapEntry {
  driverId: number
  position: number
  kart: string
  name: string
  lapsCompleted: number
  totalSeconds: number | null
  gapToLeader: string
  intervalToAhead: string
}

// Index 0 = pre-race; index N (N >= 1) = after leader's Nth lap
export type ReplayLapData = ReplayLapEntry[][]

export async function fetchReplayHtml(url: string): Promise<string> {
  return fetchTab(url, '/replay')
}

/**
 * Build a mapping from header name → D-array index by reading the
 * `<th>` elements inside `#replayTable thead`.
 *
 * D[0] is always the hidden position-change indicator ("+3", "=", "-1")
 * which has no `<th>`.  The i-th `<th>` therefore corresponds to D[i+1].
 *
 * Falls back to the legacy 10-column layout (no Cls, no sectors) when
 * the table is absent — e.g. in minimal test fixtures.
 */
function buildReplayColumnMap($: cheerio.CheerioAPI): Record<string, number> {
  const headers: string[] = []
  $('#replayTable thead th').each((_, el) => {
    headers.push($(el).text().trim())
  })

  if (headers.length === 0) {
    // Legacy fallback: Pos, No., Name, Laps, Time, Last, Best, Gap to 1st, Gap
    return { Pos: 1, 'No.': 2, Name: 3, Laps: 4, Time: 5, 'Gap to 1st': 8, Gap: 9 }
  }

  const map: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    map[headers[i]] = i + 1 // +1 because D[0] has no header
  }
  return map
}

function extractKartFromColumn(raw: string): string {
  // The kart column may be plain text ("71") or HTML containing
  // an <span class="at-number-plate">58</span>.
  if (raw.includes('<')) {
    const m = raw.match(/>(\d+)</)
    return m ? m[1] : raw
  }
  return raw
}

export function parseReplayLapData(html: string): ReplayLapData {
  const $ = cheerio.load(html)
  const tag = $('script[type="application/json"]#lapData')
  if (!tag.length) throw new Error('Could not find lapData script tag in HTML')
  const raw = JSON.parse(tag.text()) as { laps?: unknown }
  if (!Array.isArray(raw.laps)) throw new Error('lapData JSON is missing a "laps" array')
  if (raw.laps.length === 0) return []

  const col = buildReplayColumnMap($)
  const posIdx = col['Pos']
  const kartIdx = col['No.']
  const nameIdx = col['Name']
  const lapsIdx = col['Laps']
  const timeIdx = col['Time'] // may be undefined (e.g. IAME)
  const gapIdx = col['Gap to 1st']
  const intervalIdx = col['Gap']

  return (raw.laps as Array<Array<{ C: number; D: [string, string][] }>>).map((snapshot) =>
    snapshot.map((entry) => ({
      driverId: entry.C,
      position: parseInt(entry.D[posIdx][0], 10),
      kart: extractKartFromColumn(entry.D[kartIdx][0]),
      name: entry.D[nameIdx][0],
      lapsCompleted: parseInt(entry.D[lapsIdx][0], 10),
      totalSeconds: timeIdx != null ? parseLapTimeStr(entry.D[timeIdx][0]) : null,
      gapToLeader: gapIdx != null ? entry.D[gapIdx][0] : '',
      intervalToAhead: intervalIdx != null ? entry.D[intervalIdx][0] : '',
    })),
  )
}

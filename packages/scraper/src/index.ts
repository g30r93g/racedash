import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { Lap } from '@racedash/core'

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

export async function fetchHtml(url: string): Promise<string> {
  return fetchTab(url, '/laptimes')
}

export async function fetchGridHtml(url: string): Promise<string> {
  return fetchTab(url, '/grid')
}

async function fetchTab(url: string, tab: string): Promise<string> {
  const resolved = normaliseUrl(url, tab)
  const res = await fetch(resolved, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${resolved}`)
  return res.text()
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

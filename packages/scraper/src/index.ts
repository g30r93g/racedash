import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { Lap } from '@racedash/core'

export interface DriverRow {
  kart: string
  name: string
  laps: Lap[]
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/121.0.0.0 Safari/537.36'

export async function fetchHtml(url: string): Promise<string> {
  const laptimesUrl = normaliseUrl(url)
  const res = await fetch(laptimesUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${laptimesUrl}`)
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

function normaliseUrl(url: string): string {
  const tabs = ['/result', '/laptimes', '/lapchart', '/replay', '/grid']
  for (const tab of tabs) {
    if (url.endsWith(tab)) return url.slice(0, -tab.length) + '/laptimes'
  }
  return url.replace(/\/$/, '') + '/laptimes'
}

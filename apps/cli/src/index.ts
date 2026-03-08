#!/usr/bin/env node
import { program } from 'commander'
import { fetchHtml, parseDrivers } from '@racedash/scraper'
import { parseOffset, calculateTimestamps, formatChapters } from '@racedash/timestamps'
import { selectDriver } from './select'

program
  .name('racedash')
  .description('Alpha Timing → YouTube chapters + GT7 overlay')
  .version('0.1.0')

program
  .command('drivers <url>')
  .description('List all drivers for a session')
  .action(async (url: string) => {
    try {
      console.error('Fetching...')
      const html = await fetchHtml(url)
      const drivers = parseDrivers(html)
      drivers.forEach((d, i) =>
        console.log(`  ${String(i + 1).padStart(2)}. [${d.kart.padStart(3)}] ${d.name}`),
      )
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('timestamps <url> [driver]')
  .description('Output YouTube chapter timestamps to stdout')
  .requiredOption('--offset <time>', 'Video timestamp at race start, e.g. 0:02:15')
  .action(async (url: string, driverQuery: string | undefined, opts: { offset: string }) => {
    try {
      const offsetSeconds = parseOffset(opts.offset)
      console.error('Fetching...')
      const html = await fetchHtml(url)
      const drivers = parseDrivers(html)
      const driver = await selectDriver(drivers, driverQuery)
      const timestamps = calculateTimestamps(driver.laps, offsetSeconds)
      console.error(`\nDriver: [${driver.kart}] ${driver.name} — ${driver.laps.length} laps\n`)
      console.log(formatChapters(timestamps))
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message)
  process.exit(1)
})

import { select } from '@inquirer/prompts'
import type { DriverRow } from '@racedash/scraper'

export async function selectDriver(
  drivers: DriverRow[],
  query: string | undefined,
): Promise<DriverRow> {
  if (!drivers.length) throw new Error('No drivers found in session.')
  const candidates = filterDrivers(drivers, query)
  if (candidates.length === 1) return candidates[0]
  return promptDriver(candidates)
}

function filterDrivers(drivers: DriverRow[], query: string | undefined): DriverRow[] {
  if (!query) return drivers
  const q = query.toLowerCase()
  const matches = drivers.filter(d => d.name.toLowerCase().includes(q))
  if (!matches.length) {
    throw new Error(
      `No drivers matching '${query}'. Available: ${drivers.map(d => d.name).join(', ')}`,
    )
  }
  return matches
}

async function promptDriver(candidates: DriverRow[]): Promise<DriverRow> {
  return select({
    message: 'Select driver:',
    choices: candidates.map(d => ({
      name: `[${d.kart.padStart(3)}] ${d.name}`,
      value: d,
    })),
  })
}

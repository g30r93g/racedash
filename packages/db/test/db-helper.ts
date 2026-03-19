import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../src/schema'
import { afterAll } from 'vitest'

const DATABASE_URL = process.env.DATABASE_URL

let pool: pg.Pool | null = null

export function getTestDb() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not set — run tests with pnpm test:db')
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL })
  }
  return drizzle(pool, { schema })
}

export function isDbAvailable(): boolean {
  return !!DATABASE_URL
}

// Close pool after all tests in the process complete
if (DATABASE_URL) {
  afterAll(async () => {
    if (pool) {
      await pool.end()
      pool = null
    }
  })
}

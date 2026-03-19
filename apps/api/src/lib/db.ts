import { createDb, type DrizzleDb } from '@racedash/db'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

let db: DrizzleDb | null = null

export function getDb(): DrizzleDb {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required')

    // Neon URLs contain 'neon' — use the Neon HTTP driver for production.
    // All other URLs (localhost, standard postgres) use node-postgres.
    if (databaseUrl.includes('neon')) {
      db = createDb(databaseUrl)
    } else {
      const pool = new pg.Pool({ connectionString: databaseUrl })
      db = drizzle(pool) as unknown as DrizzleDb
    }
  }
  return db
}

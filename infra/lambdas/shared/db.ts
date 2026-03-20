import { createDb, type DrizzleDb } from '@racedash/db'

let db: DrizzleDb | null = null

export function getDb(): DrizzleDb {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required')
    db = createDb(databaseUrl)
  }
  return db
}

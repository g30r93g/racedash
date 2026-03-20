import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type DrizzleDb = ReturnType<typeof createDb>
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]
export type DbOrTx = DrizzleDb | DrizzleTx

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzle(sql, { schema })
}

import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../client'

export interface ClaimNextQueuedSlotTokenInput {
  db: DrizzleDb
  userId: string
}

export async function claimNextQueuedSlotToken(
  input: ClaimNextQueuedSlotTokenInput,
): Promise<string | null> {
  const { db, userId } = input

  const result = await db.execute(sql`
    WITH target AS (
      SELECT id, slot_task_token
      FROM jobs
      WHERE user_id = ${userId}
        AND status = 'queued'
        AND slot_task_token IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs
    SET slot_task_token = NULL
    FROM target
    WHERE jobs.id = target.id
    RETURNING target.slot_task_token
  `)

  const rows = result as unknown as Array<{ slot_task_token: string | null }>
  return rows[0]?.slot_task_token ?? null
}

import { pgTable, uuid, text, jsonb, timestamp, integer, index, pgEnum } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const jobStatusEnum = pgEnum('job_status', [
  'uploading',
  'queued',
  'rendering',
  'compositing',
  'complete',
  'failed',
])

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    status: jobStatusEnum('status').notNull().default('uploading'),
    config: jsonb('config').notNull(),
    inputS3Keys: text('input_s3_keys').array().notNull(),
    uploadIds: jsonb('upload_ids'),
    outputS3Key: text('output_s3_key'),
    downloadExpiresAt: timestamp('download_expires_at', { withTimezone: true }),
    slotTaskToken: text('slot_task_token'),
    renderTaskToken: text('render_task_token'),
    remotionRenderId: text('remotion_render_id'),
    rcCost: integer('rc_cost'),
    sfnExecutionArn: text('sfn_execution_arn'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('jobs_user_id_status_idx').on(table.userId, table.status),
    index('jobs_user_queued_slot_idx')
      .on(table.userId, table.createdAt)
      .where(sql`status = 'queued' AND slot_task_token IS NOT NULL`),
  ],
)

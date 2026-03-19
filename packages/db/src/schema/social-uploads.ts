import { pgTable, uuid, text, jsonb, integer, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'
import { jobs } from './jobs'
import { creditReservations } from './credit-reservations'

export const socialUploadStatusEnum = pgEnum('social_upload_status', [
  'queued', 'uploading', 'processing', 'live', 'failed',
])

export const socialUploads = pgTable('social_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: text('platform').notNull(),
  status: socialUploadStatusEnum('status').notNull().default('queued'),
  metadata: jsonb('metadata'),
  rcCost: integer('rc_cost').notNull().default(10),
  creditReservationId: uuid('credit_reservation_id').references(() => creditReservations.id),
  platformUrl: text('platform_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('social_uploads_job_id_idx').on(table.jobId),
  index('social_uploads_user_id_idx').on(table.userId),
])

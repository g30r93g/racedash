import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'

export const reservationStatusEnum = pgEnum('reservation_status', ['reserved', 'consumed', 'released'])

export const creditReservations = pgTable('credit_reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: text('job_id').unique().notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  rcAmount: integer('rc_amount').notNull(),
  status: reservationStatusEnum('status').notNull().default('reserved'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
})

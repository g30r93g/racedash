import { pgTable, uuid, text, integer, numeric, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const creditPacks = pgTable('credit_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  packName: text('pack_name').notNull(),
  rcTotal: integer('rc_total').notNull(),
  rcRemaining: integer('rc_remaining').notNull(),
  priceGbp: numeric('price_gbp', { precision: 10, scale: 2 }).notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
}, (table) => [
  index('credit_packs_user_fifo_idx')
    .on(table.userId, table.expiresAt)
    .where(sql`rc_remaining > 0`),
  check('rc_remaining_non_negative', sql`rc_remaining >= 0`),
])

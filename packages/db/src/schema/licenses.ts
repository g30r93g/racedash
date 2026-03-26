import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'

export const licenseTierEnum = pgEnum('license_tier', ['plus', 'pro'])
export const licenseStatusEnum = pgEnum('license_status', ['active', 'expired', 'cancelled'])

export const licenses = pgTable(
  'licenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    tier: licenseTierEnum('tier').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    status: licenseStatusEnum('status').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('licenses_user_id_idx').on(table.userId)],
)

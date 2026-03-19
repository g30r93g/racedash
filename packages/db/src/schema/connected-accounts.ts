import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { users } from './users'

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: text('platform').notNull(),
  accountName: text('account_name'),
  accountId: text('account_id'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => [
  unique('connected_accounts_user_platform_uniq').on(table.userId, table.platform),
])

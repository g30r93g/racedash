import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { users } from './users'

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminClerkId: text('admin_clerk_id').notNull(),
    action: text('action').notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id),
    targetResourceType: text('target_resource_type').notNull(),
    targetResourceId: text('target_resource_id'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_admin_audit_log_admin').on(table.adminClerkId),
    index('idx_admin_audit_log_action').on(table.action),
    index('idx_admin_audit_log_target_user').on(table.targetUserId),
    index('idx_admin_audit_log_created_at').on(table.createdAt),
  ],
)

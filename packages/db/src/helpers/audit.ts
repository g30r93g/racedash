import { adminAuditLog } from '../schema/admin-audit-log'
import type { DbOrTx } from '../client'

export type AdminAuditAction =
  | 'license.issue'
  | 'license.extend'
  | 'license.revoke'
  | 'credits.grant'
  | 'credits.correction'

export interface LogAdminActionParams {
  adminClerkId: string
  action: AdminAuditAction
  targetUserId?: string
  targetResourceType: string
  targetResourceId?: string
  payload: Record<string, unknown>
}

export async function logAdminAction(
  db: DbOrTx,
  params: LogAdminActionParams,
): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminClerkId: params.adminClerkId,
    action: params.action,
    targetUserId: params.targetUserId,
    targetResourceType: params.targetResourceType,
    targetResourceId: params.targetResourceId,
    payload: params.payload,
  })
}

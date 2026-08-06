import { Prisma, UserRole } from '@prisma/client';
import { db } from '@/lib/db';

export interface AuditParams {
  actorUserId?: string | null;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Writes an immutable audit entry. Failures intentionally propagate: a caller
 * performing a sensitive mutation must either include the audit write in its
 * own transaction or fail visibly instead of silently losing the audit trail.
 */
export async function logAudit(params: AuditParams) {
  return db.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeJson: params.beforeJson ?? undefined,
      afterJson: params.afterJson ?? (params.metadata ? { metadata: params.metadata } : undefined),
      reason: params.reason ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

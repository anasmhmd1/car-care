import 'server-only';

import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { db } from '@/lib/db';

export interface SubscriptionExpirationScope {
  customerId?: string;
  branchIds?: readonly string[] | null;
  now?: Date;
}

/**
 * Lazily persists time-based expiration before subscription reads. The
 * status transition and its append-only audit entry share one transaction,
 * while an optimistic predicate keeps concurrent page loads idempotent.
 */
export async function expireActiveSubscriptions(
  scope: SubscriptionExpirationScope = {},
): Promise<number> {
  const now = scope.now ?? new Date();
  const where: Prisma.CustomerSubscriptionWhereInput = {
    status: SubscriptionStatus.ACTIVE,
    endDate: { lte: now },
    ...(scope.customerId ? { customerId: scope.customerId } : {}),
    ...(scope.branchIds === null || scope.branchIds === undefined
      ? {}
      : { branchId: { in: [...scope.branchIds] } }),
  };
  const candidates = await db.customerSubscription.findMany({
    where,
    select: { id: true, endDate: true },
  });
  if (candidates.length === 0) return 0;

  return db.$transaction(async (tx) => {
    let changed = 0;
    for (const candidate of candidates) {
      const result = await tx.customerSubscription.updateMany({
        where: {
          id: candidate.id,
          status: SubscriptionStatus.ACTIVE,
          endDate: { lte: now },
        },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      if (result.count !== 1) continue;
      changed += 1;
      await tx.auditLog.create({
        data: {
          actorRole: UserRole.SYSTEM_SUPER_ADMIN,
          action: 'SUBSCRIPTION_EXPIRED_AUTOMATICALLY',
          entityType: 'CustomerSubscription',
          entityId: candidate.id,
          beforeJson: { status: SubscriptionStatus.ACTIVE, endDate: candidate.endDate.toISOString() },
          afterJson: { status: SubscriptionStatus.EXPIRED, expiredAt: now.toISOString() },
          reason: 'انتهاء مدة الاشتراك آليًا عند أول قراءة لاحقة.',
        },
      });
    }
    return changed;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 10_000,
    timeout: 25_000,
  });
}

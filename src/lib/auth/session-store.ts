import type { Prisma } from '@prisma/client';

export async function revokeAllUserSessionsAndBumpVersion(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: string
): Promise<number> {
  const now = new Date();
  const normalizedReason = reason.trim().slice(0, 120) || 'SECURITY_INVALIDATION';

  const user = await tx.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: normalizedReason },
  });

  return user.sessionVersion;
}

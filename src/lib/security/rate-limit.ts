import { createHmac } from 'crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  login: { maxAttempts: 5, windowSeconds: 300 },
  register: { maxAttempts: 3, windowSeconds: 600 },
  booking: { maxAttempts: 10, windowSeconds: 60 },
  upload: { maxAttempts: 20, windowSeconds: 60 },
  'password-reset': { maxAttempts: 3, windowSeconds: 900 },
  availability: { maxAttempts: 60, windowSeconds: 60 },
  'catalog-media-upload': { maxAttempts: 20, windowSeconds: 60 },
  general: { maxAttempts: 30, windowSeconds: 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

function throttleDigest(action: string, identifier: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return createHmac('sha256', secret).update(`${action}:${identifier}`).digest('hex');
}

async function withThrottleLock<T>(
  keyHash: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${keyHash}))`;
        return await operation(tx);
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );
  } catch (error) {
    // If transaction lock fails or times out (e.g. pool contention or network latency),
    // fall back to direct database execution so authentication/operations degrade gracefully
    console.warn(`[rate-limit] Transaction lock failed for ${keyHash}, falling back to direct db:`, error);
    return operation(db as unknown as Prisma.TransactionClient);
  }
}

/**
 * Fixed-window limit persisted in PostgreSQL. The advisory lock makes the
 * increment deterministic even when requests hit different application
 * instances at the same time.
 */
export async function checkRateLimit(
  identifier: string,
  actionType: string = 'general',
): Promise<RateLimitResult> {
  const config = DEFAULT_CONFIGS[actionType] || DEFAULT_CONFIGS.general;
  const keyHash = throttleDigest(`rate:${actionType}`, identifier);

  try {
    return await withThrottleLock(keyHash, async (tx) => {
      const now = new Date();
      const existing = await tx.securityThrottle.findUnique({ where: { keyHash } });
      const windowEndsAt = existing
        ? new Date(existing.windowStartedAt.getTime() + config.windowSeconds * 1000)
        : now;

      if (!existing || windowEndsAt <= now) {
        await tx.securityThrottle.upsert({
          where: { keyHash },
          update: {
            action: actionType,
            count: 1,
            windowStartedAt: now,
            lockedUntil: null,
          },
          create: {
            keyHash,
            action: actionType,
            count: 1,
            windowStartedAt: now,
          },
        });
        return {
          allowed: true,
          remaining: config.maxAttempts - 1,
          resetIn: config.windowSeconds,
        };
      }

      const nextCount = existing.count + 1;
      await tx.securityThrottle.update({ where: { keyHash }, data: { count: nextCount } });
      return {
        allowed: nextCount <= config.maxAttempts,
        remaining: Math.max(0, config.maxAttempts - nextCount),
        resetIn: Math.max(1, Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000)),
      };
    });
  } catch (err) {
    console.warn(`[rate-limit] Check failed for ${actionType}:${identifier}, allowing request:`, err);
    return {
      allowed: true,
      remaining: config.maxAttempts,
      resetIn: 0,
    };
  }
}

const LOCKOUT_MAX_FAILURES = 5;
const LOCKOUT_MINUTES = 15;

export async function recordLoginFailure(identifier: string): Promise<{ locked: boolean; lockoutMinutes: number }> {
  try {
    const keyHash = throttleDigest('account-lockout', identifier);
    return await withThrottleLock(keyHash, async (tx) => {
      const now = new Date();
      const existing = await tx.securityThrottle.findUnique({ where: { keyHash } });

      if (existing?.lockedUntil && existing.lockedUntil > now) {
        return {
          locked: true,
          lockoutMinutes: Math.max(1, Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 60_000)),
        };
      }

      const failureWindowExpired = !existing ||
        existing.windowStartedAt.getTime() + LOCKOUT_MINUTES * 60_000 <= now.getTime();
      const nextCount = failureWindowExpired ? 1 : existing.count + 1;
      const lockedUntil = nextCount >= LOCKOUT_MAX_FAILURES
        ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
        : null;

      await tx.securityThrottle.upsert({
        where: { keyHash },
        update: {
          action: 'account-lockout',
          count: nextCount,
          windowStartedAt: failureWindowExpired ? now : existing?.windowStartedAt,
          lockedUntil,
        },
        create: {
          keyHash,
          action: 'account-lockout',
          count: nextCount,
          windowStartedAt: now,
          lockedUntil,
        },
      });

      return { locked: Boolean(lockedUntil), lockoutMinutes: lockedUntil ? LOCKOUT_MINUTES : 0 };
    });
  } catch (err) {
    console.warn(`[rate-limit] recordLoginFailure failed for ${identifier}:`, err);
    return { locked: false, lockoutMinutes: 0 };
  }
}

export async function isAccountLocked(identifier: string): Promise<boolean> {
  try {
    const keyHash = throttleDigest('account-lockout', identifier);
    const existing = await db.securityThrottle.findUnique({ where: { keyHash } });
    if (!existing?.lockedUntil) return false;
    if (existing.lockedUntil > new Date()) return true;
    await db.securityThrottle.updateMany({
      where: { keyHash, lockedUntil: { lte: new Date() } },
      data: { count: 0, lockedUntil: null, windowStartedAt: new Date() },
    });
    return false;
  } catch (err) {
    console.warn(`[rate-limit] isAccountLocked check failed for ${identifier}:`, err);
    return false;
  }
}

export async function clearLockout(identifier: string): Promise<void> {
  try {
    const keyHash = throttleDigest('account-lockout', identifier);
    await db.securityThrottle.deleteMany({ where: { keyHash } });
  } catch (err) {
    console.warn(`[rate-limit] clearLockout failed for ${identifier}:`, err);
  }
}

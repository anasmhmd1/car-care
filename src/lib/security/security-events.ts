import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { isIP } from 'node:net';

export type SecurityEventType =
  | 'LOGIN_FAILURE'
  | 'LOGIN_SUCCESS'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PERMISSION_DENIED'
  | 'IDOR_ATTEMPT'
  | 'INVALID_FILE_UPLOAD'
  | 'SUSPICIOUS_ACTIVITY'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'ACCOUNT_DEACTIVATED'
  | 'SESSION_TERMINATED';

export interface SecurityEventParams {
  userId?: string | null;
  eventType: SecurityEventType;
  description: string;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Log a security event for monitoring and audit purposes.
 */
export async function logSecurityEvent(params: SecurityEventParams): Promise<void> {
  try {
    await db.securityEvent.create({
      data: {
        userId: params.userId ?? null,
        eventType: params.eventType,
        description: params.description,
        ipAddress: params.ipAddress || null,
        metadata: params.metadata || undefined,
      },
    });
  } catch (error) {
    // Security logging should never crash the application
    console.error('Failed to log security event:', error);
  }
}

/**
 * Extract IP address from request headers.
 */
export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || headers.get('x-real-ip')?.trim();
  if (!candidate || candidate.length > 45 || isIP(candidate) === 0) return 'unknown';
  return candidate;
}

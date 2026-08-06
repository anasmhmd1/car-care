import type { AppRole } from '@/lib/auth/policy';
import { isAppRole } from '@/lib/auth/policy';

export const SESSION_COOKIE_NAME = 'bareeq_session';
export const SESSION_ISSUER = 'bareeq';
export const SESSION_AUDIENCE = 'bareeq-web';
export const DEFAULT_SESSION_TTL_DAYS = 7;
export const MAX_SESSION_TTL_DAYS = 30;

export interface SignedSessionClaims {
  sessionId: string;
  userId: string;
  role: AppRole;
  sessionVersion: number;
  mustChangePwd: boolean;
}

export type SessionValidationFailure =
  | 'SESSION_ID_MISMATCH'
  | 'USER_ID_MISMATCH'
  | 'TOKEN_HASH_MISMATCH'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_VERSION_MISMATCH'
  | 'USER_INACTIVE'
  | 'USER_DELETED'
  | 'ROLE_MISMATCH'
  | 'PASSWORD_CHANGE_STATE_MISMATCH';

interface PersistedSessionLike {
  id: string;
  userId: string;
  tokenHash: string;
  sessionVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface SessionUserLike {
  id: string;
  role: AppRole;
  active: boolean;
  deletedAt: Date | null;
  sessionVersion: number;
  mustChangePwd: boolean;
}

export function getEncodedSessionSecret(
  secret: string | undefined = process.env.SESSION_SECRET
): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export function getSessionTtlSeconds(
  rawDays: string | undefined = process.env.SESSION_TTL_DAYS
): number {
  const parsed = Number.parseInt(rawDays || '', 10);
  const days = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_SESSION_TTL_DAYS
    ? parsed
    : DEFAULT_SESSION_TTL_DAYS;
  return days * 24 * 60 * 60;
}

export async function hashSessionToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function isSignedSessionClaims(value: unknown): value is SignedSessionClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Record<string, unknown>;

  return (
    typeof claims.sessionId === 'string' &&
    claims.sessionId.length > 0 &&
    typeof claims.userId === 'string' &&
    claims.userId.length > 0 &&
    isAppRole(claims.role) &&
    Number.isInteger(claims.sessionVersion) &&
    (claims.sessionVersion as number) > 0 &&
    typeof claims.mustChangePwd === 'boolean'
  );
}

export function getSessionValidationFailure(input: {
  claims: SignedSessionClaims;
  persistedSession: PersistedSessionLike;
  user: SessionUserLike;
  actualTokenHash: string;
  now?: Date;
}): SessionValidationFailure | null {
  const {
    claims,
    persistedSession,
    user,
    actualTokenHash,
    now = new Date(),
  } = input;

  if (persistedSession.id !== claims.sessionId) return 'SESSION_ID_MISMATCH';
  if (persistedSession.userId !== claims.userId || user.id !== claims.userId) {
    return 'USER_ID_MISMATCH';
  }
  if (persistedSession.tokenHash !== actualTokenHash) return 'TOKEN_HASH_MISMATCH';
  if (persistedSession.revokedAt) return 'SESSION_REVOKED';
  if (persistedSession.expiresAt.getTime() <= now.getTime()) return 'SESSION_EXPIRED';
  if (
    persistedSession.sessionVersion !== claims.sessionVersion ||
    user.sessionVersion !== claims.sessionVersion
  ) {
    return 'SESSION_VERSION_MISMATCH';
  }
  if (!user.active) return 'USER_INACTIVE';
  if (user.deletedAt) return 'USER_DELETED';
  if (user.role !== claims.role) return 'ROLE_MISMATCH';
  if (user.mustChangePwd !== claims.mustChangePwd) {
    return 'PASSWORD_CHANGE_STATE_MISMATCH';
  }
  return null;
}

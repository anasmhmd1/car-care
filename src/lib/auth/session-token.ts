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

export interface SignSessionJwtOptions {
  expiresAt: Date;
  secret?: Uint8Array;
  issuer?: string;
  audience?: string;
}

export interface VerifySessionJwtOptions {
  secret?: Uint8Array;
  issuer?: string;
  audience?: string;
  now?: Date;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecodeToBytes(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function signSessionJwt(
  claims: SignedSessionClaims,
  options: SignSessionJwtOptions
): Promise<string> {
  const secret = options.secret ?? getEncodedSessionSecret();
  const issuer = options.issuer ?? SESSION_ISSUER;
  const audience = options.audience ?? SESSION_AUDIENCE;

  const header = { alg: 'HS256', typ: 'JWT' };
  const expSec = Math.floor(options.expiresAt.getTime() / 1000);
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    ...claims,
    iss: issuer,
    aud: audience,
    sub: claims.userId,
    jti: claims.sessionId,
    iat: nowSec,
    exp: expSec,
  };

  const headerB64 = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const dataToSign = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    dataToSign as BufferSource
  );

  const sigB64 = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

export async function verifySessionJwt(
  token: string,
  options?: VerifySessionJwtOptions
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const headerBytes = base64UrlDecodeToBytes(headerB64);
    if (!headerBytes) return null;
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    if (!header || typeof header !== 'object' || header.alg !== 'HS256') {
      return null;
    }
    if ('typ' in header && header.typ !== 'JWT') {
      return null;
    }

    const secret = options?.secret ?? getEncodedSessionSecret();
    const issuer = options?.issuer ?? SESSION_ISSUER;
    const audience = options?.audience ?? SESSION_AUDIENCE;

    const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sigBytes = base64UrlDecodeToBytes(sigB64);
    if (!sigBytes) return null;

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      secret as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const isValid = await globalThis.crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes as BufferSource,
      dataToVerify as BufferSource
    );

    if (!isValid) return null;

    const payloadBytes = base64UrlDecodeToBytes(payloadB64);
    if (!payloadBytes) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload || typeof payload !== 'object') return null;

    const checkNow = options?.now ?? new Date();
    const nowSec = Math.floor(checkNow.getTime() / 1000);

    if (typeof payload.exp === 'number' && payload.exp <= nowSec) {
      return null;
    }
    if (issuer && payload.iss !== issuer) {
      return null;
    }
    if (audience && payload.aud !== audience) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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

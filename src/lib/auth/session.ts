import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import type { AppRole } from '@/lib/auth/policy';
import {
  SESSION_AUDIENCE,
  SESSION_COOKIE_NAME,
  SESSION_ISSUER,
  getEncodedSessionSecret,
  getSessionTtlSeconds,
  getSessionValidationFailure,
  hashSessionToken,
  isSignedSessionClaims,
  type SignedSessionClaims,
} from '@/lib/auth/session-token';

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionPayload {
  sessionId: string;
  userId: string;
  phone: string;
  role: UserRole;
  fullName: string;
  sessionVersion: number;
  mustChangePwd: boolean;
  expiresAt: Date;
}

export interface AuthReadOptions {
  allowPasswordChangeRequired?: boolean;
}

interface ValidatedSession {
  payload: SessionPayload;
  user: User;
}

function normalizeHeader(value: string | null, maxLength: number): string | null {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || null;
}

async function getRequestMetadata(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0] ?? null;
    const ipAddress = normalizeHeader(
      forwardedFor ||
        requestHeaders.get('x-real-ip') ||
        requestHeaders.get('cf-connecting-ip'),
      64
    );
    const userAgent = normalizeHeader(requestHeaders.get('user-agent'), 512);
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

async function revokeSessionToken(token: string, reason: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: reason.trim().slice(0, 120) || 'SESSION_REVOKED',
    },
  });
}

async function verifySignedClaims(token: string): Promise<SignedSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getEncodedSessionSecret(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    return isSignedSessionClaims(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function getValidatedSession(): Promise<ValidatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const claims = await verifySignedClaims(token);
  if (!claims) return null;

  const tokenHash = await hashSessionToken(token);
  const persistedSession = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!persistedSession) return null;

  const failure = getSessionValidationFailure({
    claims,
    persistedSession,
    user: {
      id: persistedSession.user.id,
      role: persistedSession.user.role as AppRole,
      active: persistedSession.user.active,
      deletedAt: persistedSession.user.deletedAt,
      sessionVersion: persistedSession.user.sessionVersion,
      mustChangePwd: persistedSession.user.mustChangePwd,
    },
    actualTokenHash: tokenHash,
  });

  if (failure) {
    if (!persistedSession.revokedAt) {
      await db.session.updateMany({
        where: { id: persistedSession.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: `VALIDATION_${failure}`,
        },
      });
    }
    return null;
  }

  const now = new Date();
  if (persistedSession.lastUsedAt.getTime() <= now.getTime() - LAST_USED_WRITE_INTERVAL_MS) {
    await db.session.updateMany({
      where: {
        id: persistedSession.id,
        revokedAt: null,
        lastUsedAt: { lte: new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS) },
      },
      data: { lastUsedAt: now },
    });
  }

  return {
    payload: {
      sessionId: persistedSession.id,
      userId: persistedSession.user.id,
      phone: persistedSession.user.phone,
      role: persistedSession.user.role,
      fullName: persistedSession.user.fullName,
      sessionVersion: persistedSession.user.sessionVersion,
      mustChangePwd: persistedSession.user.mustChangePwd,
      expiresAt: persistedSession.expiresAt,
    },
    user: persistedSession.user,
  };
}

export async function createSession(
  user: Pick<User, 'id' | 'sessionVersion'>
): Promise<string> {
  const currentUser = await db.user.findFirst({
    where: {
      id: user.id,
      sessionVersion: user.sessionVersion,
      active: true,
      deletedAt: null,
    },
  });
  if (!currentUser) {
    throw new Error('Cannot create a session after the user security state changed');
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (previousToken) {
    await revokeSessionToken(previousToken, 'SESSION_REPLACED');
  }

  const sessionId = globalThis.crypto.randomUUID();
  const ttlSeconds = getSessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const claims: SignedSessionClaims = {
    sessionId,
    userId: currentUser.id,
    role: currentUser.role as AppRole,
    sessionVersion: currentUser.sessionVersion,
    mustChangePwd: currentUser.mustChangePwd,
  };

  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(currentUser.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getEncodedSessionSecret());

  const [tokenHash, metadata] = await Promise.all([
    hashSessionToken(token),
    getRequestMetadata(),
  ]);

  await db.session.create({
    data: {
      id: sessionId,
      userId: currentUser.id,
      tokenHash,
      sessionVersion: currentUser.sessionVersion,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt,
    },
  });

  try {
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: ttlSeconds,
      priority: 'high',
    });
  } catch (error) {
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: 'COOKIE_WRITE_FAILED' },
    });
    throw error;
  }

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  return (await getValidatedSession())?.payload ?? null;
}

export async function destroySession(reason = 'USER_LOGOUT'): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  try {
    if (token) await revokeSessionToken(token, reason);
  } catch (error) {
    console.error('Failed to revoke server session:', error);
    throw error;
  } finally {
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
}

export async function getCurrentUser(
  options: AuthReadOptions = {}
): Promise<User | null> {
  const validated = await getValidatedSession();
  if (!validated) return null;
  if (validated.user.mustChangePwd && !options.allowPasswordChangeRequired) {
    return null;
  }
  return validated.user;
}

export async function requireAuth(
  options: AuthReadOptions = {}
): Promise<User> {
  const validated = await getValidatedSession();
  if (!validated) {
    redirect('/login');
    throw new Error('Authentication redirect failed');
  }
  if (validated.user.mustChangePwd && !options.allowPasswordChangeRequired) {
    redirect('/account/profile?change_password=true');
    throw new Error('Password change redirect failed');
  }
  return validated.user;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    redirect('/login');
    throw new Error('Authorization redirect failed');
  }
  return user;
}

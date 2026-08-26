import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_SESSION_TTL_DAYS,
  getEncodedSessionSecret,
  getSessionTtlSeconds,
  getSessionValidationFailure,
  hashSessionToken,
  isSignedSessionClaims,
  signSessionJwt,
  verifySessionJwt,
  type SignedSessionClaims,
} from '@/lib/auth/session-token';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';

const NOW = new Date('2026-08-01T12:00:00.000Z');
type ValidationFixture = Parameters<typeof getSessionValidationFailure>[0];

function validFixture(): ValidationFixture {
  const claims: SignedSessionClaims = {
    sessionId: 'session-1',
    userId: 'user-1',
    role: 'CUSTOMER',
    sessionVersion: 4,
    mustChangePwd: false,
  };

  return {
    claims,
    persistedSession: {
      id: claims.sessionId,
      userId: claims.userId,
      tokenHash: 'a'.repeat(64),
      sessionVersion: claims.sessionVersion,
      expiresAt: new Date('2026-08-08T12:00:00.000Z'),
      revokedAt: null,
    },
    user: {
      id: claims.userId,
      role: claims.role,
      active: true,
      deletedAt: null,
      sessionVersion: claims.sessionVersion,
      mustChangePwd: claims.mustChangePwd,
    },
    actualTokenHash: 'a'.repeat(64),
    now: NOW,
  };
}

describe('session token primitives', () => {
  it('hashes the full bearer token deterministically without storing it verbatim', async () => {
    const token = 'signed.jwt.value';
    const first = await hashSessionToken(token);
    const second = await hashSessionToken(token);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(token);
    expect(await hashSessionToken(`${token}.changed`)).not.toBe(first);
  });

  it('requires a production-grade signing secret', () => {
    expect(() => getEncodedSessionSecret('')).toThrow(/SESSION_SECRET/);
    expect(() => getEncodedSessionSecret('too-short')).toThrow(/32 characters/);
    expect(getEncodedSessionSecret('x'.repeat(32))).toHaveLength(32);
  });

  it('bounds configurable session lifetime and uses a safe default', () => {
    const day = 24 * 60 * 60;
    expect(getSessionTtlSeconds('1')).toBe(day);
    expect(getSessionTtlSeconds('30')).toBe(30 * day);
    expect(getSessionTtlSeconds('0')).toBe(DEFAULT_SESSION_TTL_DAYS * day);
    expect(getSessionTtlSeconds('31')).toBe(DEFAULT_SESSION_TTL_DAYS * day);
    expect(getSessionTtlSeconds('invalid')).toBe(DEFAULT_SESSION_TTL_DAYS * day);
  });

  it('accepts only the minimal strongly typed claims', () => {
    expect(isSignedSessionClaims(validFixture().claims)).toBe(true);
    expect(isSignedSessionClaims({ ...validFixture().claims, role: 'OWNER_FORGED' })).toBe(false);
    expect(isSignedSessionClaims({ ...validFixture().claims, sessionVersion: 0 })).toBe(false);
    expect(isSignedSessionClaims({ ...validFixture().claims, mustChangePwd: 'false' })).toBe(false);
  });

  it('signs and verifies session JWTs with native Web Crypto API correctly', async () => {
    const secret = new TextEncoder().encode('y'.repeat(32));
    const claims = validFixture().claims;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const token = await signSessionJwt(claims, { expiresAt, secret });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifySessionJwt(token, { secret });
    expect(verified).not.toBeNull();
    expect(isSignedSessionClaims(verified)).toBe(true);
    expect(verified?.sessionId).toBe(claims.sessionId);
    expect(verified?.userId).toBe(claims.userId);
    expect(verified?.role).toBe(claims.role);

    // Rejection on wrong secret
    const wrongSecret = new TextEncoder().encode('z'.repeat(32));
    expect(await verifySessionJwt(token, { secret: wrongSecret })).toBeNull();

    // Rejection on expiration
    const expiredToken = await signSessionJwt(claims, {
      expiresAt: new Date(Date.now() - 1000),
      secret,
    });
    expect(await verifySessionJwt(expiredToken, { secret })).toBeNull();

    // Rejection on tampered payload
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}xyz.${parts[2]}`;
    expect(await verifySessionJwt(tampered, { secret })).toBeNull();
  });
});

describe('persisted session validation', () => {
  it('accepts a live session only when token, record, claims, and user state agree', () => {
    expect(getSessionValidationFailure(validFixture())).toBeNull();
  });

  it.each([
    ['SESSION_ID_MISMATCH', (fixture: ValidationFixture) => {
      fixture.persistedSession.id = 'another-session';
    }],
    ['USER_ID_MISMATCH', (fixture: ValidationFixture) => {
      fixture.user.id = 'another-user';
    }],
    ['TOKEN_HASH_MISMATCH', (fixture: ValidationFixture) => {
      fixture.actualTokenHash = 'b'.repeat(64);
    }],
    ['SESSION_REVOKED', (fixture: ValidationFixture) => {
      fixture.persistedSession.revokedAt = NOW;
    }],
    ['SESSION_EXPIRED', (fixture: ValidationFixture) => {
      fixture.persistedSession.expiresAt = NOW;
    }],
    ['SESSION_VERSION_MISMATCH', (fixture: ValidationFixture) => {
      fixture.user.sessionVersion += 1;
    }],
    ['USER_INACTIVE', (fixture: ValidationFixture) => {
      fixture.user.active = false;
    }],
    ['USER_DELETED', (fixture: ValidationFixture) => {
      fixture.user.deletedAt = NOW;
    }],
    ['ROLE_MISMATCH', (fixture: ValidationFixture) => {
      fixture.user.role = 'OWNER';
    }],
    ['PASSWORD_CHANGE_STATE_MISMATCH', (fixture: ValidationFixture) => {
      fixture.user.mustChangePwd = true;
    }],
  ])('rejects %s', (expected, mutate) => {
    const fixture = validFixture();
    mutate(fixture);
    expect(getSessionValidationFailure(fixture)).toBe(expected);
  });
});

describe('bulk session invalidation', () => {
  it('bumps the user version and revokes every live session with one reason', async () => {
    const userUpdate = vi.fn().mockResolvedValue({ sessionVersion: 9 });
    const sessionUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const tx = {
      user: { update: userUpdate },
      session: { updateMany: sessionUpdateMany },
    } as unknown as Prisma.TransactionClient;

    await expect(
      revokeAllUserSessionsAndBumpVersion(tx, 'user-1', ' PASSWORD_CHANGED ')
    ).resolves.toBe(9);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokedReason: 'PASSWORD_CHANGED',
      },
    });
  });
});

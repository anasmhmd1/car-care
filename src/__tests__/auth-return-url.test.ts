import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { getSafeLocalReturnPath } from '@/lib/auth/return-url';
import { middleware } from '@/middleware';

describe('authentication return URLs', () => {
  it('preserves a selected public plan through the unauthenticated middleware redirect', async () => {
    const response = await middleware(
      new NextRequest('https://bareeq.test/account/subscriptions?plan=plan-123'),
    );
    const location = new URL(response.headers.get('location')!);

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callback')).toBe('/account/subscriptions?plan=plan-123');
  });

  it('allows local deep links and rejects external or malformed return URLs', () => {
    expect(getSafeLocalReturnPath('/account/subscriptions?plan=plan-123')).toBe(
      '/account/subscriptions?plan=plan-123',
    );
    expect(getSafeLocalReturnPath('%2Faccount%2Fsubscriptions%3Fplan%3Dplan-123')).toBe(
      '/account/subscriptions?plan=plan-123',
    );
    expect(getSafeLocalReturnPath('https://evil.example')).toBeNull();
    expect(getSafeLocalReturnPath('//evil.example')).toBeNull();
    expect(getSafeLocalReturnPath('/\\evil.example')).toBeNull();
    expect(getSafeLocalReturnPath('%')).toBeNull();
  });
});

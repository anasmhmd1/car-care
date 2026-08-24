import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVAILABILITY_MAX_DAYS_AHEAD,
  MAX_AVAILABILITY_ADDON_IDS,
  allowsLegacyAvailabilitySeedIds,
  parseAvailabilityRequest,
} from '@/lib/validations/availability';

const mocks = vi.hoisted(() => ({
  calculateAvailableSlots: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIP: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('@/lib/engine/availability', () => ({
  calculateAvailableSlots: mocks.calculateAvailableSlots,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock('@/lib/security/security-events', () => ({
  getClientIP: mocks.getClientIP,
  logSecurityEvent: mocks.logSecurityEvent,
}));

import { GET } from '@/app/api/availability/route';

const branchId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const coverageAreaId = '33333333-3333-4333-8333-333333333333';
const addonId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-08-04T10:00:00.000Z');

function validQuery(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    branchId,
    serviceId,
    coverageAreaId,
    vehicleSize: 'SEDAN',
    date: '2026-08-10',
    ...overrides,
  });
}

describe('availability request validation', () => {
  it('accepts a bounded, distinct set of UUID addon IDs', () => {
    const parsed = parseAvailabilityRequest(
      validQuery({ addonIds: addonId }),
      now,
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.addonIds).toEqual([addonId]);
  });

  it('permits seed IDs and UUIDs uniformly across all environments', () => {
    const seedRequest = validQuery({
      branchId: 'seed-branch-zayed',
      serviceId: 'seed-service-upholstery',
      coverageAreaId: 'seed-area-zone-1-1',
      addonIds: 'seed-addon-glass',
    });
    const parsed = parseAvailabilityRequest(seedRequest, now);

    expect(parsed.success).toBe(true);
  });

  it('maintains compatibility helper for environment checking', () => {
    expect(allowsLegacyAvailabilitySeedIds('production', undefined)).toBe(true);
    expect(allowsLegacyAvailabilitySeedIds('production', 'true')).toBe(true);
    expect(allowsLegacyAvailabilitySeedIds('development', undefined)).toBe(true);
  });

  it.each([
    ['invalid characters in branch ID', validQuery({ branchId: 'invalid branch id with spaces' })],
    ['path traversal in branch ID', validQuery({ branchId: '../seed-branch-zayed' })],
    ['unknown vehicle size', validQuery({ vehicleSize: 'TRUCK' })],
    ['invalid calendar date', validQuery({ date: '2026-02-30' })],
    ['past date', validQuery({ date: '2026-08-03' })],
    ['too-far date', validQuery({ date: '2026-11-03' })],
    ['duplicate addons', validQuery({ addonIds: `${addonId},${addonId}` })],
    [
      'too many addons',
      validQuery({
        addonIds: Array.from({ length: MAX_AVAILABILITY_ADDON_IDS + 1 }, (_, index) =>
          `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
        ).join(','),
      }),
    ],
  ])('rejects %s', (_label, query) => {
    expect(parseAvailabilityRequest(query, now).success).toBe(false);
  });

  it('documents the maximum booking lookup horizon', () => {
    expect(AVAILABILITY_MAX_DAYS_AHEAD).toBe(90);
  });
});

describe('availability API route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.getClientIP.mockReturnValue('203.0.113.9');
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 59, resetIn: 60 });
    mocks.calculateAvailableSlots.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 400 before calculating slots for malformed input', async () => {
    const request = new NextRequest(`https://bareeq.test/api/availability?${validQuery({ branchId: 'invalid branch with spaces' })}`);
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(mocks.calculateAvailableSlots).not.toHaveBeenCalled();
  });

  it('returns 429 with retry metadata when the endpoint/IP limit is exceeded', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetIn: 47 });
    const request = new NextRequest(`https://bareeq.test/api/availability?${validQuery()}`);
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('47');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      'endpoint:availability|ip:203.0.113.9',
      'availability',
    );
    expect(mocks.calculateAvailableSlots).not.toHaveBeenCalled();
  });

  it('uses only parsed canonical query values to calculate slots', async () => {
    const request = new NextRequest(`https://bareeq.test/api/availability?${validQuery({ addonIds: addonId })}`);
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.calculateAvailableSlots).toHaveBeenCalledWith({
      branchId,
      serviceId,
      coverageAreaId,
      vehicleSize: 'SEDAN',
      dateStr: '2026-08-10',
      addonIds: [addonId],
    });
  });
});

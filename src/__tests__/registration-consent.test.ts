import { describe, expect, it, vi } from 'vitest';
import { Prisma, UserRole, VehicleSize } from '@prisma/client';
import { createCustomerRegistration } from '@/lib/auth/registration';
import {
  BOOKING_TERMS_VERSION,
  PRIVACY_POLICY_VERSION,
} from '@/lib/policies/versions';
import { createBookingSchema } from '@/lib/validations/booking';

describe('atomic customer registration records', () => {
  it('creates the profile, both versioned consents, and audit on one transaction client', async () => {
    const acceptedAt = new Date('2026-08-01T10:00:00.000Z');
    const userCreate = vi.fn().mockResolvedValue({
      id: 'user-1',
      fullName: 'Customer One',
      phone: '01012345678',
      role: UserRole.CUSTOMER,
    });
    const consentCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      user: { create: userCreate },
      customerConsent: { createMany: consentCreateMany },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;

    await expect(createCustomerRegistration(tx, {
      fullName: 'Customer One',
      phone: '01012345678',
      whatsapp: '01012345678',
      email: 'customer@example.com',
      passwordHash: 'hashed-password',
      acceptedAt,
      ipAddress: '203.0.113.1',
      userAgent: 'test-agent',
    })).resolves.toMatchObject({ id: 'user-1' });

    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: UserRole.CUSTOMER,
        customerProfile: { create: {} },
      }),
    });
    expect(consentCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          consentType: 'PRIVACY_POLICY',
          version: PRIVACY_POLICY_VERSION,
          accepted: true,
          acceptedAt,
        }),
        expect.objectContaining({
          userId: 'user-1',
          consentType: 'BOOKING_TERMS',
          version: BOOKING_TERMS_VERSION,
          accepted: true,
          acceptedAt,
        }),
      ],
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'user-1',
        actorRole: UserRole.CUSTOMER,
        action: 'CUSTOMER_REGISTER',
        entityId: 'user-1',
      }),
    });
  });
});

describe('booking consent version', () => {
  const bookingInput = {
    serviceId: '11111111-1111-4111-8111-111111111111',
    coverageAreaId: '22222222-2222-4222-8222-222222222222',
    vehicleSize: VehicleSize.SEDAN,
    startAt: '2026-08-10T10:00:00.000Z',
    addonIds: '[]',
    vehicleMake: 'Test',
    vehicleModel: 'Model',
    vehicleYear: 2025,
    vehicleColor: 'Black',
    street: 'Main Street',
    buildingNumber: '10',
    contactName: 'Customer One',
    contactPhone: '01012345678',
    contactWhatsapp: '01012345678',
    policyAccepted: 'true',
    acceptedCancellationPolicyId: 'policy-standard',
    acceptedCancellationPolicyRevision: 'policy-standard:2026-08-01:2026-08-01T00:00:00.000Z',
  };

  it('defaults a missing version to the current server version', () => {
    const result = createBookingSchema.parse(bookingInput);
    expect(result.policyVersion).toBe(BOOKING_TERMS_VERSION);
  });

  it('rejects a stale or forged client policy version', () => {
    expect(createBookingSchema.safeParse({
      ...bookingInput,
      policyVersion: '2025-01-01',
    }).success).toBe(false);
  });

  it('requires the exact cancellation-policy revision shown during checkout', () => {
    const withoutRevision: Partial<typeof bookingInput> = { ...bookingInput };
    delete withoutRevision.acceptedCancellationPolicyRevision;
    expect(createBookingSchema.safeParse(withoutRevision).success).toBe(false);
  });
});

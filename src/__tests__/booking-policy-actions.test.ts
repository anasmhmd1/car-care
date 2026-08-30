import {
  AssignmentMode,
  BookingStatus,
  PaymentStatus,
  UserRole,
  VehicleSize,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  transaction: vi.fn(),
  evaluateRequestedInterval: vi.fn(),
  checkRateLimit: vi.fn(),
  canAccessBranch: vi.fn(),
  hasPermissionAcrossScopes: vi.fn(),
  bookingPermissionScopes: vi.fn(),
  revalidatePath: vi.fn(),
  scopedBookingFindFirst: vi.fn(),
  bookingFindUnique: vi.fn(),
  teamFindUnique: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireRole: mocks.requireRole,
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    booking: {
      findFirst: mocks.scopedBookingFindFirst,
      findUnique: mocks.bookingFindUnique,
    },
    team: { findUnique: mocks.teamFindUnique },
  },
}));

vi.mock('@/lib/engine/availability', () => ({
  evaluateRequestedInterval: mocks.evaluateRequestedInterval,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/lib/auth/authorization', () => ({
  canAccessBranch: mocks.canAccessBranch,
}));

vi.mock('@/lib/auth/permissions', () => ({
  bookingPermissionScopes: mocks.bookingPermissionScopes,
  hasPermissionAcrossScopes: mocks.hasPermissionAcrossScopes,
}));

import { createBookingAction } from '@/app/actions/booking';
import { recordRefundAction } from '@/app/actions/cancellation';
import {
  cancelBookingByOperationsAction,
  rescheduleBookingByOperationsAction,
  transferBookingTeamAction,
} from '@/app/actions/operations';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const AREA_ID = '22222222-2222-4222-8222-222222222222';
const POLICY_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const FILE_ID = '66666666-6666-4666-8666-666666666666';

const policy = {
  id: POLICY_ID,
  code: 'standard',
  nameAr: 'سياسة قياسية',
  version: '2026-08',
  noticeHours: 6,
  allowsCancellation: true,
  allowsRescheduling: true,
  allowsLateRequests: true,
  policyTextAr: 'سياسة اختبارية للحجز.',
  active: true,
  updatedAt: new Date('2026-08-30T10:00:00.000Z'),
};

function bookingForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values: Record<string, string> = {
    serviceId: SERVICE_ID,
    coverageAreaId: AREA_ID,
    vehicleSize: VehicleSize.SEDAN,
    startAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    addonIds: '[]',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleYear: '2024',
    vehicleColor: 'Black',
    street: 'شارع الاختبار',
    buildingNumber: '1',
    contactName: 'عميل الاختبار',
    contactPhone: '01000000111',
    contactWhatsapp: '01000000111',
    policyAccepted: 'true',
    policyVersion: '2026-08-01',
    acceptedCancellationPolicyId: POLICY_ID,
    acceptedCancellationPolicyRevision: 'stale-revision',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function bookingTransaction() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    coverageArea: {
      findFirst: vi.fn().mockResolvedValue({
        id: AREA_ID,
        governorate: 'القاهرة',
        city: 'القاهرة',
        district: 'المعادي',
        compound: 'اختبار',
        zone: {
          branchId: BRANCH_ID,
          branch: { assignmentMode: AssignmentMode.MANUAL },
        },
      }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'customer-user-1', active: true }),
    },
    customerProfile: {
      upsert: vi.fn().mockResolvedValue({ id: 'customer-1', creditBalance: 0 }),
    },
    vehicle: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: 'vehicle-1',
        vehicleSize: VehicleSize.SEDAN,
        make: 'Toyota',
        model: 'Camry',
        year: 2024,
        color: 'Black',
        plateNumber: null,
      }),
    },
    customerAddress: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: 'address-1',
        governorate: 'القاهرة',
        city: 'القاهرة',
        district: 'المعادي',
        compound: 'اختبار',
        street: 'شارع الاختبار',
        buildingNumber: '1',
        unitNumber: null,
        landmark: null,
        gateInstructions: null,
        locationUrl: null,
      }),
    },
    customerSubscription: { findFirst: vi.fn() },
    service: {
      findUnique: vi.fn().mockResolvedValue({
        id: SERVICE_ID,
        nameAr: 'خدمة اختبار',
        basePrice: 1000,
        durationMinutes: 60,
        cancellationPolicy: policy,
        materialRequirements: [],
      }),
    },
    booking: { create: vi.fn() },
  };
  return tx;
}

describe('booking and refund action guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.evaluateRequestedInterval.mockResolvedValue({
      serviceVariantId: 'variant-1',
      totalDurationMinutes: 60,
      basePrice: 1000,
      addonPrice: 0,
      totalPrice: 1000,
      depositAmount: 300,
      slotCount: 1,
      addonRecords: [],
      feasibleTeamIds: ['team-1'],
    });
    mocks.requireRole.mockResolvedValue({ id: 'manager-1', role: UserRole.OWNER });
    mocks.canAccessBranch.mockResolvedValue(true);
    mocks.hasPermissionAcrossScopes.mockResolvedValue(true);
    mocks.bookingPermissionScopes.mockReturnValue([{ type: 'BRANCH', id: BRANCH_ID }]);
    mocks.bookingFindUnique.mockReset();
    mocks.teamFindUnique.mockReset();
  });

  it('rejects a booking when the accepted policy revision changed before commit', async () => {
    const tx = bookingTransaction();
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await createBookingAction(bookingForm({
      acceptedCancellationPolicyRevision: 'wrong-revision',
    }));

    expect(result).toEqual({
      error: 'تم تحديث سياسة الإلغاء منذ فتح صفحة الحجز. حدّث الصفحة وراجع السياسة الجديدة قبل التأكيد.',
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a forged policy id even when the revision string looks valid', async () => {
    const tx = bookingTransaction();
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await createBookingAction(bookingForm({
      acceptedCancellationPolicyId: '77777777-7777-4777-8777-777777777777',
      acceptedCancellationPolicyRevision: `${POLICY_ID}:2026-08:${policy.updatedAt.toISOString()}`,
    }));

    expect(result.error).toContain('تم تحديث سياسة الإلغاء منذ فتح صفحة الحجز');
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('blocks refund recording while a terminal booking is in administrative review', async () => {
    mocks.scopedBookingFindFirst.mockResolvedValue({
      branchId: BRANCH_ID,
      assignedTeamId: null,
    });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: BOOKING_ID,
          branchId: BRANCH_ID,
          bookingStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
          terminalReopenSourceStatus: BookingStatus.CANCELLED,
          amountPaid: 1000,
          depositAmount: 300,
          creditAppliedAmount: 0,
          paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          cancellationRequest: {
            status: 'APPROVED_REFUND_PENDING',
            approvedRefundAmount: 300,
          },
        }),
      },
      bookingFile: { findFirst: vi.fn() },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const formData = new FormData();
    formData.set('bookingId', BOOKING_ID);
    formData.set('amount', '300');
    formData.set('refundMethod', 'تحويل بنكي');
    formData.set('bookingFileId', FILE_ID);
    formData.set('refundTimestamp', new Date(Date.now() - 60_000).toISOString());
    formData.set('idempotencyKey', 'refund-test-1');

    const result = await recordRefundAction(formData);

    expect(result).toEqual({
      error: 'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تسجيل أي استرداد.',
    });
    expect(tx.bookingFile.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['cancellation', cancelBookingByOperationsAction, { reason: 'سبب إلغاء واضح' }],
    ['rescheduling', rescheduleBookingByOperationsAction, {
      targetDate: '2026-09-10', targetTime: '12:00', reason: 'سبب تعديل واضح',
    }],
    ['team transfer', transferBookingTeamAction, {
      targetTeamId: '77777777-7777-4777-8777-777777777777', reason: 'سبب نقل واضح',
    }],
  ] as const)('blocks operations %s mutations during terminal review', async (_label, action, fields) => {
    mocks.bookingFindUnique.mockResolvedValue({
      id: BOOKING_ID,
      branchId: BRANCH_ID,
      bookingStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
      terminalReopenSourceStatus: BookingStatus.CANCELLED,
      bookingNumber: 'BQ-TERMINAL',
      assignedTeamId: null,
    });
    const formData = new FormData();
    formData.set('bookingId', BOOKING_ID);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);

    const result = await action(formData);

    expect(result.error).toContain('الحجز مفتوح لمراجعة إدارية طرفية');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

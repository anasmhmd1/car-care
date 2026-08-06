import {
  BookingStatus,
  PaymentStatus,
  UserRole,
  type Prisma,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  canExpireAwaitingPaymentBooking,
  expireAwaitingPaymentBooking,
} from '@/lib/engine/booking-expiration';

describe('booking payment-hold expiration', () => {
  it('only expires bookings that have not submitted a payment proof', () => {
    expect(canExpireAwaitingPaymentBooking(BookingStatus.REQUEST_SUBMITTED)).toBe(true);
    expect(canExpireAwaitingPaymentBooking(BookingStatus.AWAITING_PAYMENT_PROOF)).toBe(true);
    expect(canExpireAwaitingPaymentBooking(BookingStatus.PAYMENT_UNDER_REVIEW)).toBe(false);
    expect(canExpireAwaitingPaymentBooking(BookingStatus.AWAITING_OPERATIONS_REVIEW)).toBe(false);
  });

  it('moves the booking to EXPIRED and restores applied credit exactly once', async () => {
    const bookingRecord = {
      id: 'booking-1',
      customerId: 'customer-1',
      subscriptionId: null,
      bookingStatus: BookingStatus.AWAITING_PAYMENT_PROOF,
      paymentStatus: PaymentStatus.AWAITING_PROOF,
      creditAppliedAmount: 200,
      deletedAt: null,
      assignedTeamId: null,
      amountDue: 800,
      service: {
        minimumBeforePhotos: 0,
        minimumAfterPhotos: 0,
        checklistTemplates: [],
      },
      files: [],
      checklistInstances: [],
      qualityReview: null,
      assignedTeam: null,
    };
    const bookingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const bookingUpdate = vi.fn().mockResolvedValue({ id: 'booking-1' });
    const creditUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findUnique: vi.fn().mockResolvedValue(bookingRecord),
        updateMany: bookingUpdateMany,
        update: bookingUpdate,
      },
      bookingStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'history-1' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      customerCreditTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'credit-1' }),
      },
      customerProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'customer-1', creditBalance: 50 }),
        updateMany: creditUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(expireAwaitingPaymentBooking(tx, {
      booking: bookingRecord,
      actor: { id: 'customer-user-1', role: UserRole.CUSTOMER },
      now: new Date('2026-08-01T12:00:00.000Z'),
    })).resolves.toEqual({ expired: true });

    expect(bookingUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'booking-1',
        bookingStatus: BookingStatus.AWAITING_PAYMENT_PROOF,
      }),
      data: { bookingStatus: BookingStatus.EXPIRED },
    }));
    expect(creditUpdate).toHaveBeenCalledWith({
      where: { id: 'customer-1', creditBalance: 50 },
      data: { creditBalance: 250 },
    });
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
  });
});

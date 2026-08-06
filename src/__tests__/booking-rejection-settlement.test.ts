import {
  BookingStatus,
  PaymentStatus,
  UserRole,
  type Prisma,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { settleRejectedBooking } from '@/lib/engine/booking-rejection-settlement';

describe('settleRejectedBooking', () => {
  it('creates an actionable cash refund and restores only the applied credit', async () => {
    const cancellationUpsert = vi.fn().mockResolvedValue({ id: 'cancellation-1' });
    const bookingUpdate = vi.fn().mockResolvedValue({ id: 'booking-1' });
    const creditUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const creditCreate = vi.fn().mockResolvedValue({ id: 'credit-1' });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findUnique: vi.fn().mockResolvedValue({ customerId: 'customer-1' }),
        update: bookingUpdate,
      },
      customerProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'customer-1', creditBalance: 50 }),
        updateMany: creditUpdate,
      },
      customerCreditTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: creditCreate,
      },
      cancellationRequest: { upsert: cancellationUpsert },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as unknown as Prisma.TransactionClient;

    await expect(settleRejectedBooking(tx, {
      booking: {
        id: 'booking-1',
        customerId: 'customer-1',
        subscriptionId: null,
        bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        amountPaid: 700,
        depositAmount: 300,
        creditAppliedAmount: 200,
      },
      actor: { id: 'manager-1', role: UserRole.OPERATIONS_MANAGER },
      reason: 'تعذر تنفيذ الخدمة في الموعد المطلوب',
    })).resolves.toMatchObject({
      refundRequired: true,
      paymentOutcome: 'REFUND_PENDING',
      settlement: { approvedRefundAmount: 500, creditAmount: 200, retainedAmount: 0 },
    });

    expect(creditUpdate).toHaveBeenCalledWith({
      where: { id: 'customer-1', creditBalance: 50 },
      data: { creditBalance: 250 },
    });
    expect(cancellationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookingId: 'booking-1' },
      create: expect.objectContaining({
        status: 'APPROVED_REFUND_PENDING',
        approvedRefundAmount: 500,
        creditAmount: 200,
      }),
    }));
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { paymentStatus: PaymentStatus.REFUND_PENDING },
    });
    expect(creditCreate).toHaveBeenCalledOnce();
  });
});

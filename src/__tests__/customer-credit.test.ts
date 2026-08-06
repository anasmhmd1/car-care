import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { returnBookingValueToCredit } from '@/lib/engine/customer-credit';

const command = {
  bookingId: 'booking-1',
  customerId: 'customer-1',
  amount: 200,
  actorUserId: 'manager-1',
  transactionType: 'BOOKING_EXPIRY_CREDIT',
  reason: 'انتهاء مهلة الدفع وإعادة الرصيد',
};

describe('returnBookingValueToCredit', () => {
  it('returns terminal booking value atomically with a stable ledger key', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'credit-1', ...data }));
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      customerCreditTransaction: { findUnique: vi.fn().mockResolvedValue(null), create },
      booking: { findUnique: vi.fn().mockResolvedValue({ customerId: 'customer-1' }) },
      customerProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: 'customer-1', creditBalance: 300 }),
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(returnBookingValueToCredit(tx, command)).resolves.toMatchObject({ applied: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'customer-1', creditBalance: 300 },
      data: { creditBalance: 500 },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 200,
        balanceBefore: 300,
        balanceAfter: 500,
        idempotencyKey: 'booking:booking-1:terminal-credit-returned',
      }),
    });
  });

  it('returns the prior ledger entry without crediting twice', async () => {
    const existing = {
      id: 'credit-1',
      bookingId: 'booking-1',
      customerId: 'customer-1',
      amount: 200,
    };
    const updateMany = vi.fn();
    const create = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      customerCreditTransaction: { findUnique: vi.fn().mockResolvedValue(existing), create },
      customerProfile: { updateMany },
      booking: { findUnique: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(returnBookingValueToCredit(tx, command)).resolves.toEqual({
      applied: false,
      transaction: existing,
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

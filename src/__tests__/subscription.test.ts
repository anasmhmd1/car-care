import { describe, expect, it, vi } from 'vitest';
import {
  BranchStatus,
  Prisma,
  SubscriptionPaymentProofStatus,
  SubscriptionStatus,
  UserRole,
  VisitLedgerAction,
} from '@prisma/client';
import {
  SubscriptionEngineError,
  activateCustomerSubscription,
  adjustCustomerSubscriptionVisits,
  calculateManualVisitAdjustment,
  cancelCustomerSubscription,
  completeSubscriptionVisitForBooking,
  decideSubscriptionPaymentProofStatus,
  extendCustomerSubscription,
  freezeCustomerSubscription,
  getEffectiveSubscriptionStatus,
  purchaseCustomerSubscription,
  releaseSubscriptionVisitForBooking,
  unfreezeCustomerSubscription,
} from '@/lib/engine/subscription';

const NOW = new Date('2026-08-01T12:00:00.000Z');

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subscription-1',
    customerId: 'customer-1',
    planId: 'plan-1',
    branchId: 'branch-1',
    purchasePrice: 1200,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    totalVisits: 4,
    usedVisits: 1,
    remainingVisits: 3,
    status: SubscriptionStatus.ACTIVE,
    frozenAt: null,
    frozenUntil: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: NOW,
    ...overrides,
  };
}

const actor = {
  userId: 'user-1',
  role: UserRole.OWNER,
};

describe('subscription balance rules', () => {
  it('adds bonus visits without corrupting used + remaining = total', () => {
    expect(calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 1,
      remainingVisits: 3,
    }, 'ADD', 2)).toEqual({
      totalVisits: 6,
      usedVisits: 1,
      remainingVisits: 5,
      visitChange: 2,
    });
  });

  it('deducts only from available balance and never goes negative', () => {
    expect(calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 1,
      remainingVisits: 3,
    }, 'DEDUCT', 2)).toEqual({
      totalVisits: 4,
      usedVisits: 3,
      remainingVisits: 1,
      visitChange: -2,
    });
    expect(() => calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 4,
      remainingVisits: 0,
    }, 'DEDUCT', 1)).toThrowError(SubscriptionEngineError);
  });

  it('restores only visits that were previously consumed', () => {
    expect(calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 2,
      remainingVisits: 2,
    }, 'RESTORE', 1)).toEqual({
      totalVisits: 4,
      usedVisits: 1,
      remainingVisits: 3,
      visitChange: 1,
    });
    expect(() => calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 0,
      remainingVisits: 4,
    }, 'RESTORE', 1)).toThrow(/أكثر من المستهلك/);
  });

  it('rejects an already-corrupt balance before any adjustment', () => {
    expect(() => calculateManualVisitAdjustment({
      totalVisits: 4,
      usedVisits: 2,
      remainingVisits: 3,
    }, 'ADD', 1)).toThrow(/غير متسق/);
  });
});

describe('subscription payment proof rules', () => {
  it('approves only an exact submitted amount and classifies mismatches', () => {
    expect(decideSubscriptionPaymentProofStatus('APPROVE', 1200, 1200))
      .toBe(SubscriptionPaymentProofStatus.APPROVED);
    expect(decideSubscriptionPaymentProofStatus('APPROVE', 1199, 1200))
      .toBe(SubscriptionPaymentProofStatus.AMOUNT_MISMATCH);
    expect(decideSubscriptionPaymentProofStatus('REUPLOAD', 1200, 1200))
      .toBe(SubscriptionPaymentProofStatus.REUPLOAD_REQUIRED);
  });
});

describe('completion ledger integration', () => {
  it('deducts exactly one visit at service completion and writes audit + ledger', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createLedger = vi.fn().mockResolvedValue({ id: 'ledger-completed' });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findUnique: vi.fn().mockResolvedValue({ id: 'booking-1', subscriptionId: 'subscription-1' }),
      },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription()),
        updateMany,
      },
      subscriptionVisitLedger: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createLedger,
      },
      auditLog: { create: createAudit },
    } as unknown as Prisma.TransactionClient;

    await expect(completeSubscriptionVisitForBooking(tx, {
      bookingId: 'booking-1',
      ...actor,
      now: NOW,
    })).resolves.toMatchObject({ applied: true, remainingAfter: 2 });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'subscription-1', remainingVisits: 3, usedVisits: 1 },
      data: {
        remainingVisits: { decrement: 1 },
        usedVisits: { increment: 1 },
        status: SubscriptionStatus.ACTIVE,
      },
    });
    expect(createLedger).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: VisitLedgerAction.BOOKING_COMPLETED,
        visitChange: -1,
        balanceBefore: 3,
        remainingAfter: 2,
        idempotencyKey: 'subscription:subscription-1:booking:booking-1:completed',
      }),
    });
    expect(createAudit).toHaveBeenCalledOnce();
  });

  it('returns the existing completion entry on retry without another deduction', async () => {
    const existing = {
      id: 'ledger-completed',
      subscriptionId: 'subscription-1',
      bookingId: 'booking-1',
      action: VisitLedgerAction.BOOKING_COMPLETED,
      visitChange: -1,
      balanceBefore: 3,
      remainingAfter: 2,
    };
    const updateMany = vi.fn();
    const create = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: { findUnique: vi.fn().mockResolvedValue({ id: 'booking-1', subscriptionId: 'subscription-1' }) },
      subscriptionVisitLedger: { findFirst: vi.fn().mockResolvedValue(existing), create },
      customerSubscription: { findUnique: vi.fn(), updateMany },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(completeSubscriptionVisitForBooking(tx, {
      bookingId: 'booking-1',
      ...actor,
    })).resolves.toMatchObject({ applied: false, remainingAfter: 2 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks completion when the balance is zero', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: { findUnique: vi.fn().mockResolvedValue({ id: 'booking-1', subscriptionId: 'subscription-1' }) },
      subscriptionVisitLedger: { findFirst: vi.fn().mockResolvedValue(null) },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription({
          usedVisits: 4,
          remainingVisits: 0,
          status: SubscriptionStatus.COMPLETED,
        })),
        updateMany: vi.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(completeSubscriptionVisitForBooking(tx, {
      bookingId: 'booking-1',
      ...actor,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_VISITS' });
  });
});

describe('cancellation reservation integration', () => {
  it('releases a pre-service reservation with zero balance change', async () => {
    const createLedger = vi.fn().mockResolvedValue({ id: 'ledger-release' });
    const updateMany = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: { findUnique: vi.fn().mockResolvedValue({ id: 'booking-1', subscriptionId: 'subscription-1' }) },
      subscriptionVisitLedger: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.action === VisitLedgerAction.BOOKING_RESERVED) return Promise.resolve({ id: 'reserved' });
          return Promise.resolve(null);
        }),
        create: createLedger,
      },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription()),
        updateMany,
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-release' }) },
    } as unknown as Prisma.TransactionClient;

    await expect(releaseSubscriptionVisitForBooking(tx, {
      bookingId: 'booking-1',
      ...actor,
      now: NOW,
    })).resolves.toMatchObject({ applied: true, restored: false, remainingAfter: 3 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(createLedger).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: VisitLedgerAction.BOOKING_CANCELLED_RESTORED,
        visitChange: 0,
        balanceBefore: 3,
        remainingAfter: 3,
      }),
    });
  });

  it('restores +1 only when a completion deduction really exists', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: { findUnique: vi.fn().mockResolvedValue({ id: 'booking-1', subscriptionId: 'subscription-1' }) },
      subscriptionVisitLedger: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.action === VisitLedgerAction.BOOKING_RESERVED) return Promise.resolve({ id: 'reserved' });
          if (where.action === VisitLedgerAction.BOOKING_COMPLETED) return Promise.resolve({ id: 'completed' });
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue({ id: 'restored' }),
      },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription()),
        updateMany,
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-restored' }) },
    } as unknown as Prisma.TransactionClient;

    await expect(releaseSubscriptionVisitForBooking(tx, {
      bookingId: 'booking-1',
      ...actor,
      now: NOW,
    })).resolves.toMatchObject({ restored: true, remainingAfter: 4 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'subscription-1', usedVisits: 1, remainingVisits: 3 },
      data: {
        usedVisits: 0,
        remainingVisits: 4,
        status: SubscriptionStatus.ACTIVE,
      },
    });
  });
});

describe('purchase idempotency', () => {
  it('returns the original subscription when the same purchase command is retried', async () => {
    const original = subscription({ status: SubscriptionStatus.PENDING_PAYMENT });
    const createSubscription = vi.fn();
    const createLedger = vi.fn();
    const tx = {
      subscriptionVisitLedger: {
        findUnique: vi.fn().mockResolvedValue({
          action: VisitLedgerAction.PURCHASE,
          subscription: original,
        }),
        create: createLedger,
      },
      customerSubscription: { create: createSubscription },
    } as unknown as Prisma.TransactionClient;

    await expect(purchaseCustomerSubscription(tx, {
      customerId: 'customer-1',
      planId: 'plan-1',
      vehicleIds: ['vehicle-1'],
      idempotencyKey: 'command-1',
      reason: 'طلب شراء يدوي',
      ...actor,
      now: NOW,
    })).resolves.toBe(original);
    expect(createSubscription).not.toHaveBeenCalled();
    expect(createLedger).not.toHaveBeenCalled();
  });

  it('selects the customer latest eligible booking branch on the server', async () => {
    const createSubscription = vi.fn().mockImplementation(({ data }) => Promise.resolve({
      ...subscription({ status: SubscriptionStatus.PENDING_PAYMENT }),
      branchId: data.branchId,
    }));
    const tx = {
      subscriptionVisitLedger: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'purchase-ledger' }),
      },
      customerProfile: { findUnique: vi.fn().mockResolvedValue({ id: 'customer-1' }) },
      subscriptionPlan: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'plan-1',
          price: 1200,
          validityDays: 30,
          visitCount: 4,
          allowedVehicleCount: 1,
          branches: [
            { branchId: 'branch-1', branch: { status: BranchStatus.ACTIVE } },
            { branchId: 'branch-2', branch: { status: BranchStatus.ACTIVE } },
          ],
          services: [{ serviceId: 'service-1' }],
        }),
      },
      booking: { findFirst: vi.fn().mockResolvedValue({ branchId: 'branch-2' }) },
      branch: { findFirst: vi.fn().mockResolvedValue({ id: 'branch-1' }) },
      vehicle: { count: vi.fn().mockResolvedValue(1) },
      customerSubscription: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createSubscription,
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-purchase' }) },
    } as unknown as Prisma.TransactionClient;

    await purchaseCustomerSubscription(tx, {
      customerId: 'customer-1',
      planId: 'plan-1',
      vehicleIds: ['vehicle-1'],
      idempotencyKey: 'purchase-command-2',
      reason: 'طلب شراء يدوي',
      ...actor,
      now: NOW,
    });

    expect(createSubscription).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: 'branch-2' }),
    });
  });
});

describe('effective subscription expiration', () => {
  it('treats an active subscription at its end instant as expired', () => {
    expect(getEffectiveSubscriptionStatus(subscription({
      status: SubscriptionStatus.ACTIVE,
      endDate: NOW,
    }), NOW)).toBe(SubscriptionStatus.EXPIRED);
    expect(getEffectiveSubscriptionStatus(subscription({
      status: SubscriptionStatus.FROZEN,
      endDate: NOW,
    }), NOW)).toBe(SubscriptionStatus.FROZEN);
  });
});

describe('subscription lifecycle integration', () => {
  const command = {
    subscriptionId: 'subscription-1',
    idempotencyKey: 'command-1',
    reason: 'سبب إداري موثق',
    ...actor,
    now: NOW,
  };

  it('activates a paid request from the activation date and records lifecycle evidence', async () => {
    const update = vi.fn().mockImplementation(({ data }) => Promise.resolve({
      ...subscription({
        status: SubscriptionStatus.PENDING_PAYMENT,
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-31T00:00:00.000Z'),
      }),
      ...data,
    }));
    const ledgerCreate = vi.fn().mockResolvedValue({ id: 'activation-ledger' });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'activation-audit' });
    const tx = {
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(null), create: ledgerCreate },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          ...subscription({
            status: SubscriptionStatus.PENDING_PAYMENT,
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-07-31T00:00:00.000Z'),
          }),
          plan: { price: 1200 },
          paymentProofs: [{
            id: 'proof-1',
            status: SubscriptionPaymentProofStatus.APPROVED,
            amountSubmitted: 1200,
            paymentMethod: { branchId: 'branch-1' },
          }],
        }),
        update,
      },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;

    await expect(activateCustomerSubscription(tx, command)).resolves.toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      startDate: NOW,
      endDate: new Date('2026-08-31T12:00:00.000Z'),
    });
    expect(ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: VisitLedgerAction.MANUAL_ADJUSTMENT,
        visitChange: 0,
        idempotencyKey: 'command-1',
        reason: expect.stringContaining('[ACTIVATE]'),
      }),
    });
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it('blocks activation until the newest proof is approved for the exact plan price', async () => {
    const tx = {
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          ...subscription({ status: SubscriptionStatus.PENDING_PAYMENT }),
          plan: { price: 1200 },
          paymentProofs: [{
            id: 'proof-1',
            status: SubscriptionPaymentProofStatus.UNDER_REVIEW,
            amountSubmitted: 1200,
            paymentMethod: { branchId: 'branch-1' },
          }],
        }),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(activateCustomerSubscription(tx, command)).rejects.toMatchObject({
      code: 'APPROVED_PAYMENT_PROOF_REQUIRED',
    });
    expect(tx.customerSubscription.update).not.toHaveBeenCalled();
  });

  it('freezes only an eligible plan and unfreezing extends validity by elapsed frozen time', async () => {
    const freezeUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve({
      ...subscription(),
      ...data,
    }));
    const freezeTx = {
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          ...subscription(),
          plan: { freezeAllowed: true, maxFreezeDays: 10 },
        }),
        update: freezeUpdate,
      },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await freezeCustomerSubscription(freezeTx, { ...command, freezeDays: 7 });
    expect(freezeUpdate).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: {
        status: SubscriptionStatus.FROZEN,
        frozenAt: NOW,
        frozenUntil: new Date('2026-08-08T12:00:00.000Z'),
      },
    });

    const frozenAt = new Date('2026-07-27T12:00:00.000Z');
    const originalEnd = new Date('2026-09-01T00:00:00.000Z');
    const unfreezeUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve({
      ...subscription(),
      ...data,
    }));
    const unfreezeTx = {
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription({
          status: SubscriptionStatus.FROZEN,
          frozenAt,
          frozenUntil: new Date('2026-08-03T12:00:00.000Z'),
          endDate: originalEnd,
        })),
        update: unfreezeUpdate,
      },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await unfreezeCustomerSubscription(unfreezeTx, { ...command, idempotencyKey: 'command-2' });
    expect(unfreezeUpdate).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: {
        status: SubscriptionStatus.ACTIVE,
        endDate: new Date(originalEnd.getTime() + 5 * 24 * 60 * 60 * 1000),
        frozenAt: null,
        frozenUntil: null,
      },
    });
  });

  it('makes an extension command idempotent by its ledger key', async () => {
    const original = subscription();
    const update = vi.fn();
    const tx = {
      subscriptionVisitLedger: {
        findUnique: vi.fn().mockResolvedValue({
          subscriptionId: 'subscription-1',
          action: VisitLedgerAction.MANUAL_ADJUSTMENT,
          reason: '[EXTEND] سبب إداري موثق',
        }),
      },
      customerSubscription: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(original),
        findUnique: vi.fn(),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(extendCustomerSubscription(tx, {
      ...command,
      extensionDays: 30,
    })).resolves.toBe(original);
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks cancellation while an open booking still consumes the subscription', async () => {
    const update = vi.fn();
    const tx = {
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(null) },
      customerSubscription: { findUnique: vi.fn().mockResolvedValue(subscription()), update },
      booking: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as Prisma.TransactionClient;

    await expect(cancelCustomerSubscription(tx, command)).rejects.toMatchObject({
      code: 'OPEN_BOOKINGS_EXIST',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns a prior manual adjustment on retry without changing the balance twice', async () => {
    const original = subscription();
    const existingLedger = {
      id: 'manual-ledger',
      subscriptionId: 'subscription-1',
      action: VisitLedgerAction.MANUAL_ADJUSTMENT,
      reason: '[ADD] سبب إداري موثق',
    };
    const updateMany = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      subscriptionVisitLedger: { findUnique: vi.fn().mockResolvedValue(existingLedger) },
      customerSubscription: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(original),
        findUnique: vi.fn(),
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(adjustCustomerSubscriptionVisits(tx, {
      ...command,
      adjustment: 'ADD',
      amount: 1,
    })).resolves.toMatchObject({ applied: false, ledgerEntry: existingLedger });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not manually deduct visits already reserved by open bookings', async () => {
    const updateMany = vi.fn();
    const createLedger = vi.fn();
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      subscriptionVisitLedger: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: createLedger,
      },
      customerSubscription: {
        findUnique: vi.fn().mockResolvedValue(subscription({ remainingVisits: 3, usedVisits: 1 })),
        updateMany,
      },
      booking: { count: vi.fn().mockResolvedValue(2) },
    } as unknown as Prisma.TransactionClient;

    await expect(adjustCustomerSubscriptionVisits(tx, {
      ...command,
      idempotencyKey: 'command-reserved-deduct',
      adjustment: 'DEDUCT',
      amount: 2,
    })).rejects.toMatchObject({ code: 'RESERVED_VISITS_CONFLICT' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(createLedger).not.toHaveBeenCalled();
  });
});

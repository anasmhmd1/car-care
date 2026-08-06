import { VehicleSize, type Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ensurePaymentVerificationReservation } from '@/lib/engine/payment-verification-reservation';

const now = new Date('2026-08-10T08:00:00.000Z');
const booking = {
  id: 'booking-1',
  branchId: 'branch-1',
  serviceId: 'service-1',
  coverageAreaId: 'area-1',
  startAt: new Date('2026-08-10T12:00:00.000Z'),
  endAt: new Date('2026-08-10T13:30:00.000Z'),
  totalDurationMinutes: 90,
  vehicle: { vehicleSize: VehicleSize.SEDAN },
  addons: [{ addonId: 'addon-1' }],
};

function transactionWithHolds(holds: Array<{
  id: string;
  teamId: string;
  slotStartTime: Date;
  slotEndTime: Date;
  expiresAt: Date;
}>) {
  const bookingHold = {
    findMany: vi.fn().mockResolvedValue(holds),
    updateMany: vi.fn().mockResolvedValue({ count: holds.length }),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: 'hold-created', teamId: 'team-available' }),
  };
  return {
    tx: { bookingHold } as unknown as Prisma.TransactionClient,
    bookingHold,
  };
}

describe('payment verification reservation', () => {
  it('returns unavailable without writing any hold when capacity was lost', async () => {
    const { tx, bookingHold } = transactionWithHolds([]);
    const evaluate = vi.fn().mockResolvedValue(null);
    // Keep this independent from endAt in the unit test so it proves the
    // stored booking duration is sent to availability, not recalculated.
    const bookingWithStoredDuration = { ...booking, totalDurationMinutes: 120 };

    const result = await ensurePaymentVerificationReservation(
      tx,
      { booking: bookingWithStoredDuration, now, holdMinutes: 1_440 },
      evaluate,
    );

    expect(result).toBeNull();
    expect(evaluate).toHaveBeenCalledWith(tx, expect.objectContaining({
      excludeBookingId: bookingWithStoredDuration.id,
      reservedDurationMinutes: bookingWithStoredDuration.totalDurationMinutes,
    }), now);
    expect(bookingHold.findMany).toHaveBeenCalledOnce();
    expect(bookingHold.updateMany).not.toHaveBeenCalled();
    expect(bookingHold.create).not.toHaveBeenCalled();
  });

  it('extends the matching live hold and releases only duplicate active holds', async () => {
    const retained = {
      id: 'hold-retained',
      teamId: 'team-available',
      slotStartTime: booking.startAt,
      slotEndTime: booking.endAt,
      expiresAt: new Date('2026-08-10T08:30:00.000Z'),
    };
    const duplicate = {
      ...retained,
      id: 'hold-duplicate',
      teamId: 'team-other',
    };
    const { tx, bookingHold } = transactionWithHolds([retained, duplicate]);
    const evaluate = vi.fn().mockResolvedValue(null);

    const result = await ensurePaymentVerificationReservation(
      tx,
      { booking, now, holdMinutes: 120 },
      evaluate,
    );

    expect(result).toEqual({
      holdId: retained.id,
      teamId: retained.teamId,
      expiresAt: new Date('2026-08-10T10:00:00.000Z'),
      created: false,
    });
    expect(bookingHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: retained.id } }),
    }));
    expect(bookingHold.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: retained.id },
      data: expect.objectContaining({ expiresAt: new Date('2026-08-10T10:00:00.000Z') }),
    }));
    expect(bookingHold.create).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('keeps an existing exact capacity hold when a fresh search is unavailable', async () => {
    const held = {
      id: 'hold-customer-slot',
      teamId: 'team-config-changed',
      slotStartTime: booking.startAt,
      slotEndTime: booking.endAt,
      expiresAt: new Date('2026-08-10T08:30:00.000Z'),
    };
    const { tx, bookingHold } = transactionWithHolds([held]);
    const evaluate = vi.fn().mockResolvedValue(null);

    const result = await ensurePaymentVerificationReservation(
      tx,
      { booking, now, holdMinutes: 60 },
      evaluate,
    );

    expect(result).toMatchObject({
      holdId: held.id,
      teamId: held.teamId,
      created: false,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(bookingHold.create).not.toHaveBeenCalled();
  });

  it('replaces an expired or infeasible hold with the first feasible team', async () => {
    const stale = {
      id: 'hold-stale',
      teamId: 'team-old',
      slotStartTime: booking.startAt,
      slotEndTime: booking.endAt,
      expiresAt: new Date('2026-08-10T07:59:59.000Z'),
    };
    const { tx, bookingHold } = transactionWithHolds([stale]);
    const evaluate = vi.fn().mockResolvedValue({ feasibleTeamIds: ['team-available'] });

    const result = await ensurePaymentVerificationReservation(
      tx,
      { booking, now, holdMinutes: 60 },
      evaluate,
    );

    expect(bookingHold.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ id: expect.anything() }),
    }));
    expect(bookingHold.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: booking.id,
        teamId: 'team-available',
        slotStartTime: booking.startAt,
        slotEndTime: booking.endAt,
        expiresAt: new Date('2026-08-10T09:00:00.000Z'),
      }),
      select: { id: true, teamId: true },
    });
    expect(result?.created).toBe(true);
  });
});

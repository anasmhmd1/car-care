import {
  BookingHoldStatus,
  type Prisma,
  type VehicleSize,
} from '@prisma/client';
import { evaluateRequestedInterval } from './availability';

interface VerificationBooking {
  id: string;
  branchId: string;
  serviceId: string;
  coverageAreaId: string;
  startAt: Date;
  endAt: Date;
  totalDurationMinutes: number;
  vehicle: { vehicleSize: VehicleSize };
  addons: Array<{ addonId: string }>;
}

interface HoldCandidate {
  id: string;
  teamId: string | null;
  slotStartTime: Date;
  slotEndTime: Date;
  expiresAt: Date;
}

type AvailabilityEvaluator = (
  tx: Prisma.TransactionClient,
  request: {
    branchId: string;
    serviceId: string;
    coverageAreaId: string;
    vehicleSize: VehicleSize;
    addonIds: string[];
    startAt: Date;
    excludeBookingId: string;
    reservedDurationMinutes: number;
  },
  now: Date,
) => Promise<{ feasibleTeamIds: string[] } | null>;

export function selectRetainableVerificationHold(
  holds: HoldCandidate[],
  feasibleTeamIds: string[],
  booking: Pick<VerificationBooking, 'startAt' | 'endAt'>,
  now: Date,
) {
  const feasibleTeams = new Set(feasibleTeamIds);
  return holds.find((hold) =>
    hold.expiresAt > now &&
    hold.slotStartTime.getTime() === booking.startAt.getTime() &&
    hold.slotEndTime.getTime() === booking.endAt.getTime() &&
    (!hold.teamId || feasibleTeams.size === 0 || feasibleTeams.has(hold.teamId)),
  ) ?? null;
}

/**
 * A live exact hold is already the capacity reservation promised to the
 * customer. Keep it during payment verification even if later configuration
 * edits would make a fresh availability search choose another team.
 */
export function selectLiveVerificationHold(
  holds: HoldCandidate[],
  booking: Pick<VerificationBooking, 'startAt' | 'endAt'>,
  now: Date,
) {
  return holds.find((hold) => (
    hold.expiresAt > now
    && hold.slotStartTime.getTime() === booking.startAt.getTime()
    && hold.slotEndTime.getTime() === booking.endAt.getTime()
  )) ?? null;
}

/**
 * Guarantees one live capacity reservation for a payment being verified.
 * The caller must hold the branch `capacity:*` advisory lock for the whole
 * surrounding transaction.
 */
export async function ensurePaymentVerificationReservation(
  tx: Prisma.TransactionClient,
  input: {
    booking: VerificationBooking;
    now: Date;
    holdMinutes: number;
  },
  evaluateAvailability: AvailabilityEvaluator = evaluateRequestedInterval,
) {
  const { booking, now } = input;
  const reservedDurationMinutes = booking.totalDurationMinutes;
  if (
    booking.startAt <= now ||
    !Number.isInteger(reservedDurationMinutes) ||
    reservedDurationMinutes < 1 ||
    !Number.isInteger(input.holdMinutes) ||
    input.holdMinutes < 1
  ) return null;

  const activeHolds = await tx.bookingHold.findMany({
    where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      teamId: true,
      slotStartTime: true,
      slotEndTime: true,
      expiresAt: true,
    },
  });
  const expiresAt = new Date(now.getTime() + input.holdMinutes * 60_000);
  const liveReservation = selectLiveVerificationHold(activeHolds, booking, now);
  if (liveReservation) {
    await tx.bookingHold.updateMany({
      where: {
        bookingId: booking.id,
        status: BookingHoldStatus.ACTIVE,
        id: { not: liveReservation.id },
      },
      data: {
        status: BookingHoldStatus.RELEASED,
        releasedAt: now,
        releasedReason: 'إزالة حجوزات مؤقتة مكررة عند اعتماد الدفع',
      },
    });
    await tx.bookingHold.update({
      where: { id: liveReservation.id },
      data: {
        slotStartTime: booking.startAt,
        slotEndTime: booking.endAt,
        expiresAt,
        releasedAt: null,
        releasedReason: null,
      },
    });
    return {
      holdId: liveReservation.id,
      teamId: liveReservation.teamId,
      expiresAt,
      created: false,
    };
  }

  const availability = await evaluateAvailability(tx, {
    branchId: booking.branchId,
    serviceId: booking.serviceId,
    coverageAreaId: booking.coverageAreaId,
    vehicleSize: booking.vehicle.vehicleSize,
    addonIds: booking.addons.map(({ addonId }) => addonId),
    startAt: booking.startAt,
    excludeBookingId: booking.id,
    reservedDurationMinutes,
  }, now);
  if (!availability?.feasibleTeamIds.length) return null;

  const retained = selectRetainableVerificationHold(
    activeHolds,
    availability.feasibleTeamIds,
    booking,
    now,
  );
  await tx.bookingHold.updateMany({
    where: {
      bookingId: booking.id,
      status: BookingHoldStatus.ACTIVE,
      ...(retained ? { id: { not: retained.id } } : {}),
    },
    data: {
      status: BookingHoldStatus.RELEASED,
      releasedAt: now,
      releasedReason: 'استبدال حجز مؤقت غير صالح أثناء اعتماد الدفع',
    },
  });

  if (retained) {
    await tx.bookingHold.update({
      where: { id: retained.id },
      data: {
        slotStartTime: booking.startAt,
        slotEndTime: booking.endAt,
        expiresAt,
        releasedAt: null,
        releasedReason: null,
      },
    });
    return {
      holdId: retained.id,
      teamId: retained.teamId,
      expiresAt,
      created: false,
    };
  }

  const created = await tx.bookingHold.create({
    data: {
      bookingId: booking.id,
      teamId: availability.feasibleTeamIds[0] ?? null,
      slotStartTime: booking.startAt,
      slotEndTime: booking.endAt,
      expiresAt,
      status: BookingHoldStatus.ACTIVE,
    },
    select: { id: true, teamId: true },
  });
  return {
    holdId: created.id,
    teamId: created.teamId,
    expiresAt,
    created: true,
  };
}

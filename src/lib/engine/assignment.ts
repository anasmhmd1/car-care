import {
  AssignmentMode,
  BookingHoldStatus,
  BookingStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { db } from '@/lib/db';
import { evaluateRequestedInterval } from './availability';
import { resolveTravelMinutes, type TravelPolicy } from './operations-math';
import { localDateBoundsUtc } from './time';
import { transitionBookingStatus } from './transition';

const ASSIGNABLE_STATUSES: BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_ASSIGNMENT,
  BookingStatus.ADMIN_REVIEW_REQUIRED,
  BookingStatus.ASSIGNED,
];

export class AssignmentError extends Error {
  constructor(message: string, readonly code = 'ASSIGNMENT_FAILED') {
    super(message);
    this.name = 'AssignmentError';
  }
}

export interface AssignmentInput {
  bookingId: string;
  assignedByUserId: string;
  actorRole: UserRole;
  preferredTeamId?: string;
  reason: string;
}

export interface AssignmentResult {
  assigned: boolean;
  teamId?: string;
  teamName?: string;
  scoreLog?: Prisma.JsonObject;
  reason?: string;
  needsManualReview?: boolean;
}

export function scoreTeamForAssignment(
  currentBookingsCount: number,
  dailyCapacity: number,
): number {
  if (dailyCapacity <= 0 || currentBookingsCount >= dailyCapacity) return 0;
  return Math.round(((dailyCapacity - currentBookingsCount) / dailyCapacity) * 100);
}

/**
 * Scores live daily pressure using the number of bookings against the team's
 * configured daily capacity. Feasibility has already rejected full teams.
 */
export function scoreTeamWorkload(
  currentBookingsCount: number,
  dailyCapacity: number,
): number {
  return Math.round(scoreTeamForAssignment(currentBookingsCount, dailyCapacity) / 5);
}

export interface AssignmentRankingCandidate {
  score: number;
  assignmentPriority: number;
  routeTravelMinutes: number;
  teamId: string;
}

export function compareAssignmentCandidates(
  first: AssignmentRankingCandidate,
  second: AssignmentRankingCandidate,
) {
  // The UI contract uses the lower numeric priority only after all scoring
  // factors, including route time, are tied.
  return second.score - first.score
    || first.routeTravelMinutes - second.routeTravelMinutes
    || first.assignmentPriority - second.assignmentPriority
    || first.teamId.localeCompare(second.teamId);
}

export interface AssignmentRouteBooking {
  id: string;
  startAt: Date;
  endAt: Date;
  zoneId: string;
}

export interface TeamRouteContext {
  baseZoneId: string | null;
  usedBaseZone: boolean;
  previousBookingId: string | null;
  previousBookingEndAt: Date | null;
  nextBookingId: string | null;
  routeTravelMinutes: number;
  homeZoneMatch: boolean;
}

/**
 * Scores the actual route around a proposed booking. If the team has no
 * earlier job, its configured home zone is the route origin; coverage zones
 * are eligibility rules and must not be treated as interchangeable depots.
 */
export function resolveTeamRouteContext(input: {
  baseZoneId: string | null;
  targetZoneId: string;
  startAt: Date;
  endAt: Date;
  bookings: readonly AssignmentRouteBooking[];
  travelPolicies: readonly TravelPolicy[];
  areaOverrideMinutes?: number | null;
  branchDefaultMinutes: number;
}): TeamRouteContext {
  const previousBooking = input.bookings
    .filter((assigned) => assigned.endAt <= input.startAt)
    .sort((first, second) => second.endAt.getTime() - first.endAt.getTime())[0];
  const nextBooking = input.bookings
    .filter((assigned) => assigned.startAt >= input.endAt)
    .sort((first, second) => first.startAt.getTime() - second.startAt.getTime())[0];
  const routeLegs: number[] = [];
  const resolveRouteLeg = (fromZoneId: string, toZoneId: string) =>
    resolveTravelMinutes({
      fromZoneId,
      toZoneId,
      travelPolicies: input.travelPolicies,
      areaOverrideMinutes: input.areaOverrideMinutes,
      branchDefaultMinutes: input.branchDefaultMinutes,
    });

  if (previousBooking) {
    routeLegs.push(resolveRouteLeg(previousBooking.zoneId, input.targetZoneId));
  } else if (input.baseZoneId) {
    routeLegs.push(resolveRouteLeg(input.baseZoneId, input.targetZoneId));
  }
  if (nextBooking) {
    routeLegs.push(resolveRouteLeg(input.targetZoneId, nextBooking.zoneId));
  }

  return {
    baseZoneId: input.baseZoneId,
    usedBaseZone: !previousBooking && Boolean(input.baseZoneId),
    previousBookingId: previousBooking?.id ?? null,
    previousBookingEndAt: previousBooking?.endAt ?? null,
    nextBookingId: nextBooking?.id ?? null,
    routeTravelMinutes: routeLegs.length
      ? routeLegs.reduce((total, minutes) => total + minutes, 0)
      : input.branchDefaultMinutes,
    homeZoneMatch: input.baseZoneId === input.targetZoneId,
  };
}

function dateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function moveToManualReview(
  tx: Prisma.TransactionClient,
  bookingId: string,
  currentStatus: BookingStatus,
  input: AssignmentInput,
) {
  let status = currentStatus;
  if (status === BookingStatus.ACCEPTED) {
    await transitionBookingStatus(tx, {
      bookingId,
      toStatus: BookingStatus.AWAITING_ASSIGNMENT,
      actorUserId: input.assignedByUserId,
      actorRole: input.actorRole,
      reason: 'إحالة الحجز إلى قائمة التوزيع اليدوي',
    });
    status = BookingStatus.AWAITING_ASSIGNMENT;
  }
  if (status === BookingStatus.AWAITING_ASSIGNMENT) {
    await transitionBookingStatus(tx, {
      bookingId,
      toStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
      actorUserId: input.assignedByUserId,
      actorRole: input.actorRole,
      reason: input.reason,
      metadata: { assignmentFailure: true },
    });
  }
}

/**
 * Re-evaluates the exact interval inside the caller's transaction, ranks only
 * feasible teams, persists assignment history, converts the hold, and moves
 * the state machine to ASSIGNED. No caller may assign by writing teamId alone.
 */
export async function assignTeamToBookingInTransaction(
  tx: Prisma.TransactionClient,
  input: AssignmentInput,
): Promise<AssignmentResult> {
  const reason = input.reason.trim();
  if (!reason) throw new AssignmentError('سبب إسناد الفريق مطلوب.', 'REASON_REQUIRED');

  const booking = await tx.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    include: {
      branch: true,
      coverageArea: { include: { zone: true } },
      service: true,
      vehicle: { select: { vehicleSize: true } },
      addons: { select: { addonId: true } },
      holds: { where: { status: BookingHoldStatus.ACTIVE } },
    },
  });
  if (!booking) throw new AssignmentError('الحجز غير موجود.', 'BOOKING_NOT_FOUND');
  if (booking.terminalReopenSourceStatus) {
    throw new AssignmentError(
      'الحجز مفتوح للمراجعة الإدارية فقط ولا يمكن إسناده أو إعادة تشغيله.',
      'TERMINAL_REVIEW_ONLY',
    );
  }
  if (!ASSIGNABLE_STATUSES.includes(booking.bookingStatus)) {
    throw new AssignmentError('الحجز ليس في حالة تسمح بتوزيعه على فريق.', 'INVALID_BOOKING_STATUS');
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${booking.branchId}`}))`;

  if (booking.branch.assignmentMode === AssignmentMode.MANUAL && !input.preferredTeamId) {
    if (booking.bookingStatus === BookingStatus.ACCEPTED) {
      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.AWAITING_ASSIGNMENT,
        actorUserId: input.assignedByUserId,
        actorRole: input.actorRole,
        reason: 'الفرع يعمل بالتوزيع اليدوي',
      });
    }
    return { assigned: false, reason: 'الحجز بانتظار اختيار مدير التشغيل لفريق.', needsManualReview: true };
  }

  const availability = await evaluateRequestedInterval(tx, {
    branchId: booking.branchId,
    serviceId: booking.serviceId,
    coverageAreaId: booking.coverageAreaId,
    vehicleSize: booking.vehicle.vehicleSize,
    addonIds: booking.addons.map(({ addonId }) => addonId),
    startAt: booking.startAt,
    excludeBookingId: booking.id,
    reservedDurationMinutes: booking.totalDurationMinutes,
  });

  if (!availability?.feasibleTeamIds.length) {
    if (input.preferredTeamId) {
      throw new AssignmentError('الفريق المختار لم يعد متاحًا لهذا الموعد.', 'TEAM_NOT_FEASIBLE');
    }
    await moveToManualReview(tx, booking.id, booking.bookingStatus, input);
    return {
      assigned: false,
      reason: 'لا يوجد فريق مؤهل وخالٍ من التعارض لهذا الموعد.',
      needsManualReview: true,
    };
  }

  if (
    input.preferredTeamId &&
    !availability.feasibleTeamIds.includes(input.preferredTeamId)
  ) {
    throw new AssignmentError('الفريق المختار غير مؤهل أو لديه تعارض في الموعد.', 'TEAM_NOT_FEASIBLE');
  }

  const dayBounds = localDateBoundsUtc(
    dateInZone(booking.startAt, booking.branch.timezone),
    booking.branch.timezone,
  );
  const [candidateTeams, travelRows] = await Promise.all([
    tx.team.findMany({
      where: { id: { in: availability.feasibleTeamIds } },
      include: {
        bookings: {
          where: {
            id: { not: booking.id },
            deletedAt: null,
            startAt: { lt: dayBounds.end },
            endAt: { gt: dayBounds.start },
            bookingStatus: {
              notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED],
            },
            terminalReopenSourceStatus: null,
          },
          include: { coverageArea: { select: { zoneId: true } } },
        },
      },
    }),
    tx.zoneTravelTime.findMany({
      where: {
        // Route scoring needs every potential starting point (a neighbouring
        // booking or the configured team home zone), not merely rows that
        // happen to touch the requested zone.
        fromZone: { branchId: booking.branchId },
      },
      select: { fromZoneId: true, toZoneId: true, durationMinutes: true },
    }),
  ]);

  const ranked = candidateTeams.map((team) => {
    const currentBookingsCount = team.bookings.length;
    const routeContext = resolveTeamRouteContext({
      baseZoneId: team.baseZoneId,
      targetZoneId: booking.coverageArea.zoneId,
      startAt: booking.startAt,
      endAt: booking.endAt,
      bookings: team.bookings.map((assigned) => ({
        id: assigned.id,
        startAt: assigned.startAt,
        endAt: assigned.endAt,
        zoneId: assigned.coverageArea.zoneId,
      })),
      travelPolicies: travelRows,
      areaOverrideMinutes: booking.coverageArea.travelBufferOverride,
      branchDefaultMinutes: booking.branch.travelBufferMinutes,
    });
    const sameZone = team.bookings.some(
      (assigned) => assigned.coverageArea.zoneId === booking.coverageArea.zoneId,
    ) || routeContext.homeZoneMatch;

    const factors = {
      feasibleTime: 100,
      homeZoneBonus: routeContext.homeZoneMatch ? 35 : 0,
      sameZoneBonus: sameZone ? 30 : 0,
      travelBonus: Math.ceil(25 / (1 + routeContext.routeTravelMinutes / 15)),
      workloadBonus: scoreTeamWorkload(currentBookingsCount, team.dailyCapacity),
      earlyFinishBonus: routeContext.previousBookingEndAt
        ? Math.min(10, Math.max(0, Math.floor((booking.startAt.getTime() - routeContext.previousBookingEndAt.getTime()) / 3_600_000)))
        : 10,
      preservedHoldBonus: booking.holds.some((hold) => hold.teamId === team.id) ? 5 : 0,
    };
    return {
      team,
      score: Object.values(factors).reduce((total, value) => total + value, 0),
      factors,
      currentBookingsCount,
      dailyCapacity: team.dailyCapacity,
      assignmentPriority: team.assignmentPriority,
      routeTravelMinutes: routeContext.routeTravelMinutes,
      teamId: team.id,
      travelContext: routeContext,
    };
  }).sort(compareAssignmentCandidates);

  const selected = input.preferredTeamId
    ? ranked.find(({ team }) => team.id === input.preferredTeamId)
    : ranked[0];
  if (!selected) throw new AssignmentError('تعذر اختيار فريق صالح.', 'TEAM_NOT_FEASIBLE');

  const isReassignment = Boolean(
    booking.assignedTeamId && booking.assignedTeamId !== selected.team.id,
  );
  const scoreLog: Prisma.JsonObject = {
    totalScore: selected.score,
    teamName: selected.team.name,
    automatic: !input.preferredTeamId,
    ...selected.factors,
    currentBookingsCount: selected.currentBookingsCount,
    dailyCapacity: selected.dailyCapacity,
    travelContext: {
      baseZoneId: selected.travelContext.baseZoneId,
      usedBaseZone: selected.travelContext.usedBaseZone,
      previousBookingId: selected.travelContext.previousBookingId,
      nextBookingId: selected.travelContext.nextBookingId,
      routeTravelMinutes: selected.travelContext.routeTravelMinutes,
    },
  };

  await tx.bookingAssignment.updateMany({
    where: { bookingId: booking.id, status: 'ACTIVE' },
    data: { status: 'ENDED', endedAt: new Date() },
  });
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      assignedTeamId: selected.team.id,
      ...(isReassignment ? { assignedEmployeeId: null, operationalVehicleId: null } : {}),
    },
  });
  await tx.bookingAssignment.create({
    data: {
      bookingId: booking.id,
      teamId: selected.team.id,
      assignedByUserId: input.assignedByUserId,
      reason,
      status: 'ACTIVE',
      scoreLog,
    },
  });
  await tx.bookingAssignmentHistory.create({
    data: {
      bookingId: booking.id,
      fromTeamId: booking.assignedTeamId,
      toTeamId: selected.team.id,
      changedByUserId: input.assignedByUserId,
      action: isReassignment ? 'REASSIGNED' : input.preferredTeamId ? 'MANUAL_ASSIGNED' : 'AUTO_ASSIGNED',
      reason,
      scoreLog,
    },
  });

  await tx.bookingHold.updateMany({
    where: {
      bookingId: booking.id,
      status: BookingHoldStatus.ACTIVE,
      teamId: { not: selected.team.id },
    },
    data: {
      status: BookingHoldStatus.RELEASED,
      releasedAt: new Date(),
      releasedReason: 'تم إسناد فريق نهائي مختلف',
    },
  });
  await tx.bookingHold.updateMany({
    where: {
      bookingId: booking.id,
      teamId: selected.team.id,
      status: BookingHoldStatus.ACTIVE,
    },
    data: {
      status: BookingHoldStatus.CONVERTED,
      releasedAt: new Date(),
      releasedReason: 'تحويل الحجز المؤقت إلى إسناد نهائي',
    },
  });

  if (booking.bookingStatus !== BookingStatus.ASSIGNED) {
    await transitionBookingStatus(tx, {
      bookingId: booking.id,
      toStatus: BookingStatus.ASSIGNED,
      actorUserId: input.assignedByUserId,
      actorRole: input.actorRole,
      reason,
      metadata: { teamId: selected.team.id, scoreLog },
    });
  } else {
    await tx.auditLog.create({
      data: {
        actorUserId: input.assignedByUserId,
        actorRole: input.actorRole,
        action: isReassignment ? 'BOOKING_TEAM_REASSIGNED' : 'BOOKING_TEAM_ASSIGNMENT_REFRESHED',
        entityType: 'Booking',
        entityId: booking.id,
        beforeJson: { assignedTeamId: booking.assignedTeamId },
        afterJson: { assignedTeamId: selected.team.id, scoreLog },
        reason,
      },
    });
  }

  return {
    assigned: true,
    teamId: selected.team.id,
    teamName: selected.team.name,
    scoreLog,
  };
}

export async function assignTeamToBooking(input: AssignmentInput) {
  return db.$transaction(
    (tx) => assignTeamToBookingInTransaction(tx, input),
    {
      maxWait: 15_000,
      timeout: 60_000,
    },
  );
}

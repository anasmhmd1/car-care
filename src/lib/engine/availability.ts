import {
  BookingHoldStatus,
  BookingStatus,
  Prisma,
  VehicleSize,
} from '@prisma/client';
import { db } from '@/lib/db';
import { calculateBookingQuote } from './pricing';
import { isCoverageAreaEligible, resolveTravelMinutes } from './operations-math';
import {
  dayOfWeekForLocalDate,
  formatTimeInZone,
  intervalsOverlap,
  localDateBoundsUtc,
  localDateTimeToUtc,
  roundDurationToSlot,
} from './time';

/**
 * Converts commercial slot units into a real calendar reservation while still
 * honoring a longer measured service duration.
 */
export function calculateReservedDurationMinutes(
  serviceDurationMinutes: number,
  slotCount: number,
  slotUnitMinutes: number,
) {
  if (!Number.isFinite(serviceDurationMinutes) || serviceDurationMinutes <= 0) {
    throw new Error('serviceDurationMinutes must be positive.');
  }
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new Error('slotCount must be a positive integer.');
  }
  if (!Number.isInteger(slotUnitMinutes) || slotUnitMinutes < 1) {
    throw new Error('slotUnitMinutes must be a positive integer.');
  }
  return Math.max(
    roundDurationToSlot(serviceDurationMinutes, slotUnitMinutes),
    slotCount * slotUnitMinutes,
  );
}

/**
 * A team with no earlier booking starts its operational day at its configured
 * team hours (or the branch opening time). Its home zone therefore consumes
 * real travel time before the first customer appointment.
 */
export function canReachFirstTaskFromBase(input: {
  baseZoneId: string | null;
  targetZoneId: string;
  operationalDayStartAt: Date;
  slotStartAt: Date;
  getTravelMinutes: (fromZoneId: string, toZoneId: string) => number;
}): boolean {
  if (!input.baseZoneId) return true;
  if (input.baseZoneId === input.targetZoneId) return true;
  const travelMinutes = input.getTravelMinutes(input.baseZoneId, input.targetZoneId);
  return input.operationalDayStartAt.getTime() + travelMinutes * 60_000
    <= input.slotStartAt.getTime();
}

export const SCHEDULE_BLOCKING_STATUSES: BookingStatus[] = [
  BookingStatus.PAYMENT_VERIFIED,
  BookingStatus.AWAITING_OPERATIONS_REVIEW,
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_ASSIGNMENT,
  BookingStatus.ASSIGNED,
  BookingStatus.TEAM_ACKNOWLEDGED,
  BookingStatus.ON_THE_WAY,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
  BookingStatus.EXECUTION_FAILED,
  BookingStatus.CUSTOMER_NO_SHOW,
  BookingStatus.ACCESS_DENIED,
  BookingStatus.ADMIN_REVIEW_REQUIRED,
  BookingStatus.RESCHEDULE_REQUESTED,
  BookingStatus.CANCELLATION_REQUESTED,
];

// A completed or failed visit still consumed that day's branch/team capacity,
// even though its historical interval no longer represents future work.
export const DAILY_CAPACITY_CONSUMING_STATUSES: BookingStatus[] = [
  ...SCHEDULE_BLOCKING_STATUSES,
];

export interface SlotRequest {
  branchId: string;
  serviceId: string;
  vehicleSize?: string;
  addonIds?: string[];
  coverageAreaId: string;
  dateStr: string;
  /** Excludes the booking's own provisional hold during assignment/re-scheduling. */
  excludeBookingId?: string;
}

export interface AvailableSlot {
  timeStr: string;
  startAt: Date;
  endAt: Date;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  totalDurationMinutes: number;
}

export interface FeasibleInterval {
  branchId: string;
  totalDurationMinutes: number;
  slotCount: number;
  basePrice: number;
  addonPrice: number;
  totalPrice: number;
  depositAmount: number;
  serviceVariantId: string | null;
  addonRecords: Array<{ id: string; nameAr: string; price: number; durationMinutes: number; slotCount: number }>;
  feasibleTeamIds: string[];
}

function normalizeVehicleSize(value?: string): VehicleSize | undefined {
  return value && Object.values(VehicleSize).includes(value as VehicleSize)
    ? value as VehicleSize
    : undefined;
}

async function expireStaleHolds(tx: Prisma.TransactionClient, now: Date) {
  await tx.bookingHold.updateMany({
    where: {
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { lte: now },
      // A terminal booking reopened for owner review is intentionally
      // review-only. Preserve its holds and financial/operational evidence
      // until the owner closes that review instead of reconciling them as a
      // side effect of another booking's availability request.
      booking: { terminalReopenSourceStatus: null },
    },
    data: {
      status: BookingHoldStatus.EXPIRED,
      releasedAt: now,
      releasedReason: 'Automatic expiry during availability calculation',
    },
  });
}

async function loadAvailabilityContext(
  tx: Prisma.TransactionClient,
  request: SlotRequest,
  now: Date,
) {
  const addonIds = [...new Set(request.addonIds ?? [])];
  const vehicleSize = normalizeVehicleSize(request.vehicleSize);
  const dayOfWeek = dayOfWeekForLocalDate(request.dateStr);

  await expireStaleHolds(tx, now);

  const [branch, area, service, branchService] = await Promise.all([
    tx.branch.findFirst({
      where: { id: request.branchId, status: 'ACTIVE' },
      include: {
        workingHours: true,
        blackoutDates: true,
      },
    }),
    tx.coverageArea.findUnique({
      where: { id: request.coverageAreaId },
      include: { zone: true },
    }),
    tx.service.findFirst({
      where: { id: request.serviceId, active: true, bookableOnline: true },
      include: { variants: true },
    }),
    tx.branchService.findUnique({
      where: { branchId_serviceId: { branchId: request.branchId, serviceId: request.serviceId } },
    }),
  ]);

  if (!branch || !area || !service) return null;
  if (!isCoverageAreaEligible(
    { active: area.active, branchId: area.zone.branchId },
    request.branchId,
  )) return null;
  if (branchService && (!branchService.active || !branchService.bookableOnline)) return null;

  const isBlackout = branch.blackoutDates.some((blackout) =>
    blackout.date.toISOString().slice(0, 10) === request.dateStr,
  );
  const branchHours = branch.workingHours.find((hours) => hours.dayOfWeek === dayOfWeek);
  if (isBlackout || !branchHours || branchHours.isClosed) return null;

  const variant = vehicleSize
    ? service.variants.find((candidate) => candidate.vehicleSize === vehicleSize)
    : undefined;
  const linkedAddons = addonIds.length
    ? await tx.serviceAddon.findMany({
        where: {
          id: { in: addonIds },
          active: true,
          serviceLinks: { some: { serviceId: service.id } },
        },
      })
    : [];
  if (linkedAddons.length !== addonIds.length) return null;

  const quote = calculateBookingQuote({
    base: {
      price: branchService?.priceOverride ?? variant?.price ?? service.basePrice,
      durationMinutes: branchService?.durationOverrideMinutes ?? variant?.durationMinutes ?? service.durationMinutes,
      slotCount: variant?.slotCount ?? service.slotCount,
    },
    addons: linkedAddons,
    depositRequired: service.requiresDeposit,
    fullPrepayment: service.requiresFullPrepayment,
    depositType: service.depositType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
    depositValue: variant?.depositValue ?? service.depositValue,
  });
  const totalDurationMinutes = calculateReservedDurationMinutes(
    quote.totalDurationMinutes,
    quote.slotCount,
    branch.slotUnitMinutes,
  );
  const dayBounds = localDateBoundsUtc(request.dateStr, branch.timezone);

  const [teams, travelTimes, branchActiveBookings, branchBookings, branchHolds] = await Promise.all([
    tx.team.findMany({
      where: {
        branchId: branch.id,
        active: true,
        OR: [
          { capabilities: { none: {} } },
          { capabilities: { some: { serviceId: service.id } } },
        ],
      },
      include: {
        members: {
          where: { user: { active: true, deletedAt: null } },
          include: {
            user: {
              select: {
                employeeTimeOff: {
                  where: { startDate: { lt: dayBounds.end }, endDate: { gt: dayBounds.start } },
                },
              },
            },
          },
        },
        workingHours: { where: { dayOfWeek } },
        timeOff: { where: { startDate: { lt: dayBounds.end }, endDate: { gt: dayBounds.start } } },
        teamZones: true,
        bookings: {
          where: {
            id: request.excludeBookingId ? { not: request.excludeBookingId } : undefined,
            startAt: { lt: dayBounds.end },
            endAt: { gt: dayBounds.start },
            bookingStatus: { in: SCHEDULE_BLOCKING_STATUSES },
            terminalReopenSourceStatus: null,
            deletedAt: null,
          },
          include: { coverageArea: { select: { zoneId: true } } },
        },
        holds: {
          where: {
            bookingId: request.excludeBookingId ? { not: request.excludeBookingId } : undefined,
            status: BookingHoldStatus.ACTIVE,
            expiresAt: { gt: now },
            slotStartTime: { lt: dayBounds.end },
            slotEndTime: { gt: dayBounds.start },
          },
        },
      },
      orderBy: [{ assignmentPriority: 'asc' }, { id: 'asc' }],
    }),
    tx.zoneTravelTime.findMany({
      where: {
        OR: [{ fromZoneId: area.zoneId }, { toZoneId: area.zoneId }],
      },
    }),
    tx.booking.count({
      where: {
        id: request.excludeBookingId ? { not: request.excludeBookingId } : undefined,
        branchId: branch.id,
        startAt: { gte: dayBounds.start, lt: dayBounds.end },
        deletedAt: null,
        OR: [
          {
            bookingStatus: { in: DAILY_CAPACITY_CONSUMING_STATUSES },
            terminalReopenSourceStatus: null,
          },
          { holds: { some: { status: BookingHoldStatus.ACTIVE, expiresAt: { gt: now } } } },
        ],
      },
    }),
    tx.booking.findMany({
      where: {
        id: request.excludeBookingId ? { not: request.excludeBookingId } : undefined,
        branchId: branch.id,
        startAt: { lt: dayBounds.end },
        endAt: { gt: dayBounds.start },
        bookingStatus: { in: SCHEDULE_BLOCKING_STATUSES },
        terminalReopenSourceStatus: null,
        deletedAt: null,
      },
      select: { id: true, startAt: true, endAt: true, assignedTeamId: true },
    }),
    tx.bookingHold.findMany({
      where: {
        bookingId: request.excludeBookingId ? { not: request.excludeBookingId } : undefined,
        status: BookingHoldStatus.ACTIVE,
        expiresAt: { gt: now },
        slotStartTime: { lt: dayBounds.end },
        slotEndTime: { gt: dayBounds.start },
        booking: { branchId: branch.id },
      },
      select: { id: true, teamId: true, slotStartTime: true, slotEndTime: true },
    }),
  ]);

  if (branchActiveBookings >= branch.dailyBookingLimit) return null;

  const getTravelMinutes = (fromZoneId: string, toZoneId: string) =>
    resolveTravelMinutes({
      fromZoneId,
      toZoneId,
      travelPolicies: travelTimes,
      areaOverrideMinutes: area.travelBufferOverride,
      branchDefaultMinutes: branch.travelBufferMinutes,
      sameZoneDefaultMinutes: 0,
    });

  return {
    area,
    branch,
    branchHours,
    service,
    variant,
    linkedAddons,
    quote,
    totalDurationMinutes,
    teams,
    branchBookings,
    branchHolds,
    getTravelMinutes,
    dayOfWeek,
  };
}

type AvailabilityContext = NonNullable<Awaited<ReturnType<typeof loadAvailabilityContext>>>;

function findFeasibleTeamIds(
  context: AvailabilityContext,
  slotStart: Date,
  slotEnd: Date,
): string[] {
  const {
    area,
    branch,
    branchHours,
    teams,
    getTravelMinutes,
  } = context;
  const feasible: string[] = [];

  for (const team of teams) {
    if (team.teamZones.length && !team.teamZones.some((teamZone) => teamZone.zoneId === area.zoneId)) continue;
    if (team.timeOff.some((timeOff) => intervalsOverlap(slotStart, slotEnd, timeOff.startDate, timeOff.endDate))) continue;

    const teamHours = team.workingHours[0];
    if (teamHours) {
      if (teamHours.isOff) continue;
      const openTime = teamHours.openTime || branchHours.openTime;
      const closeTime = teamHours.closeTime || branchHours.closeTime;
      const teamStart = localDateTimeToUtc(
        formatDateInZone(slotStart, branch.timezone),
        openTime,
        branch.timezone,
      );
      const teamEnd = localDateTimeToUtc(
        formatDateInZone(slotStart, branch.timezone),
        closeTime,
        branch.timezone,
      );
      if (slotStart < teamStart || slotStart > teamEnd) continue;
      const effectiveBreakStart = teamHours.breakStartTime?.trim() || branchHours.breakStartTime?.trim();
      const effectiveBreakEnd = teamHours.breakEndTime?.trim() || branchHours.breakEndTime?.trim();
      if (effectiveBreakStart && effectiveBreakEnd) {
        const breakStart = localDateTimeToUtc(formatDateInZone(slotStart, branch.timezone), effectiveBreakStart, branch.timezone);
        const breakEnd = localDateTimeToUtc(formatDateInZone(slotStart, branch.timezone), effectiveBreakEnd, branch.timezone);
        if (intervalsOverlap(slotStart, slotEnd, breakStart, breakEnd)) continue;
      }
    } else {
      const branchStart = localDateTimeToUtc(
        formatDateInZone(slotStart, branch.timezone),
        branchHours.openTime,
        branch.timezone,
      );
      const branchEnd = localDateTimeToUtc(
        formatDateInZone(slotStart, branch.timezone),
        branchHours.closeTime,
        branch.timezone,
      );
      if (slotStart < branchStart || slotStart > branchEnd) continue;
      if (branchHours.breakStartTime && branchHours.breakEndTime && branchHours.breakStartTime.trim() && branchHours.breakEndTime.trim()) {
        const breakStart = localDateTimeToUtc(formatDateInZone(slotStart, branch.timezone), branchHours.breakStartTime, branch.timezone);
        const breakEnd = localDateTimeToUtc(formatDateInZone(slotStart, branch.timezone), branchHours.breakEndTime, branch.timezone);
        if (intervalsOverlap(slotStart, slotEnd, breakStart, breakEnd)) continue;
      }
    }

    const restBufferMs = (branch.restBufferMinutes ?? 0) * 60_000;

    if (team.holds.some((hold) => intervalsOverlap(slotStart, slotEnd, hold.slotStartTime, hold.slotEndTime))) continue;
    if (team.bookings.some((booking) => intervalsOverlap(slotStart, slotEnd, booking.startAt, booking.endAt))) continue;

    const previous = team.bookings
      .filter((booking) => booking.endAt <= slotStart)
      .toSorted((first, second) => second.endAt.getTime() - first.endAt.getTime())[0];
    if (previous) {
      const requiredTravel = getTravelMinutes(previous.coverageArea.zoneId, area.zoneId);
      const effectiveTravelMinutes = Math.max(requiredTravel, branch.travelBufferMinutes || 15);
      const totalBufferMs = effectiveTravelMinutes * 60_000 + restBufferMs;
      if (previous.endAt.getTime() + totalBufferMs > slotStart.getTime()) continue;
    }

    const next = team.bookings
      .filter((booking) => booking.startAt >= slotEnd)
      .toSorted((first, second) => first.startAt.getTime() - second.startAt.getTime())[0];
    if (next) {
      const requiredTravel = getTravelMinutes(area.zoneId, next.coverageArea.zoneId);
      const effectiveTravelMinutes = Math.max(requiredTravel, branch.travelBufferMinutes || 15);
      const totalBufferMs = effectiveTravelMinutes * 60_000 + restBufferMs;
      if (slotEnd.getTime() + totalBufferMs > next.startAt.getTime()) continue;
    }

    if (restBufferMs > 0) {
      const previousHold = team.holds
        .filter((hold) => hold.slotEndTime <= slotStart)
        .toSorted((first, second) => second.slotEndTime.getTime() - first.slotEndTime.getTime())[0];
      if (previousHold && previousHold.slotEndTime.getTime() + restBufferMs > slotStart.getTime()) {
        continue;
      }

      const nextHold = team.holds
        .filter((hold) => hold.slotStartTime >= slotEnd)
        .toSorted((first, second) => first.slotStartTime.getTime() - second.slotStartTime.getTime())[0];
      if (nextHold && slotEnd.getTime() + restBufferMs > nextHold.slotStartTime.getTime()) {
        continue;
      }
    }

    feasible.push(team.id);
  }

  return feasible;
}

function formatDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function evaluateRequestedInterval(
  tx: Prisma.TransactionClient,
  request: Omit<SlotRequest, 'dateStr'> & {
    startAt: Date;
    reservedDurationMinutes?: number;
  },
  now = new Date(),
): Promise<FeasibleInterval | null> {
  const branch = await tx.branch.findUnique({ where: { id: request.branchId }, select: { timezone: true } });
  if (!branch) return null;
  const dateStr = formatDateInZone(request.startAt, branch.timezone);
  const context = await loadAvailabilityContext(tx, { ...request, dateStr }, now);
  if (!context) return null;
  const totalDurationMinutes = request.reservedDurationMinutes ?? context.totalDurationMinutes;
  if (!Number.isInteger(totalDurationMinutes) || totalDurationMinutes < 1) return null;
  const endAt = new Date(request.startAt.getTime() + totalDurationMinutes * 60_000);

  const branchOpen = localDateTimeToUtc(dateStr, context.branchHours.openTime, context.branch.timezone);
  const branchClose = localDateTimeToUtc(dateStr, context.branchHours.closeTime, context.branch.timezone);
  if (request.startAt < branchOpen || request.startAt > branchClose) return null;

  const slotUnit = Math.max(15, context.branch.slotUnitMinutes || 30);
  const offsetFromOpenMinutes = Math.round((request.startAt.getTime() - branchOpen.getTime()) / 60_000);
  if (offsetFromOpenMinutes < 0 || offsetFromOpenMinutes % slotUnit !== 0) {
    return null;
  }

  if (context.branchHours.breakStartTime && context.branchHours.breakEndTime && context.branchHours.breakStartTime.trim() && context.branchHours.breakEndTime.trim()) {
    const breakStart = localDateTimeToUtc(dateStr, context.branchHours.breakStartTime, context.branch.timezone);
    const breakEnd = localDateTimeToUtc(dateStr, context.branchHours.breakEndTime, context.branch.timezone);
    if (intervalsOverlap(request.startAt, endAt, breakStart, breakEnd)) return null;
  }

  const concurrentBookings = context.branchBookings.filter((b) => intervalsOverlap(request.startAt, endAt, b.startAt, b.endAt)).length;
  const concurrentHolds = context.branchHolds.filter((h) => intervalsOverlap(request.startAt, endAt, h.slotStartTime, h.slotEndTime)).length;
  const totalConcurrent = concurrentBookings + concurrentHolds;
  const maxConcurrency = Math.max(1, context.teams.length);

  if (context.teams.length > 0 && totalConcurrent >= maxConcurrency) {
    return null;
  }

  const feasibleTeamIds = findFeasibleTeamIds(context, request.startAt, endAt);
  if (context.teams.length > 0 && !feasibleTeamIds.length) {
    return null;
  }

  return {
    branchId: context.branch.id,
    totalDurationMinutes,
    slotCount: context.quote.slotCount,
    basePrice: context.quote.basePrice,
    addonPrice: context.quote.addonPrice,
    totalPrice: context.quote.totalPrice,
    depositAmount: context.quote.depositAmount,
    serviceVariantId: context.variant?.id ?? null,
    addonRecords: context.linkedAddons,
    feasibleTeamIds,
  };
}

export async function calculateAvailableSlots(request: SlotRequest): Promise<AvailableSlot[]> {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const context = await loadAvailabilityContext(tx, request, now);
    if (!context) return [];

    const { branch, branchHours, totalDurationMinutes, teams, branchBookings, branchHolds } = context;
    const openAt = localDateTimeToUtc(request.dateStr, branchHours.openTime, branch.timezone);
    const closeAt = localDateTimeToUtc(request.dateStr, branchHours.closeTime, branch.timezone);
    const hasBreak = Boolean(
      branchHours.breakStartTime &&
      branchHours.breakEndTime &&
      branchHours.breakStartTime.trim() &&
      branchHours.breakEndTime.trim()
    );
    const breakStart = hasBreak
      ? localDateTimeToUtc(request.dateStr, branchHours.breakStartTime!, branch.timezone)
      : null;
    const breakEnd = hasBreak
      ? localDateTimeToUtc(request.dateStr, branchHours.breakEndTime!, branch.timezone)
      : null;
    const durationMs = totalDurationMinutes * 60_000;
    const travelGapMinutes = branch.travelBufferMinutes ?? 15;
    const restGapMinutes = branch.restBufferMinutes ?? 0;
    const totalGapMinutes = Math.max(0, travelGapMinutes + restGapMinutes);
    const gapMs = totalGapMinutes * 60_000;

    const candidateStartMs = new Set<number>();

    // 1. Generate partitioned operational slots from opening time with slotUnitMs stride (up to closing time)
    const slotUnitMs = Math.max(15, branch.slotUnitMinutes || 30) * 60_000;
    for (let startMs = openAt.getTime(); startMs <= closeAt.getTime(); startMs += slotUnitMs) {
      const startAt = new Date(startMs);
      const endAt = new Date(startMs + durationMs);
      if (endAt.getTime() > closeAt.getTime()) continue;
      if (breakStart && breakEnd && intervalsOverlap(startAt, endAt, breakStart, breakEnd)) {
        continue;
      }
      candidateStartMs.add(startMs);
    }

    // 2. Also consider candidate slots immediately after existing team bookings + transit gap (aligned to slot units)
    for (const team of teams) {
      for (const booking of team.bookings) {
        const rawNextStartMs = booking.endAt.getTime() + gapMs;
        const offsetFromOpen = rawNextStartMs - openAt.getTime();
        const alignedOffset = Math.ceil(offsetFromOpen / slotUnitMs) * slotUnitMs;
        const nextStartMs = openAt.getTime() + Math.max(0, alignedOffset);
        if (nextStartMs >= openAt.getTime() && nextStartMs <= closeAt.getTime()) {
          const nextStart = new Date(nextStartMs);
          const nextEnd = new Date(nextStartMs + durationMs);
          if (nextEnd.getTime() <= closeAt.getTime()) {
            if (breakStart && breakEnd && intervalsOverlap(nextStart, nextEnd, breakStart, breakEnd)) {
              continue;
            }
            candidateStartMs.add(nextStartMs);
          }
        }
      }
    }

    const sortedStartMs = Array.from(candidateStartMs).sort((a, b) => a - b);
    const slots: AvailableSlot[] = [];

    for (const startMs of sortedStartMs) {
      const startAt = new Date(startMs);
      const endAt = new Date(startMs + durationMs);
      if (startAt <= now) continue;
      if (breakStart && breakEnd && intervalsOverlap(startAt, endAt, breakStart, breakEnd)) continue;

      const concurrentBookings = branchBookings.filter((b) => intervalsOverlap(startAt, endAt, b.startAt, b.endAt)).length;
      const concurrentHolds = branchHolds.filter((h) => intervalsOverlap(startAt, endAt, h.slotStartTime, h.slotEndTime)).length;
      const totalConcurrent = concurrentBookings + concurrentHolds;

      if (teams.length > 0) {
        const feasibleTeams = findFeasibleTeamIds(context, startAt, endAt);
        if (!feasibleTeams.length) {
          continue;
        }
      } else if (totalConcurrent >= branch.dailyBookingLimit) {
        continue;
      }

      slots.push({
        timeStr: formatTimeInZone(startAt, branch.timezone),
        startAt,
        endAt,
        arrivalWindowStart: formatTimeInZone(startAt, branch.timezone),
        arrivalWindowEnd: formatTimeInZone(
          new Date(startAt.getTime() + branch.arrivalWindowMinutes * 60_000),
          branch.timezone,
        ),
        totalDurationMinutes,
      });
    }

    return slots;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 15000,
    maxWait: 5000,
  });
}

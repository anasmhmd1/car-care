import 'server-only';

import {
  BookingStatus,
  PaymentStatus,
  RefundStatus,
  SubscriptionPaymentProofStatus,
  SubscriptionStatus,
  TimeChangeStatus,
  VisitLedgerAction,
  type Prisma,
} from '@prisma/client';
import { db } from '@/lib/db';
import { localDateBoundsUtc } from '@/lib/engine/time';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import {
  REPORT_TIME_ZONE,
  reportDateRange,
  type ReportFilters,
} from '@/lib/reports/filters';
import type {
  CompletionRateRow,
  CountRow,
  CountValueRow,
  ReportFilterOptions,
  ReportsResult,
  RevenueRow,
} from '@/lib/reports/types';

const COMPLETED_STATUSES = new Set<BookingStatus>([
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
]);

const NON_UTILIZED_STATUSES = new Set<BookingStatus>([
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
]);

const PARTIAL_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.AMOUNT_SHORT,
  PaymentStatus.PARTIALLY_PAID,
]);

const COMPLETED_REFUND_STATUSES = [
  RefundStatus.PARTIALLY_REFUNDED,
  RefundStatus.REFUNDED,
] as const;

const COMPLETION_HISTORY_STATUSES = [
  BookingStatus.QUALITY_REVIEW,
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
] as const;

const COMPLETION_HISTORY_STATUS_SET = new Set<BookingStatus>(COMPLETION_HISTORY_STATUSES);
const NON_COLLECTIBLE_STATUSES = new Set<BookingStatus>([
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.CLOSED,
]);

const bookingReportSelect = {
  id: true,
  customerId: true,
  bookingNumber: true,
  startAt: true,
  endAt: true,
  totalDurationMinutes: true,
  totalPrice: true,
  amountPaid: true,
  amountDue: true,
  bookingStatus: true,
  terminalReopenSourceStatus: true,
  paymentStatus: true,
  branch: {
    select: {
      id: true,
      nameAr: true,
      arrivalWindowMinutes: true,
    },
  },
  service: { select: { id: true, nameAr: true } },
  coverageArea: {
    select: {
      compound: true,
      zone: { select: { id: true, name: true } },
    },
  },
  assignedTeam: {
    select: {
      id: true,
      name: true,
      members: {
        select: { user: { select: { id: true, fullName: true } } },
      },
    },
  },
  assignedEmployee: {
    select: { id: true, fullName: true },
  },
  statusHistory: {
    where: {
      toStatus: {
        in: [
          BookingStatus.ARRIVED,
          BookingStatus.IN_SERVICE,
          ...COMPLETION_HISTORY_STATUSES,
        ],
      },
    },
    orderBy: { createdAt: 'asc' as const },
    select: {
      toStatus: true,
      createdAt: true,
      changedByUser: { select: { id: true, fullName: true } },
    },
  },
  checklistInstances: {
    select: { results: { select: { isChecked: true } } },
  },
  qualityReview: { select: { returnedToTeam: true } },
  complaints: { select: { id: true, createdAt: true } },
} satisfies Prisma.BookingSelect;

type BookingReportRecord = Prisma.BookingGetPayload<{
  select: typeof bookingReportSelect;
}>;

function effectiveBookingStatus(booking: BookingReportRecord): BookingStatus {
  return booking.terminalReopenSourceStatus ?? booking.bookingStatus;
}

interface GroupIdentity {
  id: string;
  label: string;
}

type ReportBranchScope = readonly string[] | null;

function branchFilter(
  filters: ReportFilters,
  allowedBranchIds: ReportBranchScope,
): string | { in: string[] } | undefined {
  if (allowedBranchIds === null) return filters.branchId;
  if (filters.branchId) {
    return allowedBranchIds.includes(filters.branchId)
      ? filters.branchId
      : { in: [] };
  }
  return { in: [...allowedBranchIds] };
}

function bookingDimensions(
  filters: ReportFilters,
  allowedBranchIds: ReportBranchScope = null,
): Prisma.BookingWhereInput {
  return {
    deletedAt: null,
    branchId: branchFilter(filters, allowedBranchIds),
    ...(filters.teamId ? { assignedTeamId: filters.teamId } : {}),
    ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
    ...(filters.zoneId ? { coverageArea: { zoneId: filters.zoneId } } : {}),
    ...(filters.bookingStatus ? {
      OR: [
        { terminalReopenSourceStatus: filters.bookingStatus },
        {
          terminalReopenSourceStatus: null,
          bookingStatus: filters.bookingStatus,
        },
      ],
    } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
  };
}

function subscriptionDimensions(
  filters: ReportFilters,
  allowedBranchIds: ReportBranchScope = null,
): Prisma.CustomerSubscriptionWhereInput {
  const needsBookingMatch = Boolean(
    filters.teamId
    || filters.zoneId
    || filters.bookingStatus
    || filters.paymentStatus,
  );

  return {
    branchId: branchFilter(filters, allowedBranchIds),
    ...(filters.serviceId
      ? { plan: { services: { some: { serviceId: filters.serviceId } } } }
      : {}),
    ...(needsBookingMatch ? { bookings: { some: bookingDimensions(filters, allowedBranchIds) } } : {}),
  };
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentageChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

function completionRows(
  values: Map<string, { label: string; assigned: number; completed: number }>,
): CompletionRateRow[] {
  return [...values.entries()]
    .map(([id, value]) => ({
      id,
      ...value,
      completionRate: percent(value.completed, value.assigned),
    }))
    .sort((left, right) => (
      right.completionRate - left.completionRate
      || right.completed - left.completed
      || right.assigned - left.assigned
      || left.label.localeCompare(right.label, 'ar')
    ));
}

function calendarDates(from: string, to: string): string[] {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const last = Date.UTC(toYear, toMonth - 1, toDay);
  const dates: string[] = [];
  while (cursor.getTime() <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function comparisonRangeFor(filters: ReportFilters): { gte: Date; lt: Date } {
  const dates = calendarDates(filters.from, filters.to);
  const previousTo = new Date(`${filters.from}T00:00:00.000Z`);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - dates.length + 1);
  return {
    gte: localDateBoundsUtc(previousFrom.toISOString().slice(0, 10), REPORT_TIME_ZONE).start,
    lt: localDateBoundsUtc(previousTo.toISOString().slice(0, 10), REPORT_TIME_ZONE).end,
  };
}

function groupBookings(
  bookings: BookingReportRecord[],
  identityFor: (booking: BookingReportRecord) => GroupIdentity,
): CountValueRow[] {
  const groups = new Map<string, CountValueRow>();
  for (const booking of bookings) {
    const identity = identityFor(booking);
    const current = groups.get(identity.id) ?? {
      ...identity,
      count: 0,
      bookingValue: 0,
      collected: 0,
    };
    current.count += 1;
    current.bookingValue += booking.totalPrice;
    current.collected += booking.amountPaid;
    groups.set(identity.id, current);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

function groupRevenue<T>(
  rows: T[],
  amountFor: (row: T) => number,
  identityFor: (row: T) => GroupIdentity,
): RevenueRow[] {
  const groups = new Map<string, RevenueRow>();
  for (const row of rows) {
    const identity = identityFor(row);
    const current = groups.get(identity.id) ?? { ...identity, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amountFor(row);
    groups.set(identity.id, current);
  }
  return [...groups.values()].sort((left, right) => right.amount - left.amount);
}

function groupCounts<T>(
  rows: T[],
  identityFor: (row: T) => GroupIdentity,
): CountRow[] {
  const groups = new Map<string, CountRow>();
  for (const row of rows) {
    const identity = identityFor(row);
    const current = groups.get(identity.id) ?? { ...identity, count: 0 };
    current.count += 1;
    groups.set(identity.id, current);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

export async function getReportFilterOptions(
  allowedBranchIds: ReportBranchScope = null,
): Promise<ReportFilterOptions> {
  const scopedBranchWhere = allowedBranchIds === null ? {} : { id: { in: [...allowedBranchIds] } };
  const scopedRelationWhere = allowedBranchIds === null ? {} : { branchId: { in: [...allowedBranchIds] } };
  const [branches, teams, services, zones] = await Promise.all([
    db.branch.findMany({
      where: scopedBranchWhere,
      orderBy: { nameAr: 'asc' },
      select: { id: true, nameAr: true },
    }),
    db.team.findMany({
      where: scopedRelationWhere,
      orderBy: [{ branch: { nameAr: 'asc' } }, { name: 'asc' }],
      select: { id: true, name: true, branchId: true, branch: { select: { nameAr: true } } },
    }),
    db.service.findMany({
      orderBy: { nameAr: 'asc' },
      select: { id: true, nameAr: true },
    }),
    db.coverageZone.findMany({
      where: scopedRelationWhere,
      orderBy: [{ branch: { nameAr: 'asc' } }, { name: 'asc' }],
      select: { id: true, name: true, branchId: true, branch: { select: { nameAr: true } } },
    }),
  ]);

  return {
    branches: branches.map((branch) => ({ id: branch.id, label: branch.nameAr })),
    teams: teams.map((team) => ({
      id: team.id,
      branchId: team.branchId,
      label: `${team.name} — ${team.branch.nameAr}`,
    })),
    services: services.map((service) => ({ id: service.id, label: service.nameAr })),
    zones: zones.map((zone) => ({
      id: zone.id,
      branchId: zone.branchId,
      label: `${zone.name} — ${zone.branch.nameAr}`,
    })),
  };
}

export async function buildReports(
  filters: ReportFilters,
  allowedBranchIds: ReportBranchScope = null,
): Promise<ReportsResult> {
  await expireActiveSubscriptions({ branchIds: allowedBranchIds });
  const generatedAt = new Date();
  const dateRange = reportDateRange(filters);
  const comparisonDateRange = comparisonRangeFor(filters);
  const dimensions = bookingDimensions(filters, allowedBranchIds);
  const subscriptionWhere = subscriptionDimensions(filters, allowedBranchIds);
  const bookingWhere: Prisma.BookingWhereInput = { ...dimensions, startAt: dateRange };

  const capacityWhere: Prisma.TeamWhereInput = {
    active: true,
    branchId: branchFilter(filters, allowedBranchIds),
    ...(filters.teamId ? { id: filters.teamId } : {}),
    ...(filters.serviceId ? { capabilities: { some: { serviceId: filters.serviceId } } } : {}),
    ...(filters.zoneId ? { teamZones: { some: { zoneId: filters.zoneId } } } : {}),
  };

  const [
    bookings,
    payments,
    refunds,
    comparisonPayments,
    comparisonRefunds,
    cancellationRequests,
    approvedTimeChanges,
    activeSubscriptions,
    newSubscriptions,
    expiredSubscriptions,
    remainingVisits,
    visitLedger,
    capacityTeams,
    activationAudits,
    customerRatings,
  ] = await Promise.all([
    db.booking.findMany({
      where: bookingWhere,
      orderBy: { startAt: 'asc' },
      select: {
        ...bookingReportSelect,
        customer: {
          select: {
            bookings: {
              where: {
                deletedAt: null,
                startAt: { lt: dateRange.gte },
                bookingStatus: { notIn: [...NON_UTILIZED_STATUSES] },
                terminalReopenSourceStatus: null,
              },
              select: { id: true },
              take: 1,
            },
          },
        },
        complaints: {
          where: { createdAt: dateRange },
          select: { id: true, createdAt: true },
        },
      },
    }),
    db.payment.findMany({
      where: { createdAt: dateRange, booking: dimensions },
      select: {
        amount: true,
        booking: {
          select: {
            service: { select: { id: true, nameAr: true } },
            branch: { select: { id: true, nameAr: true } },
            assignedTeam: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.refund.findMany({
      where: {
        createdAt: dateRange,
        status: { in: [...COMPLETED_REFUND_STATUSES] },
        booking: dimensions,
      },
      select: { amount: true },
    }),
    db.payment.aggregate({
      where: { createdAt: comparisonDateRange, booking: dimensions },
      _sum: { amount: true },
    }),
    db.refund.aggregate({
      where: {
        createdAt: comparisonDateRange,
        status: { in: [...COMPLETED_REFUND_STATUSES] },
        booking: dimensions,
      },
      _sum: { amount: true },
    }),
    db.cancellationRequest.findMany({
      where: { createdAt: dateRange, booking: dimensions },
      select: {
        bookingId: true,
        reason: true,
        responsibleParty: true,
        resolutionType: true,
      },
    }),
    db.bookingTimeChange.findMany({
      where: {
        status: TimeChangeStatus.APPROVED,
        OR: [
          { reviewedAt: dateRange },
          { reviewedAt: null, createdAt: dateRange },
        ],
        booking: dimensions,
      },
      select: { bookingId: true },
    }),
    db.customerSubscription.count({
      where: {
        ...subscriptionWhere,
        status: SubscriptionStatus.ACTIVE,
        endDate: { gt: generatedAt },
      },
    }),
    db.customerSubscription.count({
      where: { ...subscriptionWhere, createdAt: dateRange },
    }),
    db.customerSubscription.count({
      where: {
        ...subscriptionWhere,
        status: SubscriptionStatus.EXPIRED,
        endDate: dateRange,
      },
    }),
    db.customerSubscription.aggregate({
      where: {
        ...subscriptionWhere,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN] },
      },
      _sum: { remainingVisits: true },
    }),
    db.subscriptionVisitLedger.findMany({
      where: {
        action: VisitLedgerAction.BOOKING_COMPLETED,
        createdAt: dateRange,
        subscription: subscriptionWhere,
        booking: { is: dimensions },
      },
      select: { visitChange: true },
    }),
    db.team.findMany({
      where: capacityWhere,
      select: {
        dailyCapacity: true,
        workingHours: { select: { dayOfWeek: true, isOff: true } },
        timeOff: {
          where: { startDate: { lt: dateRange.lt }, endDate: { gt: dateRange.gte } },
          select: { startDate: true, endDate: true },
        },
        branch: {
          select: {
            workingHours: { select: { dayOfWeek: true, isClosed: true } },
            blackoutDates: {
              where: { date: dateRange },
              select: { date: true },
            },
          },
        },
      },
    }),
    db.auditLog.findMany({
      where: {
        entityType: 'CustomerSubscription',
        action: 'SUBSCRIPTION_ACTIVATED',
        createdAt: dateRange,
      },
      select: { entityId: true },
    }),
    db.customerServiceRating.findMany({
      where: {
        createdAt: dateRange,
        booking: bookingWhere,
      },
      select: {
        score: true,
        approvedForPublic: true,
        booking: {
          select: {
            service: { select: { id: true, nameAr: true } },
            branch: { select: { id: true, nameAr: true } },
          },
        },
      },
    }),
  ]);

  const activatedIds = [...new Set(activationAudits.map((audit) => audit.entityId))];
  const activatedSubscriptions = activatedIds.length > 0
    ? await db.customerSubscription.findMany({
        where: { ...subscriptionWhere, id: { in: activatedIds } },
        select: {
          id: true,
          paymentProofs: {
            where: { status: SubscriptionPaymentProofStatus.APPROVED },
            orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { amountSubmitted: true },
          },
        },
      })
    : [];

  const byStatus = groupCounts(bookings, (booking) => ({
    id: effectiveBookingStatus(booking),
    label: effectiveBookingStatus(booking),
  }));
  const byService = groupBookings(bookings, (booking) => ({
    id: booking.service.id,
    label: booking.service.nameAr,
  }));
  const byBranch = groupBookings(bookings, (booking) => ({
    id: booking.branch.id,
    label: booking.branch.nameAr,
  }));
  const byZone = groupBookings(bookings, (booking) => ({
    id: booking.coverageArea.zone.id,
    label: booking.coverageArea.zone.name,
  }));
  const byTeam = groupBookings(bookings, (booking) => ({
    id: booking.assignedTeam?.id ?? 'unassigned',
    label: booking.assignedTeam?.name ?? 'غير مسند',
  }));

  const paymentTotal = payments.reduce((total, payment) => total + payment.amount, 0);
  const refundTotal = refunds.reduce((total, refund) => total + refund.amount, 0);
  const comparisonNetCollected = (comparisonPayments._sum.amount ?? 0)
    - (comparisonRefunds._sum.amount ?? 0);
  const netCollected = paymentTotal - refundTotal;
  const partialBookings = bookings.filter((booking) => PARTIAL_PAYMENT_STATUSES.has(booking.paymentStatus));
  const collectibleBookings = bookings.filter(
    (booking) => !NON_COLLECTIBLE_STATUSES.has(effectiveBookingStatus(booking)),
  );
  const cancelledBookings = bookings.filter(
    (booking) => effectiveBookingStatus(booking) === BookingStatus.CANCELLED,
  );

  const serviceDurations: number[] = [];
  const arrivalDelays: number[] = [];
  let arrivedCount = 0;
  let onTimeCount = 0;
  let delayedCount = 0;
  let checkedChecklistItems = 0;
  let checklistItemCount = 0;
  let qualityReviewCount = 0;
  let qualityReturnCount = 0;
  let complaintCount = 0;
  let bookingsWithComplaints = 0;
  const employeeJobs = new Map<string, CountRow>();
  const completedByEmployee = new Map<string, CountRow>();
  const teamCompletion = new Map<string, {
    label: string;
    assigned: number;
    completed: number;
  }>();
  const customerBookings = new Map<string, number>();
  const returningCustomerIds = new Set<string>();

  for (const booking of bookings) {
    const serviceStarted = booking.statusHistory.find(
      (history) => history.toStatus === BookingStatus.IN_SERVICE,
    );
    const serviceEnded = serviceStarted
      ? booking.statusHistory.find(
          (history) => COMPLETION_HISTORY_STATUS_SET.has(history.toStatus) && history.createdAt > serviceStarted.createdAt,
        )
      : undefined;
    if (serviceStarted && serviceEnded) {
      serviceDurations.push(Math.max(0, Math.round(
        (serviceEnded.createdAt.getTime() - serviceStarted.createdAt.getTime()) / 60_000,
      )));
    }

    const arrived = booking.statusHistory.find(
      (history) => history.toStatus === BookingStatus.ARRIVED,
    );
    if (arrived) {
      arrivedCount += 1;
      const delay = Math.max(0, Math.round((arrived.createdAt.getTime() - booking.startAt.getTime()) / 60_000));
      const lateThreshold = booking.startAt.getTime() + booking.branch.arrivalWindowMinutes * 60_000;
      if (arrived.createdAt.getTime() <= lateThreshold) onTimeCount += 1;
      else {
        delayedCount += 1;
        arrivalDelays.push(delay);
      }
    }

    for (const instance of booking.checklistInstances) {
      for (const result of instance.results) {
        checklistItemCount += 1;
        if (result.isChecked) checkedChecklistItems += 1;
      }
    }

    if (booking.qualityReview) {
      qualityReviewCount += 1;
      if (booking.qualityReview.returnedToTeam) qualityReturnCount += 1;
    }

    complaintCount += booking.complaints.length;
    if (booking.complaints.length > 0) bookingsWithComplaints += 1;

    const effectiveStatus = effectiveBookingStatus(booking);
    if (!NON_UTILIZED_STATUSES.has(effectiveStatus)) {
      customerBookings.set(
        booking.customerId,
        (customerBookings.get(booking.customerId) ?? 0) + 1,
      );
      if (booking.customer.bookings.length > 0) returningCustomerIds.add(booking.customerId);
    }

    if (booking.assignedTeam && !NON_UTILIZED_STATUSES.has(effectiveStatus)) {
      const completion = teamCompletion.get(booking.assignedTeam.id) ?? {
        label: booking.assignedTeam.name,
        assigned: 0,
        completed: 0,
      };
      completion.assigned += 1;
      if (COMPLETED_STATUSES.has(effectiveStatus)) completion.completed += 1;
      teamCompletion.set(booking.assignedTeam.id, completion);

      for (const member of booking.assignedTeam.members) {
        const current = employeeJobs.get(member.user.id) ?? {
          id: member.user.id,
          label: member.user.fullName,
          count: 0,
        };
        current.count += 1;
        employeeJobs.set(member.user.id, current);
      }
    }

    if (COMPLETED_STATUSES.has(effectiveStatus)) {
      const executor = booking.assignedEmployee ?? serviceStarted?.changedByUser;
      if (executor) {
        const current = completedByEmployee.get(executor.id) ?? {
          id: executor.id,
          label: executor.fullName,
          count: 0,
        };
        current.count += 1;
        completedByEmployee.set(executor.id, current);
      }
    }
  }

  const utilizedBookings = bookings.filter(
    (booking) => booking.assignedTeam && !NON_UTILIZED_STATUSES.has(effectiveBookingStatus(booking)),
  );
  const dates = calendarDates(filters.from, filters.to);
  let availableJobSlots = 0;
  for (const team of capacityTeams) {
    const blackoutDates = new Set(
      team.branch.blackoutDates.map((blackout) => blackout.date.toISOString().slice(0, 10)),
    );
    for (const date of dates) {
      const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      const branchHours = team.branch.workingHours.find((hours) => hours.dayOfWeek === dayOfWeek);
      const teamHours = team.workingHours.find((hours) => hours.dayOfWeek === dayOfWeek);
      if (!branchHours || branchHours.isClosed || teamHours?.isOff || blackoutDates.has(date)) continue;
      const bounds = localDateBoundsUtc(date, REPORT_TIME_ZONE);
      const hasTimeOff = team.timeOff.some(
        (timeOff) => timeOff.startDate < bounds.end && timeOff.endDate > bounds.start,
      );
      if (!hasTimeOff) availableJobSlots += team.dailyCapacity;
    }
  }
  const completedBookings = bookings.filter((booking) => COMPLETED_STATUSES.has(effectiveBookingStatus(booking)));
  const rescheduledBookingIds = new Set(approvedTimeChanges.map((change) => change.bookingId));
  for (const request of cancellationRequests) {
    if (request.resolutionType === 'RESCHEDULE') rescheduledBookingIds.add(request.bookingId);
  }

  const cancellationReasons = groupCounts(cancellationRequests, (request) => ({
    id: request.reason,
    label: request.reason,
  }));
  const responsibleParties = groupCounts(cancellationRequests, (request) => ({
    id: request.responsibleParty ?? 'UNSPECIFIED',
    label: request.responsibleParty ?? 'غير محدد',
  }));

  const visitsConsumed = visitLedger.reduce(
    (total, entry) => total + Math.abs(Math.min(0, entry.visitChange)),
    0,
  );
  const recordedSubscriptionRevenue = activatedSubscriptions.reduce(
    (total, subscription) => total + (subscription.paymentProofs[0]?.amountSubmitted ?? 0),
    0,
  );
  const rebookedCustomerCount = [...customerBookings.entries()].filter(([customerId, count]) => (
    count >= 2 || returningCustomerIds.has(customerId)
  )).length;
  const topEmployee = [...completedByEmployee.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ar'),
  )[0] ?? null;

  const ratingTotalScore = customerRatings.reduce((acc, curr) => acc + curr.score, 0);
  const ratingAvgScore = customerRatings.length > 0 ? Math.round((ratingTotalScore / customerRatings.length) * 10) / 10 : 0;
  const approvedRatingCount = customerRatings.filter((item) => item.approvedForPublic).length;

  const ratingsByScoreMap = new Map<number, number>();
  for (const rating of customerRatings) {
    ratingsByScoreMap.set(rating.score, (ratingsByScoreMap.get(rating.score) ?? 0) + 1);
  }
  const byScore: CountRow[] = [5, 4, 3, 2, 1].map((score) => ({
    id: String(score),
    label: `${score} نجوم`,
    count: ratingsByScoreMap.get(score) ?? 0,
  }));

  const ratingServiceMap = new Map<string, { label: string; count: number; totalScore: number }>();
  for (const rating of customerRatings) {
    const sId = rating.booking.service.id;
    const sName = rating.booking.service.nameAr;
    const curr = ratingServiceMap.get(sId) ?? { label: sName, count: 0, totalScore: 0 };
    ratingServiceMap.set(sId, {
      label: sName,
      count: curr.count + 1,
      totalScore: curr.totalScore + rating.score,
    });
  }
  const byRatingService: CountValueRow[] = [...ratingServiceMap.entries()].map(([id, val]) => ({
    id,
    label: val.label,
    count: val.count,
    bookingValue: val.count > 0 ? Math.round((val.totalScore / val.count) * 10) / 10 : 0,
    collected: val.totalScore,
  }));

  const ratingBranchMap = new Map<string, { label: string; count: number; totalScore: number }>();
  for (const rating of customerRatings) {
    const bId = rating.booking.branch.id;
    const bName = rating.booking.branch.nameAr;
    const curr = ratingBranchMap.get(bId) ?? { label: bName, count: 0, totalScore: 0 };
    ratingBranchMap.set(bId, {
      label: bName,
      count: curr.count + 1,
      totalScore: curr.totalScore + rating.score,
    });
  }
  const byRatingBranch: CountValueRow[] = [...ratingBranchMap.entries()].map(([id, val]) => ({
    id,
    label: val.label,
    count: val.count,
    bookingValue: val.count > 0 ? Math.round((val.totalScore / val.count) * 10) / 10 : 0,
    collected: val.totalScore,
  }));

  return {
    generatedAt: generatedAt.toISOString(),
    filters,
    bookings: {
      total: bookings.length,
      completed: completedBookings.length,
      cancelled: cancelledBookings.length,
      cancellationRate: percent(cancelledBookings.length, bookings.length),
      uniqueCustomerCount: customerBookings.size,
      rebookedCustomerCount,
      rebookingRate: percent(rebookedCustomerCount, customerBookings.size),
      rejected: bookings.filter((booking) => effectiveBookingStatus(booking) === BookingStatus.REJECTED).length,
      noShow: bookings.filter((booking) => effectiveBookingStatus(booking) === BookingStatus.CUSTOMER_NO_SHOW).length,
      accessDenied: bookings.filter((booking) => effectiveBookingStatus(booking) === BookingStatus.ACCESS_DENIED).length,
      byStatus,
      byService,
      byBranch,
      byZone,
      byTeam,
    },
    financial: {
      verifiedPaymentCount: payments.length,
      verifiedPaymentAmount: paymentTotal,
      partialBookingCount: partialBookings.length,
      partialAmountPaid: partialBookings.reduce((total, booking) => total + booking.amountPaid, 0),
      amountDue: collectibleBookings.reduce((total, booking) => total + booking.amountDue, 0),
      refundCount: refunds.length,
      refunds: refundTotal,
      netCollected,
      averageBookingValue: average(bookings.map((booking) => booking.totalPrice)),
      comparisonNetCollected,
      salesChangeAmount: netCollected - comparisonNetCollected,
      salesGrowthRate: percentageChange(netCollected, comparisonNetCollected),
      byService: groupRevenue(
        payments,
        (payment) => payment.amount,
        (payment) => ({
          id: payment.booking.service.id,
          label: payment.booking.service.nameAr,
        }),
      ),
      byBranch: groupRevenue(
        payments,
        (payment) => payment.amount,
        (payment) => ({
          id: payment.booking.branch.id,
          label: payment.booking.branch.nameAr,
        }),
      ),
      byTeam: groupRevenue(
        payments,
        (payment) => payment.amount,
        (payment) => ({
          id: payment.booking.assignedTeam?.id ?? 'unassigned',
          label: payment.booking.assignedTeam?.name ?? 'غير مسند',
        }),
      ),
    },
    operations: {
      utilizationRate: percent(utilizedBookings.length, availableJobSlots),
      utilizedJobs: utilizedBookings.length,
      availableJobSlots,
      averageServiceDurationMinutes: average(serviceDurations),
      durationSampleCount: serviceDurations.length,
      onTimeArrivalRate: percent(onTimeCount, arrivedCount),
      onTimeArrivalCount: onTimeCount,
      arrivalSampleCount: arrivedCount,
      averageDelayMinutes: average(arrivalDelays),
      delayedArrivalCount: delayedCount,
      checklistCompletionRate: percent(checkedChecklistItems, checklistItemCount),
      checkedChecklistItems,
      checklistItemCount,
      qualityReturnRate: percent(qualityReturnCount, qualityReviewCount),
      qualityReturnCount,
      qualityReviewCount,
      complaintRate: percent(bookingsWithComplaints, completedBookings.length),
      bookingsWithComplaints,
      complaintCount,
      jobsByTeam: utilizedBookings.length === 0
        ? []
        : groupCounts(utilizedBookings, (booking) => ({
            id: booking.assignedTeam?.id ?? 'unassigned',
            label: booking.assignedTeam?.name ?? 'غير مسند',
          })),
      jobsByEmployee: [...employeeJobs.values()].sort((left, right) => right.count - left.count),
      teamCompletion: completionRows(teamCompletion),
      topEmployee,
    },
    subscriptions: {
      active: activeSubscriptions,
      newSubscriptions,
      expired: expiredSubscriptions,
      visitsConsumed,
      visitsRemaining: remainingVisits._sum.remainingVisits ?? 0,
      recordedRevenue: recordedSubscriptionRevenue,
      activatedCount: activatedSubscriptions.length,
    },
    cancellations: {
      totalRequests: cancellationRequests.length,
      refundTotal,
      rescheduledCount: rescheduledBookingIds.size,
      byReason: cancellationReasons,
      byResponsibleParty: responsibleParties,
    },
    customerRatings: {
      totalCount: customerRatings.length,
      averageScore: ratingAvgScore,
      approvedCount: approvedRatingCount,
      byScore,
      byService: byRatingService,
      byBranch: byRatingBranch,
    },
    rows: bookings.map((booking) => ({
      bookingNumber: booking.bookingNumber,
      startAt: booking.startAt.toISOString(),
      branch: booking.branch.nameAr,
      service: booking.service.nameAr,
      zone: booking.coverageArea.zone.name,
      area: booking.coverageArea.compound,
      team: booking.assignedTeam?.name ?? 'غير مسند',
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      totalPrice: booking.totalPrice,
      amountPaid: booking.amountPaid,
      amountDue: booking.amountDue,
    })),
  };
}

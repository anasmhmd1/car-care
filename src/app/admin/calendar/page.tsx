import type { Metadata } from 'next';
import {
  BookingStatus,
  PaymentStatus,
  Prisma,
  TimeChangeStatus,
  UserRole,
} from '@prisma/client';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { isCalendarReschedulableStatus } from '@/lib/engine/calendar';
import { localDateTimeToUtc } from '@/lib/engine/time';
import CalendarBoard, {
  type CalendarBookingDto,
  type CalendarFiltersDto,
  type CalendarOptionDto,
  type CalendarTeamDto,
  type CalendarView,
} from './CalendarBoard';

export const metadata: Metadata = {
  title: 'تقويم التشغيل',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CALENDAR_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;
const VALID_VIEWS = new Set<CalendarView>(['day', 'week', 'agenda', 'team']);
const CALENDAR_RESULT_LIMIT = 500;
const DEFAULT_TIME_ZONE = 'Africa/Cairo';

const bookingSelect = {
  id: true,
  bookingNumber: true,
  bookingStatus: true,
  paymentStatus: true,
  startAt: true,
  endAt: true,
  totalDurationMinutes: true,
  amountDue: true,
  assignedTeamId: true,
  branch: { select: { id: true, nameAr: true, timezone: true } },
  service: { select: { nameAr: true } },
  coverageArea: {
    select: {
      compound: true,
      zone: { select: { name: true } },
    },
  },
  customer: {
    select: {
      user: { select: { fullName: true } },
    },
  },
  assignedTeam: { select: { name: true } },
  timeChanges: {
    where: { status: TimeChangeStatus.PENDING },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.BookingSelect;

type CalendarBookingRecord = Prisma.BookingGetPayload<{
  select: typeof bookingSelect;
}>;

const bookingStatusLabels: Record<BookingStatus, string> = {
  [BookingStatus.DRAFT]: 'مسودة',
  [BookingStatus.REQUEST_SUBMITTED]: 'طلب جديد',
  [BookingStatus.AWAITING_PAYMENT_PROOF]: 'بانتظار الإثبات',
  [BookingStatus.PAYMENT_UNDER_REVIEW]: 'مراجعة الدفع',
  [BookingStatus.PAYMENT_VERIFIED]: 'دفع موثق',
  [BookingStatus.AWAITING_OPERATIONS_REVIEW]: 'مراجعة التشغيل',
  [BookingStatus.ACCEPTED]: 'مقبول',
  [BookingStatus.AWAITING_ASSIGNMENT]: 'بانتظار الفريق',
  [BookingStatus.ASSIGNED]: 'مسند',
  [BookingStatus.TEAM_ACKNOWLEDGED]: 'أكده الفريق',
  [BookingStatus.ON_THE_WAY]: 'في الطريق',
  [BookingStatus.ARRIVED]: 'وصل الفريق',
  [BookingStatus.IN_SERVICE]: 'قيد التنفيذ',
  [BookingStatus.QUALITY_REVIEW]: 'مراجعة الجودة',
  [BookingStatus.SERVICE_COMPLETED]: 'اكتملت الخدمة',
  [BookingStatus.DELIVERED]: 'تم التسليم',
  [BookingStatus.CLOSED]: 'مغلق',
  [BookingStatus.RESCHEDULE_REQUESTED]: 'طلب تعديل',
  [BookingStatus.CANCELLATION_REQUESTED]: 'طلب إلغاء',
  [BookingStatus.CANCELLED]: 'ملغي',
  [BookingStatus.REJECTED]: 'مرفوض',
  [BookingStatus.EXECUTION_FAILED]: 'تعذر التنفيذ',
  [BookingStatus.CUSTOMER_NO_SHOW]: 'العميل لم يحضر',
  [BookingStatus.ACCESS_DENIED]: 'تعذر الدخول',
  [BookingStatus.ADMIN_REVIEW_REQUIRED]: 'مراجعة إدارية',
  [BookingStatus.EXPIRED]: 'منتهي',
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  [PaymentStatus.NOT_REQUIRED]: 'غير مطلوب',
  [PaymentStatus.AWAITING_PROOF]: 'بانتظار الإثبات',
  [PaymentStatus.PROOF_UPLOADED]: 'تم رفع الإثبات',
  [PaymentStatus.UNDER_REVIEW]: 'قيد المراجعة',
  [PaymentStatus.VERIFIED]: 'موثق',
  [PaymentStatus.REJECTED]: 'مرفوض',
  [PaymentStatus.AMOUNT_SHORT]: 'المبلغ ناقص',
  [PaymentStatus.DUPLICATE_SUSPECTED]: 'اشتباه تكرار',
  [PaymentStatus.REUPLOAD_REQUIRED]: 'مطلوب إعادة الرفع',
  [PaymentStatus.PARTIALLY_PAID]: 'مدفوع جزئيًا',
  [PaymentStatus.FULLY_PAID]: 'مدفوع بالكامل',
  [PaymentStatus.REFUND_PENDING]: 'استرداد معلق',
  [PaymentStatus.PARTIALLY_REFUNDED]: 'مسترد جزئيًا',
  [PaymentStatus.REFUNDED]: 'مسترد',
  [PaymentStatus.NON_REFUNDABLE]: 'غير قابل للاسترداد',
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function shiftDateKey(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekStartDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const daysSinceSaturday = (date.getUTCDay() + 1) % 7;
  return shiftDateKey(dateKey, -daysSinceSaturday);
}

function buildDateKeys(startDate: string, length: number) {
  return Array.from({ length }, (_, index) => shiftDateKey(startDate, index));
}

function formatRangeLabel(view: CalendarView, dateKeys: string[]) {
  const fullFormatter = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const shortFormatter = new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const first = new Date(`${dateKeys[0]}T12:00:00.000Z`);
  if (view === 'day' || view === 'team') return fullFormatter.format(first);
  const last = new Date(`${dateKeys.at(-1)}T12:00:00.000Z`);
  return `${shortFormatter.format(first)} — ${shortFormatter.format(last)}`;
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function greatestCommonDivisor(first: number, second: number): number {
  let left = Math.abs(first);
  let right = Math.abs(second);
  while (right > 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function buildSchedule(
  branches: BranchRecord[],
  dateKeys: string[],
  bookings: CalendarBookingRecord[],
) {
  const weekDays = new Set(dateKeys.map((dateKey) =>
    new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()
  ));
  const applicableHours = branches.flatMap((branch) =>
    branch.workingHours.filter(({ dayOfWeek, isClosed }) => weekDays.has(dayOfWeek) && !isClosed)
  );
  const bookingStartMinutes = bookings.map((booking) =>
    minutesFromTime(timeInTimeZone(booking.startAt, booking.branch.timezone))
  );
  const bookingEndMinutes = bookings.map((booking) =>
    minutesFromTime(timeInTimeZone(booking.endAt, booking.branch.timezone))
  );
  const startCandidates = [
    ...applicableHours.map(({ openTime }) => minutesFromTime(openTime)),
    ...bookingStartMinutes,
  ];
  const endCandidates = [
    ...applicableHours.map(({ closeTime }) => minutesFromTime(closeTime)),
    ...bookingEndMinutes,
  ];
  const rawStart = startCandidates.length ? Math.min(...startCandidates) : 9 * 60;
  const rawEnd = endCandidates.length ? Math.max(...endCandidates) : 18 * 60;
  const configuredSlots = branches
    .map(({ slotUnitMinutes }) => slotUnitMinutes)
    .filter((value) => Number.isInteger(value) && value > 0);
  const openingOffsets = applicableHours
    .map(({ openTime }) => Math.abs(minutesFromTime(openTime) - rawStart))
    .filter((value) => value > 0);
  const commonStep = [...configuredSlots, ...openingOffsets]
    .reduce((current, value) => current ? greatestCommonDivisor(current, value) : value, 0);
  const slotMinutes = Math.max(5, commonStep || 60);
  const startMinute = Math.max(0, rawStart);
  const endMinute = Math.min(
    24 * 60,
    Math.max(
      startMinute + slotMinutes,
      startMinute + Math.ceil((rawEnd - startMinute) / slotMinutes) * slotMinutes,
    ),
  );
  return { startMinute, endMinute, slotMinutes };
}

function toBookingDto(
  booking: CalendarBookingRecord,
  canReschedule: boolean,
): CalendarBookingDto {
  const timeZone = booking.branch.timezone;
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    expectedStartAt: booking.startAt.toISOString(),
    localDate: dateInTimeZone(booking.startAt, timeZone),
    localTime: timeInTimeZone(booking.startAt, timeZone),
    localEndTime: timeInTimeZone(booking.endAt, timeZone),
    durationMinutes: booking.totalDurationMinutes,
    branchName: booking.branch.nameAr,
    serviceName: booking.service.nameAr,
    zoneName: booking.coverageArea.zone.name,
    areaName: booking.coverageArea.compound,
    customerName: booking.customer.user.fullName,
    assignedTeamId: booking.assignedTeamId,
    assignedTeamName: booking.assignedTeam?.name ?? null,
    amountDue: booking.amountDue,
    canReschedule:
      canReschedule &&
      isCalendarReschedulableStatus(booking.bookingStatus) &&
      booking.timeChanges.length === 0,
  };
}

const branchSelect = {
  id: true,
  nameAr: true,
  timezone: true,
  slotUnitMinutes: true,
  workingHours: {
    select: {
      dayOfWeek: true,
      isClosed: true,
      openTime: true,
      closeTime: true,
    },
  },
  teams: {
    select: { id: true, name: true, active: true },
    orderBy: [{ active: 'desc' as const }, { name: 'asc' as const }],
  },
  coverageZones: {
    select: { id: true, name: true },
    orderBy: { name: 'asc' as const },
  },
  services: {
    select: {
      service: { select: { id: true, nameAr: true } },
    },
  },
} satisfies Prisma.BranchSelect;

type BranchRecord = Prisma.BranchGetPayload<{
  select: typeof branchSelect;
}>;

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const actor = await requireRole([...CALENDAR_ROLES]);
  const params = await searchParams;
  const requestedView = firstParam(params.view) as CalendarView | undefined;
  const currentView = requestedView && VALID_VIEWS.has(requestedView) ? requestedView : 'week';
  const today = dateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const selectedDate = validDateKey(firstParam(params.date)) ? firstParam(params.date)! : today;
  const rangeStart = currentView === 'week' ? weekStartDate(selectedDate) : selectedDate;
  const rangeLength = currentView === 'week' ? 7 : currentView === 'agenda' ? 30 : 1;
  const dateKeys = buildDateKeys(rangeStart, rangeLength);
  const rangeEndExclusive = shiftDateKey(rangeStart, rangeLength);

  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const branches = await db.branch.findMany({
    where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } },
    select: branchSelect,
    orderBy: { nameAr: 'asc' },
  });
  const reschedulePermissionCache = new Map<string, Promise<boolean>>();
  const canRescheduleBooking = (booking: { branchId: string; assignedTeamId: string | null }) => {
    const cacheKey = `${booking.branchId}:${booking.assignedTeamId ?? ''}`;
    const cached = reschedulePermissionCache.get(cacheKey);
    if (cached) return cached;
    const decision = hasPermissionAcrossScopes(
      actor,
      'booking.reschedule',
      bookingPermissionScopes(booking),
    );
    reschedulePermissionCache.set(cacheKey, decision);
    return decision;
  };
  const branchBookingAccess = await Promise.all(branches.map(async (branch) => {
    const [unassignedAllowed, teamPermissions] = await Promise.all([
      canRescheduleBooking({ branchId: branch.id, assignedTeamId: null }),
      Promise.all(branch.teams.map(async (team) => ({
        teamId: team.id,
        allowed: await canRescheduleBooking({
          branchId: branch.id,
          assignedTeamId: team.id,
        }),
      }))),
    ]);
    return {
      branchId: branch.id,
      unassignedAllowed,
      allowedTeamIds: teamPermissions
        .filter(({ allowed }) => allowed)
        .map(({ teamId }) => teamId),
    };
  }));
  const bookingPermissionScopesWhere = branchBookingAccess.flatMap((branch) => [
    ...(branch.unassignedAllowed
      ? [{ branchId: branch.branchId, assignedTeamId: null }]
      : []),
    ...(branch.allowedTeamIds.length
      ? [{ branchId: branch.branchId, assignedTeamId: { in: branch.allowedTeamIds } }]
      : []),
  ]);
  const canReschedule = bookingPermissionScopesWhere.length > 0;

  const branchIdSet = new Set(branches.map(({ id }) => id));
  const teamRecords: CalendarTeamDto[] = branches.flatMap((branch) =>
    branch.teams.map((team) => ({
      id: team.id,
      name: team.name,
      branchName: branch.nameAr,
      active: team.active,
    }))
  );
  const teamIdSet = new Set(teamRecords.map(({ id }) => id));
  const serviceMap = new Map<string, CalendarOptionDto>();
  const zoneMap = new Map<string, CalendarOptionDto>();
  for (const branch of branches) {
    for (const branchService of branch.services) {
      serviceMap.set(branchService.service.id, {
        id: branchService.service.id,
        label: branchService.service.nameAr,
      });
    }
    for (const zone of branch.coverageZones) {
      zoneMap.set(zone.id, { id: zone.id, label: `${zone.name} · ${branch.nameAr}` });
    }
  }

  const requestedBranch = firstParam(params.branch) ?? '';
  const requestedTeam = firstParam(params.team) ?? '';
  const requestedService = firstParam(params.service) ?? '';
  const requestedZone = firstParam(params.zone) ?? '';
  const requestedBookingStatus = firstParam(params.bookingStatus) ?? '';
  const requestedPaymentStatus = firstParam(params.paymentStatus) ?? '';
  const bookingStatusSet = new Set<string>(Object.values(BookingStatus));
  const paymentStatusSet = new Set<string>(Object.values(PaymentStatus));
  const filters: CalendarFiltersDto = {
    branch: branchIdSet.has(requestedBranch) ? requestedBranch : '',
    team: requestedTeam === 'unassigned' || teamIdSet.has(requestedTeam) ? requestedTeam : '',
    service: serviceMap.has(requestedService) ? requestedService : '',
    zone: zoneMap.has(requestedZone) ? requestedZone : '',
    bookingStatus: bookingStatusSet.has(requestedBookingStatus) ? requestedBookingStatus : '',
    paymentStatus: paymentStatusSet.has(requestedPaymentStatus) ? requestedPaymentStatus : '',
  };

  const filteredBranches = filters.branch
    ? branches.filter(({ id }) => id === filters.branch)
    : branches;
  const branchRangeFilters: Prisma.BookingWhereInput[] = filteredBranches.map((branch) => ({
    branchId: branch.id,
    startAt: {
      gte: localDateTimeToUtc(rangeStart, '00:00', branch.timezone),
      lt: localDateTimeToUtc(rangeEndExclusive, '00:00', branch.timezone),
    },
  }));
  const bookingWhere: Prisma.BookingWhereInput = {
    deletedAt: null,
    AND: [
      { OR: branchRangeFilters },
      { OR: bookingPermissionScopesWhere },
    ],
    assignedTeamId: filters.team
      ? filters.team === 'unassigned' ? null : filters.team
      : undefined,
    serviceId: filters.service || undefined,
    coverageArea: filters.zone ? { zoneId: filters.zone } : undefined,
    bookingStatus: filters.bookingStatus ? filters.bookingStatus as BookingStatus : undefined,
    paymentStatus: filters.paymentStatus ? filters.paymentStatus as PaymentStatus : undefined,
  };

  const [totalMatchingCount, bookingRecords] = (
    branchRangeFilters.length && bookingPermissionScopesWhere.length
  )
    ? await Promise.all([
        db.booking.count({ where: bookingWhere }),
        db.booking.findMany({
          where: bookingWhere,
          select: bookingSelect,
          orderBy: [{ startAt: 'asc' }, { bookingNumber: 'asc' }],
          take: CALENDAR_RESULT_LIMIT,
        }),
      ])
    : [0, [] as CalendarBookingRecord[]];

  const options = {
    branches: branches.map(({ id, nameAr }) => ({ id, label: nameAr })),
    teams: teamRecords.map((team) => ({
      id: team.id,
      label: `${team.name} · ${team.branchName}`,
    })),
    services: [...serviceMap.values()].sort((first, second) => first.label.localeCompare(second.label, 'ar')),
    zones: [...zoneMap.values()].sort((first, second) => first.label.localeCompare(second.label, 'ar')),
    bookingStatuses: Object.values(BookingStatus).map((status) => ({
      id: status,
      label: bookingStatusLabels[status],
    })),
    paymentStatuses: Object.values(PaymentStatus).map((status) => ({
      id: status,
      label: paymentStatusLabels[status],
    })),
  };

  return (
    <CalendarBoard
      viewerName={actor.fullName}
      homeHref={actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin'}
      homeLabel={actor.role === UserRole.OPERATIONS_MANAGER ? 'لوحة التشغيل' : 'لوحة المالك'}
      currentView={currentView}
      selectedDate={selectedDate}
      today={today}
      dateKeys={dateKeys}
      rangeLabel={formatRangeLabel(currentView, dateKeys)}
      filters={filters}
      options={options}
      teams={teamRecords}
      bookings={bookingRecords.map((booking) => toBookingDto(
        booking,
        true,
      ))}
      schedule={buildSchedule(filteredBranches, dateKeys, bookingRecords)}
      canReschedule={canReschedule}
      totalMatchingCount={totalMatchingCount}
      resultLimit={CALENDAR_RESULT_LIMIT}
    />
  );
}

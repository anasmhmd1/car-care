import type { Metadata } from 'next';
import {
  BookingStatus,
  ComplaintStatus,
  FileType,
  PaymentStatus,
  Prisma,
  ProofStatus,
  RefundStatus,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { localDateBoundsUtc } from '@/lib/engine/time';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import { normalizePhone } from '@/lib/validations/phone';
import OwnerCommandCenter, {
  type BookingSummaryDto,
  type OwnerSection,
} from './OwnerCommandCenter';

export const metadata: Metadata = {
  title: 'لوحة المالك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface OwnerDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CAIRO_TIME_ZONE = 'Africa/Cairo';
const VALID_SECTIONS = new Set<OwnerSection>([
  'overview',
  'bookings',
  'payments',
  'cancellations',
  'quality',
  'teams',
  'branches',
  'services',
  'subscriptions',
  'customers',
  'reports',
  'audit',
]);
const TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.CLOSED,
  BookingStatus.EXPIRED,
];
const COMPLETED_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
];
const IN_PROGRESS_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.ON_THE_WAY,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
];

const bookingSummarySelect = {
  id: true,
  bookingNumber: true,
  bookingStatus: true,
  paymentStatus: true,
  startAt: true,
  createdAt: true,
  totalPrice: true,
  depositAmount: true,
  amountPaid: true,
  amountDue: true,
  branchId: true,
  service: { select: { nameAr: true } },
  branch: { select: { nameAr: true } },
  coverageArea: { select: { compound: true } },
  customer: { select: { user: { select: { fullName: true, phone: true } } } },
  vehicle: { select: { make: true, model: true, year: true } },
  assignedTeam: { select: { name: true } },
} satisfies Prisma.BookingSelect;

type BookingSummaryRecord = Prisma.BookingGetPayload<{
  select: typeof bookingSummarySelect;
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
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

function toBookingDto(booking: BookingSummaryRecord): BookingSummaryDto {
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    startAt: booking.startAt.toISOString(),
    createdAt: booking.createdAt.toISOString(),
    totalPrice: booking.totalPrice,
    depositAmount: booking.depositAmount,
    amountPaid: booking.amountPaid,
    amountDue: booking.amountDue,
    serviceName: booking.service.nameAr,
    branchId: booking.branchId,
    branchName: booking.branch.nameAr,
    areaName: booking.coverageArea.compound,
    customerName: booking.customer.user.fullName,
    customerPhone: booking.customer.user.phone,
    vehicleLabel: `${booking.vehicle.make} ${booking.vehicle.model} ${booking.vehicle.year}`,
    assignedTeamName: booking.assignedTeam?.name ?? null,
  };
}

function countForStatus<Key extends string>(
  groups: ReadonlyArray<{ _count: { _all: number } } & Record<Key, string>>,
  key: Key,
  statuses: readonly string[],
) {
  const wanted = new Set<string>(statuses);
  return groups.reduce((total, group) => {
    const value = group[key];
    return total + (wanted.has(value) ? group._count._all : 0);
  }, 0);
}

export default async function OwnerDashboardPage({ searchParams }: OwnerDashboardPageProps) {
  const [owner, query] = await Promise.all([
    requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN, UserRole.OPERATIONS_MANAGER]),
    searchParams,
  ]);
  await expireActiveSubscriptions();

  const now = new Date();
  const today = dateInTimeZone(now, CAIRO_TIME_ZONE);
  const monthStartDate = `${today.slice(0, 7)}-01`;
  const todayBounds = localDateBoundsUtc(today, CAIRO_TIME_ZONE);
  const monthBounds = localDateBoundsUtc(monthStartDate, CAIRO_TIME_ZONE);

  const sectionParam = firstParam(query.section) as OwnerSection | undefined;
  const currentSection = sectionParam && VALID_SECTIONS.has(sectionParam) ? sectionParam : 'overview';
  const bookingQuery = (firstParam(query.q) ?? '').trim().slice(0, 100);
  const customerQuery = (firstParam(query.customer_q) ?? '').trim().slice(0, 100);
  const normalizedCustomerPhoneQuery = normalizePhone(customerQuery);
  const rawBookingStatus = firstParam(query.status);
  const bookingStatus = rawBookingStatus && Object.values(BookingStatus).includes(rawBookingStatus as BookingStatus)
    ? rawBookingStatus as BookingStatus
    : undefined;

  let reportFrom = validDate(firstParam(query.from)) ?? monthStartDate;
  let reportTo = validDate(firstParam(query.to)) ?? today;
  if (reportFrom > reportTo) {
    [reportFrom, reportTo] = [reportTo, reportFrom];
  }
  const reportStart = localDateBoundsUtc(reportFrom, CAIRO_TIME_ZONE).start;
  const reportEnd = localDateBoundsUtc(reportTo, CAIRO_TIME_ZONE).end;
  const reportRange = { gte: reportStart, lt: reportEnd };

  const filteredBookingWhere: Prisma.BookingWhereInput = {
    deletedAt: null,
    ...(bookingStatus ? { bookingStatus } : {}),
    ...(bookingQuery
      ? {
          OR: [
            { bookingNumber: { contains: bookingQuery, mode: 'insensitive' } },
            { customer: { user: { fullName: { contains: bookingQuery, mode: 'insensitive' } } } },
            { customer: { user: { phone: { contains: bookingQuery } } } },
            { service: { nameAr: { contains: bookingQuery, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const customerListWhere: Prisma.CustomerProfileWhereInput = {
    user: {
      role: UserRole.CUSTOMER,
      deletedAt: null,
      ...(customerQuery
        ? {
            OR: [
              { fullName: { contains: customerQuery, mode: 'insensitive' } },
              { phone: { contains: normalizedCustomerPhoneQuery || customerQuery } },
              { whatsapp: { contains: normalizedCustomerPhoneQuery || customerQuery } },
              { email: { contains: customerQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  };

  // Staged Core Fetching (Batches of max 4-6 queries to prevent connection pool starvation)
  const [brandRaw, branchesRaw, teamsRaw] = await Promise.all([
    db.brandSettings.findFirst({
      select: { brandNameAr: true, brandNameEn: true, maxBranches: true },
    }),
    db.branch.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        code: true,
        address: true,
        phone: true,
        whatsapp: true,
        status: true,
        timezone: true,
        assignmentMode: true,
        dailyBookingLimit: true,
        _count: {
          select: {
            teams: { where: { active: true } },
            coverageZones: true,
            paymentMethods: { where: { active: true } },
            bookings: {
              where: {
                deletedAt: null,
                startAt: { gte: todayBounds.start, lt: todayBounds.end },
              },
            },
          },
        },
      },
    }),
    db.team.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        branchId: true,
        dailyCapacity: true,
        active: true,
        assignmentPriority: true,
        branch: { select: { nameAr: true } },
        members: {
          orderBy: [{ isLeader: 'desc' }, { user: { fullName: 'asc' } }],
          select: {
            isLeader: true,
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        teamZones: { select: { zone: { select: { id: true, name: true } } } },
        capabilities: { select: { service: { select: { id: true, nameAr: true } } } },
        _count: {
          select: {
            bookings: {
              where: {
                deletedAt: null,
                startAt: { gte: todayBounds.start, lt: todayBounds.end },
              },
            },
          },
        },
      },
    }),
  ]);

  // Core Financial & Operational Status Groups
  const [
    todayStatusGroups,
    allStatusGroups,
    paymentStatusGroups,
    paymentToday,
    paymentMonth,
    pendingDue,
  ] = await Promise.all([
    db.booking.groupBy({
      by: ['bookingStatus'],
      where: {
        deletedAt: null,
        startAt: { gte: todayBounds.start, lt: todayBounds.end },
      },
      _count: { _all: true },
    }),
    db.booking.groupBy({
      by: ['bookingStatus'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.booking.groupBy({
      by: ['paymentStatus'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.payment.aggregate({
      where: { createdAt: { gte: todayBounds.start, lt: todayBounds.end } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { createdAt: { gte: monthBounds.start, lte: now } },
      _sum: { amount: true },
    }),
    db.booking.aggregate({
      where: {
        deletedAt: null,
        amountDue: { gt: 0 },
        bookingStatus: { notIn: TERMINAL_BOOKING_STATUSES },
        terminalReopenSourceStatus: null,
      },
      _sum: { amountDue: true },
    }),
  ]);

  // Secondary KPI Indicators
  const [
    proofStatusGroups,
    cancellationStatusGroups,
    refundStatusGroups,
    subscriptionStatusGroups,
    complaintStatusGroups,
    activeVisitTotals,
  ] = await Promise.all([
    db.paymentProof.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.cancellationRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.refund.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.customerSubscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.complaint.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.customerSubscription.aggregate({
      where: { status: SubscriptionStatus.ACTIVE },
      _sum: { remainingVisits: true },
    }),
  ]);

  // Customer & Upcoming Counters
  const [
    upcomingBookings,
    unassignedBookingCount,
    newCustomersMonth,
    repeatCustomerGroups,
  ] = await Promise.all([
    db.booking.count({
      where: {
        deletedAt: null,
        startAt: { gte: now },
        bookingStatus: { notIn: TERMINAL_BOOKING_STATUSES },
        terminalReopenSourceStatus: null,
      },
    }),
    db.booking.count({
      where: {
        deletedAt: null,
        assignedTeamId: null,
        bookingStatus: {
          in: [
            BookingStatus.ACCEPTED,
            BookingStatus.AWAITING_ASSIGNMENT,
            BookingStatus.ADMIN_REVIEW_REQUIRED,
          ],
        },
        terminalReopenSourceStatus: null,
      },
    }),
    db.customerProfile.count({
      where: { createdAt: { gte: monthBounds.start, lte: now } },
    }),
    db.booking.groupBy({
      by: ['customerId'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  // Section-Aware Data Fetching: Only fetch heavy arrays when the active section requires them!
  const isOverview = currentSection === 'overview';
  const isBookings = currentSection === 'bookings';
  const isPayments = currentSection === 'payments';
  const isCancellations = currentSection === 'cancellations';
  const isQuality = currentSection === 'quality';
  const isServices = currentSection === 'services';
  const isSubscriptions = currentSection === 'subscriptions';
  const isCustomers = currentSection === 'customers';
  const isAudit = currentSection === 'audit';
  const isBranches = currentSection === 'branches';
  const isReports = currentSection === 'reports';

  // Overview quick cards & Bookings list
  const [pendingProofsRaw, operationsReviewRaw, unassignedRaw, bookingsRaw] = await Promise.all([
    isPayments || isOverview
      ? db.paymentProof.findMany({
          where: { status: ProofStatus.UNDER_REVIEW },
          take: isOverview ? 5 : 30,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderName: true,
            senderPhoneOrAccount: true,
            referenceNumber: true,
            amountSubmitted: true,
            transferTimestamp: true,
            createdAt: true,
            proofFileUrl: true,
            paymentMethod: { select: { name: true, accountNumber: true } },
            booking: { select: bookingSummarySelect },
          },
        })
      : Promise.resolve([]),
    isBookings || isOverview
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
          },
          take: isOverview ? 2 : 30,
          orderBy: { createdAt: 'asc' },
          select: bookingSummarySelect,
        })
      : Promise.resolve([]),
    isBookings || isOverview
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            assignedTeamId: null,
            bookingStatus: {
              in: [
                BookingStatus.ACCEPTED,
                BookingStatus.AWAITING_ASSIGNMENT,
                BookingStatus.ADMIN_REVIEW_REQUIRED,
              ],
            },
            terminalReopenSourceStatus: null,
          },
          take: isOverview ? 2 : 30,
          orderBy: { startAt: 'asc' },
          select: bookingSummarySelect,
        })
      : Promise.resolve([]),
    isBookings
      ? db.booking.findMany({
          where: filteredBookingWhere,
          take: 100,
          orderBy: { createdAt: 'desc' },
          select: bookingSummarySelect,
        })
      : Promise.resolve([]),
  ]);

  // Cancellations, Quality & Complaints
  const [cancellationsRaw, refundsRaw, qualityRaw, complaintsRaw] = await Promise.all([
    isCancellations
      ? db.cancellationRequest.findMany({
          where: {
            status: { in: ['PENDING', 'ESCALATED'] },
            booking: { terminalReopenSourceStatus: null },
          },
          take: 30,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            reason: true,
            preferredAction: true,
            customerNotes: true,
            status: true,
            createdAt: true,
            booking: { select: bookingSummarySelect },
          },
        })
      : Promise.resolve([]),
    isCancellations
      ? db.refund.findMany({
          where: {
            status: { in: [RefundStatus.REFUND_PENDING, RefundStatus.REFUND_PROCESSING] },
            booking: { terminalReopenSourceStatus: null },
          },
          take: 30,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amount: true,
            refundMethod: true,
            referenceNumber: true,
            status: true,
            createdAt: true,
            booking: { select: bookingSummarySelect },
          },
        })
      : Promise.resolve([]),
    isQuality
      ? db.booking.findMany({
          where: { deletedAt: null, bookingStatus: BookingStatus.QUALITY_REVIEW },
          take: 30,
          orderBy: { startAt: 'asc' },
          select: {
            ...bookingSummarySelect,
            service: {
              select: {
                nameAr: true,
                minimumBeforePhotos: true,
                minimumAfterPhotos: true,
              },
            },
            files: {
              where: { fileType: { in: [FileType.BEFORE_SERVICE, FileType.AFTER_SERVICE] } },
              select: { fileType: true },
            },
          },
        })
      : Promise.resolve([]),
    isQuality
      ? db.complaint.findMany({
          where: {
            status: {
              in: [
                ComplaintStatus.OPEN,
                ComplaintStatus.UNDER_REVIEW,
                ComplaintStatus.ACTION_REQUIRED,
              ],
            },
          },
          take: 30,
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            type: true,
            description: true,
            priority: true,
            status: true,
            createdAt: true,
            booking: { select: { bookingNumber: true } },
            customer: { select: { user: { select: { fullName: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Catalog, Subscriptions, Customers, Audit, and Branches
  const [
    servicesRaw,
    plansRaw,
    activeSubscriptionsByPlan,
    subscriptionsRaw,
    customersRaw,
    auditLogsRaw,
    branchRequestsRaw,
  ] = await Promise.all([
    isServices || isReports
      ? db.service.findMany({
          orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            nameAr: true,
            slug: true,
            basePrice: true,
            durationMinutes: true,
            active: true,
            bookableOnline: true,
            subscriptionEligible: true,
            _count: { select: { variants: true, addonLinks: true, bookings: true } },
          },
        })
      : Promise.resolve([]),
    isSubscriptions
      ? db.subscriptionPlan.findMany({
          orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            nameAr: true,
            descriptionAr: true,
            price: true,
            validityDays: true,
            visitCount: true,
            allowedVehicleCount: true,
            active: true,
            _count: { select: { subscriptions: true } },
          },
        })
      : Promise.resolve([]),
    isSubscriptions
      ? db.customerSubscription.groupBy({
          by: ['planId'],
          where: { status: SubscriptionStatus.ACTIVE },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    isSubscriptions
      ? db.customerSubscription.findMany({
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            totalVisits: true,
            usedVisits: true,
            remainingVisits: true,
            customer: { select: { user: { select: { fullName: true, phone: true } } } },
            plan: { select: { nameAr: true } },
            branch: { select: { nameAr: true } },
            _count: { select: { vehicles: true } },
          },
        })
      : Promise.resolve([]),
    isCustomers
      ? db.customerProfile.findMany({
          where: customerListWhere,
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            notes: true,
            creditBalance: true,
            createdAt: true,
            user: {
              select: {
                fullName: true,
                phone: true,
                whatsapp: true,
                email: true,
                active: true,
                mustChangePwd: true,
              },
            },
            _count: { select: { bookings: true, vehicles: true, subscriptions: true } },
            vehicles: {
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                color: true,
                plateNumber: true,
                vehicleSize: true,
                isDefault: true,
              },
            },
            addresses: {
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true,
                compound: true,
                district: true,
                street: true,
                buildingNumber: true,
                isDefault: true,
              },
            },
            bookings: {
              where: { deletedAt: null },
              take: 5,
              orderBy: { startAt: 'desc' },
              select: {
                id: true,
                bookingNumber: true,
                startAt: true,
                bookingStatus: true,
                totalPrice: true,
                amountPaid: true,
                service: { select: { nameAr: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    isAudit
      ? db.auditLog.findMany({
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            actorRole: true,
            reason: true,
            createdAt: true,
            actor: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    isBranches
      ? db.branchRequest.findMany({
          where: { ownerId: owner.id },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            branchName: true,
            reason: true,
            status: true,
            rejectionReason: true,
            createdAt: true,
            reviewedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  // Reporting Analytics (Only executed if user is viewing Reports!)
  const [
    reportStatusGroups,
    reportBookingAggregate,
    reportDueAggregate,
    reportPaymentAggregate,
    reportRefundAggregate,
    reportByServiceRaw,
    reportByBranchRaw,
    reportByTeamRaw,
    reportCancellationReasonsRaw,
    reportNewSubscriptions,
    reportVisits,
    reportComplaintCount,
  ] = isReports
    ? await Promise.all([
        db.booking.groupBy({
          by: ['bookingStatus'],
          where: { deletedAt: null, createdAt: reportRange },
          _count: { _all: true },
        }),
        db.booking.aggregate({
          where: { deletedAt: null, createdAt: reportRange },
          _avg: { totalPrice: true },
        }),
        db.booking.aggregate({
          where: {
            deletedAt: null,
            createdAt: reportRange,
            bookingStatus: { notIn: TERMINAL_BOOKING_STATUSES },
            terminalReopenSourceStatus: null,
          },
          _sum: { amountDue: true },
        }),
        db.payment.aggregate({
          where: { createdAt: reportRange },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        db.refund.aggregate({
          where: {
            createdAt: reportRange,
            status: { in: [RefundStatus.PARTIALLY_REFUNDED, RefundStatus.REFUNDED] },
          },
          _sum: { amount: true },
        }),
        db.booking.groupBy({
          by: ['serviceId'],
          where: { deletedAt: null, createdAt: reportRange },
          _count: { _all: true },
          _sum: { totalPrice: true, amountPaid: true },
        }),
        db.booking.groupBy({
          by: ['branchId'],
          where: { deletedAt: null, createdAt: reportRange },
          _count: { _all: true },
          _sum: { totalPrice: true, amountPaid: true },
        }),
        db.booking.groupBy({
          by: ['assignedTeamId'],
          where: { deletedAt: null, createdAt: reportRange, assignedTeamId: { not: null } },
          _count: { _all: true },
          _sum: { totalPrice: true, amountPaid: true },
        }),
        db.cancellationRequest.groupBy({
          by: ['reason'],
          where: { createdAt: reportRange },
          _count: { _all: true },
        }),
        db.customerSubscription.count({ where: { createdAt: reportRange } }),
        db.subscriptionVisitLedger.aggregate({
          where: { action: 'BOOKING_COMPLETED', createdAt: reportRange },
          _sum: { visitChange: true },
        }),
        db.complaint.count({ where: { createdAt: reportRange } }),
      ])
    : [
        [],
        { _avg: { totalPrice: null } },
        { _sum: { amountDue: null } },
        { _sum: { amount: null }, _count: { _all: 0 } },
        { _sum: { amount: null } },
        [],
        [],
        [],
        [],
        0,
        { _sum: { visitChange: null } },
        0,
      ];

  const branches = branchesRaw.map((branch) => ({
    id: branch.id,
    nameAr: branch.nameAr,
    code: branch.code,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    status: branch.status,
    timezone: branch.timezone,
    assignmentMode: branch.assignmentMode,
    dailyBookingLimit: branch.dailyBookingLimit,
    todayBookings: branch._count.bookings,
    teamCount: branch._count.teams,
    zoneCount: branch._count.coverageZones,
    activePaymentMethodCount: branch._count.paymentMethods,
  }));

  const teams = teamsRaw.map((team) => ({
    id: team.id,
    name: team.name,
    branchId: team.branchId,
    branchName: team.branch.nameAr,
    dailyCapacity: team.dailyCapacity,
    active: team.active,
    assignmentPriority: team.assignmentPriority,
    todayBookingCount: team._count.bookings,
    members: team.members.map((member) => ({
      id: member.user.id,
      fullName: member.user.fullName,
      phone: member.user.phone,
      isLeader: member.isLeader,
    })),
    zones: team.teamZones.map(({ zone }) => ({ id: zone.id, name: zone.name })),
    capabilities: team.capabilities.map(({ service }) => ({ id: service.id, name: service.nameAr })),
  }));

  const serviceNames = new Map(servicesRaw.map((service) => [service.id, service.nameAr]));
  const branchNames = new Map(branchesRaw.map((branch) => [branch.id, branch.nameAr]));
  const teamNames = new Map(teamsRaw.map((team) => [team.id, team.name]));
  const activeSubscriptionsMap = new Map(
    activeSubscriptionsByPlan.map((item) => [item.planId, item._count._all]),
  );

  const reportTotalBookings = reportStatusGroups.reduce((total, group) => total + group._count._all, 0);
  const completedInRange = reportStatusGroups
    .filter((group) => COMPLETED_BOOKING_STATUSES.includes(group.bookingStatus))
    .reduce((total, group) => total + group._count._all, 0);
  const collectedAmount = reportPaymentAggregate._sum.amount ?? 0;
  const refundedAmount = reportRefundAggregate._sum.amount ?? 0;
  const totalTeamCapacity = teams
    .filter((team) => team.active)
    .reduce((total, team) => total + team.dailyCapacity, 0);
  const todayAssignedBookings = teams
    .filter((team) => team.active)
    .reduce((total, team) => total + team.todayBookingCount, 0);

  const metrics = {
    todayBookings: todayStatusGroups.reduce((total, group) => total + group._count._all, 0),
    upcomingBookings,
    awaitingPayment: countForStatus(
      paymentStatusGroups,
      'paymentStatus',
      [PaymentStatus.AWAITING_PROOF, PaymentStatus.PROOF_UPLOADED, PaymentStatus.UNDER_REVIEW],
    ),
    pendingProofs: countForStatus(proofStatusGroups, 'status', [ProofStatus.UNDER_REVIEW]),
    operationsReview: countForStatus(
      allStatusGroups,
      'bookingStatus',
      [BookingStatus.AWAITING_OPERATIONS_REVIEW],
    ),
    unassignedBookings: unassignedBookingCount,
    inProgress: countForStatus(allStatusGroups, 'bookingStatus', IN_PROGRESS_BOOKING_STATUSES),
    completedToday: countForStatus(todayStatusGroups, 'bookingStatus', COMPLETED_BOOKING_STATUSES),
    pendingCancellations: countForStatus(cancellationStatusGroups, 'status', ['PENDING', 'ESCALATED']),
    pendingRefunds: countForStatus(
      refundStatusGroups,
      'status',
      [RefundStatus.REFUND_PENDING, RefundStatus.REFUND_PROCESSING],
    ),
    activeSubscriptions: countForStatus(
      subscriptionStatusGroups,
      'status',
      [SubscriptionStatus.ACTIVE],
    ),
    revenueToday: paymentToday._sum.amount ?? 0,
    revenueMonth: paymentMonth._sum.amount ?? 0,
    pendingAmounts: pendingDue._sum.amountDue ?? 0,
    newCustomersMonth,
    repeatCustomers: repeatCustomerGroups.filter((group) => group._count._all > 1).length,
    teamUtilization: totalTeamCapacity > 0
      ? Math.min(100, Math.round((todayAssignedBookings / totalTeamCapacity) * 100))
      : 0,
    qualityOpen:
      countForStatus(allStatusGroups, 'bookingStatus', [BookingStatus.QUALITY_REVIEW]) +
      countForStatus(
        complaintStatusGroups,
        'status',
        [ComplaintStatus.OPEN, ComplaintStatus.UNDER_REVIEW, ComplaintStatus.ACTION_REQUIRED],
      ),
    completionRate: reportTotalBookings > 0
      ? Math.round((completedInRange / reportTotalBookings) * 100)
      : 0,
    visitsRemaining: activeVisitTotals._sum.remainingVisits ?? 0,
  };

  return (
    <OwnerCommandCenter
      owner={{
        id: owner.id,
        fullName: owner.fullName,
        phone: owner.phone,
        role: owner.role,
      }}
      brand={brandRaw ?? { brandNameAr: 'بريق', brandNameEn: 'Bareeq', maxBranches: 1 }}
      currentSection={currentSection}
      metrics={metrics}
      filters={{ bookingQuery, bookingStatus: bookingStatus ?? '' }}
      customerQuery={customerQuery}
      pendingProofs={pendingProofsRaw.map((proof) => ({
        id: proof.id,
        senderName: proof.senderName,
        senderPhoneOrAccount: proof.senderPhoneOrAccount,
        referenceNumber: proof.referenceNumber,
        amountSubmitted: proof.amountSubmitted,
        expectedAmount: Math.max(
          0,
          Math.min(
            proof.booking.amountDue,
            proof.booking.depositAmount - proof.booking.amountPaid,
          ),
        ),
        transferTimestamp: proof.transferTimestamp.toISOString(),
        createdAt: proof.createdAt.toISOString(),
        proofFileUrl: proof.proofFileUrl,
        paymentMethodName: proof.paymentMethod.name,
        paymentAccount: proof.paymentMethod.accountNumber,
        booking: toBookingDto(proof.booking),
      }))}
      operationsReviewBookings={operationsReviewRaw.map(toBookingDto)}
      unassignedBookings={unassignedRaw.map(toBookingDto)}
      cancellationRequests={cancellationsRaw.map((request) => ({
        id: request.id,
        reason: request.reason,
        preferredAction: request.preferredAction,
        customerNotes: request.customerNotes,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        booking: toBookingDto(request.booking),
      }))}
      pendingRefunds={refundsRaw.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        refundMethod: refund.refundMethod,
        referenceNumber: refund.referenceNumber,
        status: refund.status,
        createdAt: refund.createdAt.toISOString(),
        booking: toBookingDto(refund.booking),
      }))}
      qualityBookings={qualityRaw.map((booking) => ({
        booking: toBookingDto(booking),
        beforePhotos: booking.files.filter((file) => file.fileType === FileType.BEFORE_SERVICE).length,
        afterPhotos: booking.files.filter((file) => file.fileType === FileType.AFTER_SERVICE).length,
        minimumBeforePhotos: booking.service.minimumBeforePhotos,
        minimumAfterPhotos: booking.service.minimumAfterPhotos,
      }))}
      complaints={complaintsRaw.map((complaint) => ({
        id: complaint.id,
        type: complaint.type,
        description: complaint.description,
        priority: complaint.priority,
        status: complaint.status,
        createdAt: complaint.createdAt.toISOString(),
        bookingNumber: complaint.booking.bookingNumber,
        customerName: complaint.customer.user.fullName,
      }))}
      bookings={bookingsRaw.map(toBookingDto)}
      teams={teams}
      branches={branches}
      services={servicesRaw.map((service) => ({
        id: service.id,
        nameAr: service.nameAr,
        slug: service.slug,
        basePrice: service.basePrice,
        durationMinutes: service.durationMinutes,
        active: service.active,
        bookableOnline: service.bookableOnline,
        subscriptionEligible: service.subscriptionEligible,
        variantCount: service._count.variants,
        addonCount: service._count.addonLinks,
        bookingCount: service._count.bookings,
      }))}
      plans={plansRaw.map((plan) => ({
        id: plan.id,
        nameAr: plan.nameAr,
        descriptionAr: plan.descriptionAr,
        price: plan.price,
        validityDays: plan.validityDays,
        visitCount: plan.visitCount,
        allowedVehicleCount: plan.allowedVehicleCount,
        active: plan.active,
        subscriptionCount: plan._count.subscriptions,
        activeSubscriptionCount: activeSubscriptionsMap.get(plan.id) ?? 0,
      }))}
      subscriptions={subscriptionsRaw.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate.toISOString(),
        endDate: subscription.endDate.toISOString(),
        totalVisits: subscription.totalVisits,
        usedVisits: subscription.usedVisits,
        remainingVisits: subscription.remainingVisits,
        customerName: subscription.customer.user.fullName,
        customerPhone: subscription.customer.user.phone,
        planName: subscription.plan.nameAr,
        branchName: subscription.branch.nameAr,
        vehicleCount: subscription._count.vehicles,
      }))}
      customers={customersRaw.map((customer) => ({
        id: customer.id,
        fullName: customer.user.fullName,
        phone: customer.user.phone,
        whatsapp: customer.user.whatsapp,
        email: customer.user.email,
        active: customer.user.active,
        mustChangePwd: customer.user.mustChangePwd,
        notes: customer.notes,
        creditBalance: customer.creditBalance,
        totalSpent: customer.bookings.reduce((sum, b) => sum + b.amountPaid, 0),
        createdAt: customer.createdAt.toISOString(),
        bookingCount: customer._count.bookings,
        vehicleCount: customer._count.vehicles,
        subscriptionCount: customer._count.subscriptions,
        lastBookingAt: customer.bookings[0]?.startAt.toISOString() ?? null,
        vehicles: customer.vehicles.map((v) => ({
          id: v.id,
          make: v.make,
          model: v.model,
          year: v.year,
          color: v.color,
          plateNumber: v.plateNumber,
          vehicleSize: v.vehicleSize,
          isDefault: v.isDefault,
        })),
        addresses: customer.addresses.map((a) => ({
          id: a.id,
          compound: a.compound,
          district: a.district,
          street: a.street,
          buildingNumber: a.buildingNumber,
          isDefault: a.isDefault,
        })),
        recentBookings: customer.bookings.map((b) => ({
          id: b.id,
          bookingNumber: b.bookingNumber,
          startAt: b.startAt.toISOString(),
          status: b.bookingStatus,
          totalPrice: b.totalPrice,
          amountPaid: b.amountPaid,
          serviceName: b.service.nameAr,
        })),
      }))}
      auditLogs={auditLogsRaw.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        actorName: log.actor?.fullName ?? 'النظام',
        actorRole: log.actorRole,
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
      }))}
      branchRequests={branchRequestsRaw.map((request) => ({
        id: request.id,
        branchName: request.branchName,
        reason: request.reason,
        status: request.status,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
      }))}
      reports={{
        from: reportFrom,
        to: reportTo,
        totalBookings: reportTotalBookings,
        completedBookings: completedInRange,
        cancelledBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.CANCELLED]),
        rejectedBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.REJECTED]),
        noShowBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.CUSTOMER_NO_SHOW]),
        accessDeniedBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.ACCESS_DENIED]),
        collectedAmount,
        refundedAmount,
        netCollected: collectedAmount - refundedAmount,
        amountDue: reportDueAggregate._sum?.amountDue ?? 0,
        averageBookingValue: Math.round(reportBookingAggregate._avg?.totalPrice ?? 0),
        newSubscriptions: reportNewSubscriptions,
        visitsConsumed: Math.abs(Math.min(0, reportVisits._sum?.visitChange ?? 0)),
        complaintCount: reportComplaintCount,
        byStatus: reportStatusGroups
          .map((group) => ({ status: group.bookingStatus, count: group._count._all }))
          .sort((a, b) => b.count - a.count),
        byService: reportByServiceRaw
          .map((row) => ({
            id: row.serviceId,
            label: serviceNames.get(row.serviceId) ?? 'خدمة محذوفة',
            count: row._count._all,
            totalPrice: row._sum.totalPrice ?? 0,
            amountPaid: row._sum.amountPaid ?? 0,
          }))
          .sort((a, b) => b.count - a.count),
        byBranch: reportByBranchRaw
          .map((row) => ({
            id: row.branchId,
            label: branchNames.get(row.branchId) ?? 'فرع غير متاح',
            count: row._count._all,
            totalPrice: row._sum.totalPrice ?? 0,
            amountPaid: row._sum.amountPaid ?? 0,
          }))
          .sort((a, b) => b.count - a.count),
        byTeam: reportByTeamRaw
          .filter((row): row is typeof row & { assignedTeamId: string } => Boolean(row.assignedTeamId))
          .map((row) => ({
            id: row.assignedTeamId,
            label: teamNames.get(row.assignedTeamId) ?? 'فريق غير متاح',
            count: row._count._all,
            totalPrice: row._sum.totalPrice ?? 0,
            amountPaid: row._sum.amountPaid ?? 0,
          }))
          .sort((a, b) => b.count - a.count),
        cancellationReasons: reportCancellationReasonsRaw
          .map((row) => ({ reason: row.reason, count: row._count._all }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      }}
    />
  );
}

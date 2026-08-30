import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  BookingStatus,
  ComplaintStatus,
  PaymentStatus,
  Prisma,
  ProofStatus,
  RefundStatus,
  SubscriptionPaymentProofStatus,
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
  type MonthlyRevenueDataDto,
  type OwnerSection,
  type OverviewTab,
} from './OwnerCommandCenter';
import type { ManagedSubscription } from './subscriptions/SubscriptionManagementPanel';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'كاش عند الاستلام',
  INSTAPAY: 'إنستاباي (تحويل بنكي)',
  VODAFONE_CASH: 'فودافون كاش',
  ORANGE_CASH: 'أورنج كاش',
  ETISALAT_CASH: 'اتصالات كاش',
  SMART_WALLET: 'محفظة ذكية',
  CARD: 'بطاقة ائتمان',
  OTHER: 'أخرى',
};

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
  'subscriptions',
  'payments',
  'cancellations',
  'teams',
  'branches',
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
  paymentProofs: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      id: true,
      proofFileUrl: true,
      amountSubmitted: true,
      referenceNumber: true,
      status: true,
      reviewNotes: true,
      createdAt: true,
      paymentMethod: { select: { name: true } },
    },
  },
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
  const latestProof = booking.paymentProofs?.[0] ?? null;
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
    paymentProof: latestProof ? {
      id: latestProof.id,
      proofFileUrl: latestProof.proofFileUrl,
      amountSubmitted: latestProof.amountSubmitted,
      referenceNumber: latestProof.referenceNumber,
      status: latestProof.status,
      reviewNotes: latestProof.reviewNotes,
      createdAt: latestProof.createdAt.toISOString(),
      paymentMethodName: latestProof.paymentMethod.name,
    } : null,
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

async function getMonthlyRevenueData(
  dateRange: { gte: Date; lt: Date },
  branchesRaw: Array<{ nameAr: string }>,
  fromDate: string,
  toDate: string,
  revenueTypeParam: 'all' | 'booking' | 'subscription' | 'refund',
  revenueQueryParam: string,
): Promise<MonthlyRevenueDataDto> {
  const [bookingPayments, subscriptionProofs, refunds] = await Promise.all([
    db.payment.findMany({
      where: {
        createdAt: dateRange,
      },
      include: {
        booking: {
          include: {
            customer: { include: { user: true } },
            service: true,
            branch: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.subscriptionPaymentProof.findMany({
      where: {
        status: SubscriptionPaymentProofStatus.APPROVED,
        reviewedAt: dateRange,
      },
      include: {
        subscription: {
          include: {
            customer: { include: { user: true } },
            plan: true,
            branch: true,
          },
        },
        paymentMethod: true,
      },
      orderBy: { reviewedAt: 'desc' },
    }),
    db.refund.findMany({
      where: {
        status: { in: [RefundStatus.REFUNDED, RefundStatus.PARTIALLY_REFUNDED] },
        createdAt: dateRange,
      },
      include: {
        booking: {
          include: {
            customer: { include: { user: true } },
            service: true,
            branch: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalBookingRevenue = bookingPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalSubscriptionRevenue = subscriptionProofs.reduce((sum, p) => sum + p.amountSubmitted, 0);
  const totalGrossRevenue = totalBookingRevenue + totalSubscriptionRevenue;
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = totalGrossRevenue - totalRefunds;

  const paymentMethodMap: Record<string, { label: string; amount: number; count: number }> = {};
  for (const p of bookingPayments) {
    const methodKey = p.paymentMethod || 'OTHER';
    const label = PAYMENT_METHOD_LABELS[methodKey] || methodKey;
    if (!paymentMethodMap[methodKey]) paymentMethodMap[methodKey] = { label, amount: 0, count: 0 };
    paymentMethodMap[methodKey].amount += p.amount;
    paymentMethodMap[methodKey].count += 1;
  }
  for (const sp of subscriptionProofs) {
    const methodKey = sp.paymentMethod.name || 'OTHER';
    if (!paymentMethodMap[methodKey]) paymentMethodMap[methodKey] = { label: methodKey, amount: 0, count: 0 };
    paymentMethodMap[methodKey].amount += sp.amountSubmitted;
    paymentMethodMap[methodKey].count += 1;
  }
  const paymentMethodsList = Object.entries(paymentMethodMap).map(([key, item]) => ({
    key,
    label: item.label,
    amount: item.amount,
    count: item.count,
    percentage: totalGrossRevenue > 0 ? Math.round((item.amount / totalGrossRevenue) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount);

  const branchMap: Record<string, { name: string; amount: number; count: number }> = {};
  for (const b of branchesRaw) {
    branchMap[b.nameAr] = { name: b.nameAr, amount: 0, count: 0 };
  }
  for (const p of bookingPayments) {
    const bName = p.booking.branch.nameAr;
    if (!branchMap[bName]) branchMap[bName] = { name: bName, amount: 0, count: 0 };
    branchMap[bName].amount += p.amount;
    branchMap[bName].count += 1;
  }
  for (const sp of subscriptionProofs) {
    const bName = sp.subscription.branch.nameAr;
    if (!branchMap[bName]) branchMap[bName] = { name: bName, amount: 0, count: 0 };
    branchMap[bName].amount += sp.amountSubmitted;
    branchMap[bName].count += 1;
  }
  const branchRevenueList = Object.values(branchMap).map((b) => ({
    name: b.name,
    amount: b.amount,
    count: b.count,
    percentage: totalGrossRevenue > 0 ? Math.round((b.amount / totalGrossRevenue) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount);

  const allTx = [
    ...bookingPayments.map((p) => ({
      id: p.id,
      date: p.createdAt.toISOString(),
      type: 'BOOKING' as const,
      customerName: p.booking.customer.user.fullName,
      customerPhone: p.booking.customer.user.phone,
      title: `حجز: ${p.booking.service.nameAr}`,
      branchName: p.booking.branch.nameAr,
      paymentMethod: PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
      amount: p.amount,
      reference: p.booking.bookingNumber,
    })),
    ...subscriptionProofs.map((sp) => ({
      id: sp.id,
      date: (sp.reviewedAt ?? sp.createdAt).toISOString(),
      type: 'SUBSCRIPTION' as const,
      customerName: sp.subscription.customer.user.fullName,
      customerPhone: sp.subscription.customer.user.phone,
      title: `اشتراك: ${sp.subscription.plan.nameAr}`,
      branchName: sp.subscription.branch.nameAr,
      paymentMethod: sp.paymentMethod.name,
      amount: sp.amountSubmitted,
      reference: `SUB-${sp.subscriptionId.slice(0, 8).toUpperCase()}`,
    })),
    ...refunds.map((r) => ({
      id: r.id,
      date: r.createdAt.toISOString(),
      type: 'REFUND' as const,
      customerName: r.booking.customer.user.fullName,
      customerPhone: r.booking.customer.user.phone,
      title: `استرداد: ${r.booking.service.nameAr}`,
      branchName: r.booking.branch.nameAr,
      paymentMethod: 'استرداد معتمد',
      amount: -r.amount,
      reference: r.booking.bookingNumber,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredTx = allTx.filter((tx) => {
    if (revenueTypeParam === 'booking' && tx.type !== 'BOOKING') return false;
    if (revenueTypeParam === 'subscription' && tx.type !== 'SUBSCRIPTION') return false;
    if (revenueTypeParam === 'refund' && tx.type !== 'REFUND') return false;
    if (revenueQueryParam) {
      const q = revenueQueryParam.toLowerCase();
      const match =
        tx.customerName.toLowerCase().includes(q) ||
        tx.customerPhone.includes(q) ||
        tx.reference.toLowerCase().includes(q) ||
        tx.branchName.toLowerCase().includes(q) ||
        tx.title.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return {
    from: fromDate,
    to: toDate,
    grossRevenue: totalGrossRevenue,
    netRevenue,
    bookingRevenue: totalBookingRevenue,
    subscriptionRevenue: totalSubscriptionRevenue,
    refundsTotal: totalRefunds,
    bookingPaymentsCount: bookingPayments.length,
    subscriptionProofsCount: subscriptionProofs.length,
    refundsCount: refunds.length,
    paymentMethods: paymentMethodsList,
    branches: branchRevenueList,
    transactions: filteredTx,
    filterType: revenueTypeParam,
    searchQuery: revenueQueryParam,
    exportUrl: `/admin/revenue/export?from=${fromDate}&to=${toDate}`,
  };
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

  const rawTab = firstParam(query.tab);
  const overviewTab: OverviewTab =
    rawTab === 'revenue'
      ? 'revenue'
      : rawTab === 'analytics' || rawTab === 'reports'
        ? 'analytics'
        : 'pulse';

  const rawSection = firstParam(query.section);
  if (rawSection === 'services') {
    redirect('/admin/site?tab=services');
  }
  if (rawSection === 'teams') {
    redirect('/admin/setup');
  }
  if (rawSection === 'payments') {
    redirect('/admin?section=overview&tab=revenue');
  }
  if (rawSection === 'cancellations') {
    redirect('/admin?section=bookings&status=CANCELLED');
  }
  if (rawSection === 'quality') {
    redirect('/admin/reviews');
  }
  if (rawSection === 'revenue') {
    redirect('/admin?section=overview&tab=revenue');
  }
  if (rawSection === 'reports') {
    redirect('/admin?section=overview&tab=analytics');
  }
  const currentSection = rawSection && VALID_SECTIONS.has(rawSection as OwnerSection)
    ? (rawSection as OwnerSection)
    : 'overview';
  const bookingQuery = (firstParam(query.q) ?? '').trim().slice(0, 100);
  const customerQuery = (firstParam(query.customer_q) ?? '').trim().slice(0, 100);
  const normalizedCustomerPhoneQuery = normalizePhone(customerQuery);
  const rawBookingStatus = firstParam(query.status);
  const bookingStatus = rawBookingStatus && Object.values(BookingStatus).includes(rawBookingStatus as BookingStatus)
    ? rawBookingStatus as BookingStatus
    : undefined;

  const revenueTypeParam = (firstParam(query.revenue_type) ?? firstParam(query.type) ?? 'all') as 'all' | 'booking' | 'subscription' | 'refund';
  const revenueQueryParam = (firstParam(query.revenue_q) ?? '').trim().slice(0, 100);

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
        nameEn: true,
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
  const isSubscriptions = currentSection === 'subscriptions';
  const isCustomers = currentSection === 'customers';
  const isAudit = currentSection === 'audit';
  const isReports = currentSection === 'reports' || isOverview;
  const isRevenue = isOverview;

  // Overview quick cards & Bookings list
  const [pendingProofsRaw, operationsReviewRaw, unassignedRaw, bookingsRaw] = await Promise.all([
    isOverview
      ? db.paymentProof.findMany({
          where: { status: ProofStatus.UNDER_REVIEW },
          take: 5,
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

  // Reports, Subscriptions, Customers, and Audit
  const [
    servicesRaw,
    subscriptionsRaw,
    customersRaw,
    auditLogsRaw,
  ] = await Promise.all([
    isReports
      ? db.service.findMany({
          select: { id: true, nameAr: true },
        })
      : Promise.resolve([]),
    isSubscriptions
      ? db.customerSubscription.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            status: true,
            purchasePrice: true,
            totalVisits: true,
            usedVisits: true,
            remainingVisits: true,
            endDate: true,
            customer: {
              select: {
                user: { select: { fullName: true, phone: true } },
              },
            },
            plan: {
              select: {
                nameAr: true,
                price: true,
                freezeAllowed: true,
                maxFreezeDays: true,
              },
            },
            branch: { select: { nameAr: true } },
            serviceBalances: {
              select: {
                serviceId: true,
                totalVisits: true,
                remainingVisits: true,
                service: { select: { nameAr: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
            paymentProofs: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
                proofFileUrl: true,
                amountSubmitted: true,
                referenceNumber: true,
                status: true,
                reviewNotes: true,
                createdAt: true,
                paymentMethod: { select: { name: true } },
              },
            },
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
  ]);

  // Revenue Ledger Queries (Calculated for the exact selected date range)
  const monthlyRevenueData = isRevenue
    ? await getMonthlyRevenueData(
        reportRange,
        branchesRaw,
        reportFrom,
        reportTo,
        revenueTypeParam,
        revenueQueryParam,
      )
    : undefined;

  // Reporting Analytics (Calculated for the exact selected date range when viewing Reports section)
  let reportStatusGroups: Array<{ bookingStatus: BookingStatus; _count: { _all: number } }> = [];
  let reportBookingAggregate = { _avg: { totalPrice: null as number | null } };
  let reportDueAggregate = { _sum: { amountDue: null as number | null } };
  let reportPaymentAggregate = { _sum: { amount: null as number | null }, _count: { _all: 0 } };
  let reportRefundAggregate = { _sum: { amount: null as number | null } };
  let reportByServiceRaw: Array<{ serviceId: string; _count: { _all: number }; _sum: { totalPrice: number | null; amountPaid: number | null } }> = [];
  let reportByBranchRaw: Array<{ branchId: string; _count: { _all: number }; _sum: { totalPrice: number | null; amountPaid: number | null } }> = [];
  let reportByTeamRaw: Array<{ assignedTeamId: string | null; _count: { _all: number }; _sum: { totalPrice: number | null; amountPaid: number | null } }> = [];
  let reportCancellationReasonsRaw: Array<{ reason: string; _count: { _all: number } }> = [];
  let reportNewSubscriptions = 0;
  let reportVisits = { _sum: { visitChange: null as number | null } };
  let reportComplaintCount = 0;
  let reportNewCustomers = 0;
  let reportRepeatCustomerGroups: Array<{ customerId: string; _count: { _all: number } }> = [];
  let reportQualityOpenBookings = 0;
  let reportActiveSubscriptions = 0;
  let reportRemainingVisitsAggregate = { _sum: { remainingVisits: null as number | null } };
  let reportTeamAssignedBookings = 0;

  if (isReports) {
    const reportBookingWhere: Prisma.BookingWhereInput = {
      deletedAt: null,
      OR: [{ createdAt: reportRange }, { startAt: reportRange }],
    };

    // Batch 1: Core Financial & Booking aggregates (5 queries)
    const [statusGroups, bookingAgg, dueAgg, paymentAgg, refundAgg] = await Promise.all([
      db.booking.groupBy({
        by: ['bookingStatus'],
        where: reportBookingWhere,
        _count: { _all: true },
      }),
      db.booking.aggregate({
        where: reportBookingWhere,
        _avg: { totalPrice: true },
      }),
      db.booking.aggregate({
        where: {
          ...reportBookingWhere,
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
    ]);
    reportStatusGroups = statusGroups;
    reportBookingAggregate = bookingAgg;
    reportDueAggregate = dueAgg;
    reportPaymentAggregate = paymentAgg;
    reportRefundAggregate = refundAgg;

    // Batch 2: Groupings by Service, Branch, Team, Cancellation (4 queries)
    const [byService, byBranch, byTeam, cancelReasons] = await Promise.all([
      db.booking.groupBy({
        by: ['serviceId'],
        where: reportBookingWhere,
        _count: { _all: true },
        _sum: { totalPrice: true, amountPaid: true },
      }),
      db.booking.groupBy({
        by: ['branchId'],
        where: reportBookingWhere,
        _count: { _all: true },
        _sum: { totalPrice: true, amountPaid: true },
      }),
      db.booking.groupBy({
        by: ['assignedTeamId'],
        where: { ...reportBookingWhere, assignedTeamId: { not: null } },
        _count: { _all: true },
        _sum: { totalPrice: true, amountPaid: true },
      }),
      db.cancellationRequest.groupBy({
        by: ['reason'],
        where: { createdAt: reportRange },
        _count: { _all: true },
      }),
    ]);
    reportByServiceRaw = byService;
    reportByBranchRaw = byBranch;
    reportByTeamRaw = byTeam;
    reportCancellationReasonsRaw = cancelReasons;

    // Batch 3: Customers, Subscriptions & Quality (9 queries)
    const [
      newSubs,
      visitsAgg,
      complaints,
      newCust,
      repeatCust,
      qualityOpen,
      activeSubs,
      remainingVisits,
      teamAssigned,
    ] = await Promise.all([
      db.customerSubscription.count({ where: { createdAt: reportRange } }),
      db.subscriptionVisitLedger.aggregate({
        where: { action: 'BOOKING_COMPLETED', createdAt: reportRange },
        _sum: { visitChange: true },
      }),
      db.complaint.count({ where: { createdAt: reportRange } }),
      db.customerProfile.count({ where: { createdAt: reportRange } }),
      db.booking.groupBy({
        by: ['customerId'],
        where: reportBookingWhere,
        _count: { _all: true },
      }),
      db.booking.count({
        where: { ...reportBookingWhere, bookingStatus: BookingStatus.QUALITY_REVIEW },
      }),
      db.customerSubscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      db.customerSubscription.aggregate({
        where: { status: SubscriptionStatus.ACTIVE },
        _sum: { remainingVisits: true },
      }),
      db.booking.count({
        where: { ...reportBookingWhere, assignedTeamId: { not: null } },
      }),
    ]);
    reportNewSubscriptions = newSubs;
    reportVisits = visitsAgg;
    reportComplaintCount = complaints;
    reportNewCustomers = newCust;
    reportRepeatCustomerGroups = repeatCust;
    reportQualityOpenBookings = qualityOpen;
    reportActiveSubscriptions = activeSubs;
    reportRemainingVisitsAggregate = remainingVisits;
    reportTeamAssignedBookings = teamAssigned;
  }

  const branches = branchesRaw.map((branch) => ({
    id: branch.id,
    nameAr: branch.nameAr,
    nameEn: branch.nameEn,
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

  const reportTotalBookings = reportStatusGroups.reduce((total, group) => total + group._count._all, 0);
  const completedInRange = reportStatusGroups
    .filter((group) => COMPLETED_BOOKING_STATUSES.includes(group.bookingStatus))
    .reduce((total, group) => total + group._count._all, 0);
  const inProgressInRange = reportStatusGroups
    .filter((group) => IN_PROGRESS_BOOKING_STATUSES.includes(group.bookingStatus))
    .reduce((total, group) => total + group._count._all, 0);
  const collectedAmount = reportPaymentAggregate._sum.amount ?? 0;
  const refundedAmount = reportRefundAggregate._sum.amount ?? 0;
  const totalTeamCapacity = teams
    .filter((team) => team.active)
    .reduce((total, team) => total + team.dailyCapacity, 0);

  const daysInRange = Math.max(
    1,
    Math.round((reportEnd.getTime() - reportStart.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const periodTeamCapacity = totalTeamCapacity * daysInRange;
  const periodTeamUtilization = periodTeamCapacity > 0
    ? Math.min(100, Math.round((reportTeamAssignedBookings / periodTeamCapacity) * 100))
    : 0;

  const repeatCustomersCount = reportRepeatCustomerGroups.filter((g) => g._count._all > 1).length;
  const todayAssignedBookings = teams
    .filter((team) => team.active)
    .reduce((total, team) => total + team.todayBookingCount, 0);

  const totalAllCount = allStatusGroups.reduce((total, group) => total + group._count._all, 0);
  const totalCompletedCount = allStatusGroups
    .filter((group) => COMPLETED_BOOKING_STATUSES.includes(group.bookingStatus))
    .reduce((total, group) => total + group._count._all, 0);

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
      : totalAllCount > 0
      ? Math.round((totalCompletedCount / totalAllCount) * 100)
      : 0,
    visitsRemaining: activeVisitTotals._sum.remainingVisits ?? 0,
  };

  const managedSubscriptions: ManagedSubscription[] = subscriptionsRaw.map((sub) => ({
    id: sub.id,
    customerName: sub.customer.user.fullName,
    customerPhone: sub.customer.user.phone,
    planName: sub.plan.nameAr,
    expectedPrice: sub.plan.price,
    branchName: sub.branch.nameAr,
    status: sub.status,
    totalVisits: sub.totalVisits,
    usedVisits: sub.usedVisits,
    remainingVisits: sub.remainingVisits,
    endDate: sub.endDate.toISOString(),
    freezeAllowed: sub.plan.freezeAllowed,
    maxFreezeDays: sub.plan.maxFreezeDays,
    serviceBalances: sub.serviceBalances.map((sb) => ({
      serviceId: sb.serviceId,
      nameAr: sb.service.nameAr,
      totalVisits: sb.totalVisits,
      remainingVisits: sb.remainingVisits,
    })),
    paymentProof: sub.paymentProofs[0]
      ? {
          id: sub.paymentProofs[0].id,
          proofFileUrl: sub.paymentProofs[0].proofFileUrl,
          amountSubmitted: sub.paymentProofs[0].amountSubmitted,
          referenceNumber: sub.paymentProofs[0].referenceNumber,
          status: sub.paymentProofs[0].status,
          reviewNotes: sub.paymentProofs[0].reviewNotes,
          createdAt: sub.paymentProofs[0].createdAt.toISOString(),
          paymentMethod: { name: sub.paymentProofs[0].paymentMethod.name },
        }
      : null,
  }));

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
      overviewTab={overviewTab}
      monthlyRevenue={monthlyRevenueData}
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
      bookings={bookingsRaw.map(toBookingDto)}
      managedSubscriptions={managedSubscriptions}
      teams={teams}
      branches={branches}
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
      reports={{
        from: reportFrom,
        to: reportTo,
        totalBookings: reportTotalBookings,
        completedBookings: completedInRange,
        cancelledBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.CANCELLED]),
        inProgressBookings: inProgressInRange,
        rejectedBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.REJECTED]),
        noShowBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.CUSTOMER_NO_SHOW]),
        accessDeniedBookings: countForStatus(reportStatusGroups, 'bookingStatus', [BookingStatus.ACCESS_DENIED]),
        collectedAmount,
        refundedAmount,
        netCollected: collectedAmount - refundedAmount,
        amountDue: reportDueAggregate._sum?.amountDue ?? 0,
        averageBookingValue: Math.round(reportBookingAggregate._avg?.totalPrice ?? 0),
        newSubscriptions: reportNewSubscriptions,
        activeSubscriptions: reportActiveSubscriptions,
        visitsConsumed: Math.abs(Math.min(0, reportVisits._sum?.visitChange ?? 0)),
        visitsRemaining: reportRemainingVisitsAggregate._sum.remainingVisits ?? 0,
        newCustomers: reportNewCustomers,
        repeatCustomers: repeatCustomersCount,
        teamUtilization: periodTeamUtilization,
        qualityOpen: reportQualityOpenBookings + reportComplaintCount,
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

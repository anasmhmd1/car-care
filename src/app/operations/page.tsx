import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { BookingStatus, FileType, Prisma, UserRole } from '@prisma/client';
import {
  getAccessibleBranchIds,
  sanitizeClientData,
} from '@/lib/auth/authorization';
import { hasOperationalBookingFilePermission } from '@/lib/auth/booking-file-access';
import { localDateBoundsUtc } from '@/lib/engine/time';
import OperationsDashboardClient from './OperationsDashboardClient';
import OperationsCaseQueues from './OperationsCaseQueues';
import {
  evaluateCancellationPolicyRequest,
  readCancellationPolicySnapshot,
} from '@/lib/policies/cancellation';
import {
  hasPermission,
  type PermissionCode,
} from '@/lib/auth/permissions';
import {
  bookingPermissionWhere,
  canAccessBookingWithPermission,
  type BookingPermissionOverride,
} from './booking-scope-filter';
import {
  OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  operationsQueuePageParam,
  operationsQueueWindow,
  pageOperationsQueue,
  type OperationsDashboardQueueKey,
} from './pagination';

interface OperationsDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function searchValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 100) ?? '';
}

function bookingSearchWhere(query: string): Prisma.BookingWhereInput {
  if (!query) return {};
  return {
    OR: [
      { bookingNumber: { contains: query, mode: 'insensitive' } },
      { customer: { user: { fullName: { contains: query, mode: 'insensitive' } } } },
      { customer: { user: { phone: { contains: query } } } },
      { service: { nameAr: { contains: query, mode: 'insensitive' } } },
      { branch: { nameAr: { contains: query, mode: 'insensitive' } } },
    ],
  };
}

const operationsCustomerUserSelect = {
  id: true,
  fullName: true,
  phone: true,
} satisfies Prisma.UserSelect;

const operationsQueuePermissions = [
  'payment.review',
  'booking.accept',
  'booking.assign',
  'payment.record_balance',
  'booking.close',
  'booking.override_close',
  'cancellation.review',
  'refund.record_proof',
  'booking.reschedule',
  'quality.review',
  'complaint.manage',
  'refund.approve',
] as const satisfies readonly PermissionCode[];

function dashboardTabValue(
  value: string | string[] | undefined,
): OperationsDashboardQueueKey | undefined {
  const tab = searchValue(value);
  return ['proofs', 'review', 'unassigned', 'bookings', 'terminal'].includes(tab)
    ? tab as OperationsDashboardQueueKey
    : undefined;
}

function omitClientFields<T extends object, Key extends keyof T>(
  value: T,
  fields: readonly Key[],
): Omit<T, Key> {
  const copy = { ...value } as Partial<T>;
  for (const field of fields) delete copy[field];
  return copy as Omit<T, Key>;
}

type ScopedBooking = {
  branchId: string;
  assignedTeamId: string | null;
};
function getCairoDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function OperationsDashboardPage({ searchParams }: OperationsDashboardPageProps) {
  const query = await searchParams;
  const activeBookingQuery = searchValue(query.bookingQuery);
  const terminalBookingQuery = searchValue(query.terminalQuery);
  const todayDate = getCairoDateKey(new Date());
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowDate = getCairoDateKey(tomorrowObj);
  const rawDateParam = Array.isArray(query.date) ? query.date[0] : query.date;
  const selectedDate = typeof rawDateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDateParam)
    ? rawDateParam
    : undefined;
  const dateBounds = selectedDate ? localDateBoundsUtc(selectedDate, 'Africa/Cairo') : null;
  const bookingDateWhere: Prisma.BookingWhereInput = dateBounds
    ? {
        startAt: {
          gte: dateBounds.start,
          lt: dateBounds.end,
        },
      }
    : {};
  const manager = await requireRole([UserRole.OPERATIONS_MANAGER, UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const permissionSnapshotAt = new Date();
  const [branchIds, permissionRows, roleConfiguration] = await Promise.all([
    getAccessibleBranchIds(manager),
    db.userPermission.findMany({
      where: {
        userId: manager.id,
        permission: { code: { in: [...operationsQueuePermissions] } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: permissionSnapshotAt } }],
      },
      select: {
        effect: true,
        scopeType: true,
        scopeId: true,
        expiresAt: true,
        permission: { select: { code: true } },
      },
    }),
    db.role.findUnique({
      where: { code: manager.role },
      select: { permissions: true },
    }),
  ]);
  const overridesByPermission = new Map<PermissionCode, BookingPermissionOverride[]>();
  for (const row of permissionRows) {
    const permission = row.permission.code as PermissionCode;
    const overrides = overridesByPermission.get(permission) ?? [];
    overrides.push({
      effect: row.effect,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      expiresAt: row.expiresAt,
    });
    overridesByPermission.set(permission, overrides);
  }
  const permissionInput = (permission: PermissionCode) => ({
    role: manager.role,
    permission,
    overrides: overridesByPermission.get(permission) ?? [],
    configuredRolePermissions: roleConfiguration?.permissions,
    now: permissionSnapshotAt,
  });
  const bookingScopeWhere = (permission: PermissionCode) => (
    bookingPermissionWhere(permissionInput(permission))
  );
  const canAccessBookingQueue = (
    permission: PermissionCode,
    booking: ScopedBooking,
  ) => canAccessBookingWithPermission({
    ...permissionInput(permission),
    booking,
  });
  const filterByBookingPermission = <T,>(
    records: T[],
    permission: PermissionCode,
    getBooking: (record: T) => ScopedBooking,
  ) => records.filter((record) => canAccessBookingQueue(permission, getBooking(record)));
  const bookingBranchWhere = branchIds === null
    ? {}
    : { branchId: { in: branchIds } };
  const bookingWhereFor = (permission: PermissionCode): Prisma.BookingWhereInput => ({
    AND: [bookingBranchWhere, bookingScopeWhere(permission)],
  });
  const activeBookingPermissionWhere: Prisma.BookingWhereInput = {
    OR: [
      bookingScopeWhere('payment.record_balance'),
      ...(manager.role === UserRole.SYSTEM_SUPER_ADMIN
        ? []
        : [
          bookingScopeWhere('booking.close'),
          bookingScopeWhere('booking.override_close'),
        ]),
    ],
  };
  const dashboardTab = dashboardTabValue(query.dashboardTab);
  const queueWindows = {
    proofs: operationsQueueWindow(
      query[operationsQueuePageParam('proofs')],
      OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
    ),
    review: operationsQueueWindow(
      query[operationsQueuePageParam('review')],
      OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
    ),
    unassigned: operationsQueueWindow(
      query[operationsQueuePageParam('unassigned')],
      OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
    ),
    bookings: operationsQueueWindow(
      query[operationsQueuePageParam('bookings')],
      OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
    ),
    terminal: operationsQueueWindow(
      query[operationsQueuePageParam('terminal')],
      OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
    ),
    cancellations: operationsQueueWindow(
      query[operationsQueuePageParam('cancellations')],
      OPERATIONS_CASE_QUEUE_PAGE_SIZE,
    ),
    reschedules: operationsQueueWindow(
      query[operationsQueuePageParam('reschedules')],
      OPERATIONS_CASE_QUEUE_PAGE_SIZE,
    ),
    quality: operationsQueueWindow(
      query[operationsQueuePageParam('quality')],
      OPERATIONS_CASE_QUEUE_PAGE_SIZE,
    ),
    complaints: operationsQueueWindow(
      query[operationsQueuePageParam('complaints')],
      OPERATIONS_CASE_QUEUE_PAGE_SIZE,
    ),
    refunds: operationsQueueWindow(
      query[operationsQueuePageParam('refunds')],
      OPERATIONS_CASE_QUEUE_PAGE_SIZE,
    ),
  };

  // These queues are independent after the branch scope is known. Start every
  // query before awaiting so loading the dashboard does not form a DB waterfall.
  const accessibleBranchesPromise = db.branch.findMany({
    where: branchIds === null ? {} : { id: { in: branchIds } },
    select: { id: true, nameAr: true, status: true },
    orderBy: { nameAr: 'asc' },
  });
  const pendingProofsPromise = db.paymentProof.findMany({
    where: {
      status: 'UNDER_REVIEW',
      booking: {
        AND: [
          bookingWhereFor('payment.review'),
          ...(dateBounds ? [bookingDateWhere] : []),
        ],
      },
    },
    select: {
      id: true,
      senderName: true,
      senderPhoneOrAccount: true,
      referenceNumber: true,
      amountSubmitted: true,
      transferTimestamp: true,
      createdAt: true,
      proofFileUrl: true,
      booking: {
        select: {
          id: true,
          branchId: true,
          assignedTeamId: true,
          bookingNumber: true,
          depositAmount: true,
          amountPaid: true,
          amountDue: true,
          service: { select: { nameAr: true } },
          vehicle: { select: { make: true, model: true } },
          customer: { select: { user: { select: operationsCustomerUserSelect } } },
        },
      },
      paymentMethod: { select: { name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.proofs.skip,
    take: queueWindows.proofs.take,
  });
  const reviewBookingsPromise = db.booking.findMany({
    where: {
      AND: [
        bookingWhereFor('booking.accept'),
        ...(dateBounds ? [bookingDateWhere] : []),
        {
          bookingStatus: 'AWAITING_OPERATIONS_REVIEW',
          deletedAt: null,
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      assignedTeamId: true,
      bookingNumber: true,
      startAt: true,
      amountPaid: true,
      amountDue: true,
      paymentStatus: true,
      branch: { select: { id: true, nameAr: true, assignmentMode: true } },
      service: { select: { nameAr: true } },
      vehicle: { select: { make: true, model: true } },
      coverageArea: { select: { compound: true } },
      customer: { select: { user: { select: operationsCustomerUserSelect } } },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.review.skip,
    take: queueWindows.review.take,
  });
  const unassignedBookingsPromise = db.booking.findMany({
    where: {
      AND: [
        bookingWhereFor('booking.assign'),
        ...(dateBounds ? [bookingDateWhere] : []),
        {
          bookingStatus: { in: ['ACCEPTED', 'AWAITING_ASSIGNMENT', 'ADMIN_REVIEW_REQUIRED'] },
          terminalReopenSourceStatus: null,
          assignedTeamId: null,
          deletedAt: null,
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      assignedTeamId: true,
      bookingNumber: true,
      bookingStatus: true,
      startAt: true,
      branch: { select: { nameAr: true } },
      service: { select: { nameAr: true } },
      coverageArea: { select: { compound: true } },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.unassigned.skip,
    take: queueWindows.unassigned.take,
  });
  const activeBookingsPromise = db.booking.findMany({
    where: {
      AND: [
        bookingBranchWhere,
        activeBookingPermissionWhere,
        bookingSearchWhere(activeBookingQuery),
        ...(dateBounds ? [bookingDateWhere] : []),
        {
          deletedAt: null,
          bookingStatus: {
            notIn: ['CANCELLED', 'REJECTED', 'EXPIRED', 'CLOSED'],
          },
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      assignedTeamId: true,
      bookingNumber: true,
      bookingStatus: true,
      startAt: true,
      amountPaid: true,
      amountDue: true,
      paymentStatus: true,
      terminalReopenSourceStatus: true,
      service: { select: { nameAr: true } },
      assignedTeam: { select: { name: true } },
      customer: { select: { user: { select: operationsCustomerUserSelect } } },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.bookings.skip,
    take: queueWindows.bookings.take,
  });
  const terminalBookingsPromise = manager.role === UserRole.OWNER
    ? db.booking.findMany({
        where: {
          AND: [
            bookingSearchWhere(terminalBookingQuery),
            ...(dateBounds ? [bookingDateWhere] : []),
            {
              deletedAt: null,
              bookingStatus: {
                in: [
                  BookingStatus.CLOSED,
                  BookingStatus.CANCELLED,
                  BookingStatus.REJECTED,
                  BookingStatus.EXPIRED,
                ],
              },
            },
          ],
        },
        select: {
          id: true,
          bookingNumber: true,
          bookingStatus: true,
          paymentStatus: true,
          startAt: true,
          updatedAt: true,
          amountPaid: true,
          amountDue: true,
          branch: { select: { nameAr: true } },
          service: { select: { nameAr: true } },
          customer: { select: { user: { select: operationsCustomerUserSelect } } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: queueWindows.terminal.skip,
        take: queueWindows.terminal.take,
      })
    : [];
  const cancellationRequestsPromise = db.cancellationRequest.findMany({
    where: {
      OR: [
        {
          status: { in: ['PENDING', 'ESCALATED'] },
          booking: {
            AND: [
              { terminalReopenSourceStatus: null },
              bookingWhereFor('cancellation.review'),
            ],
          },
        },
        {
          status: 'APPROVED_REFUND_PENDING',
          booking: {
            AND: [
              { terminalReopenSourceStatus: null },
              bookingWhereFor('refund.record_proof'),
            ],
          },
        },
      ],
    },
    select: {
      id: true,
      bookingId: true,
      reason: true,
      preferredAction: true,
      alternativeDates: true,
      customerNotes: true,
      status: true,
      approvedRefundAmount: true,
      requestedAt: true,
      updatedAt: true,
      booking: {
        select: {
          branchId: true,
          assignedTeamId: true,
          bookingNumber: true,
          startAt: true,
          amountPaid: true,
          depositAmount: true,
          cancellationPolicySnapshot: true,
          branch: { select: { nameAr: true } },
          service: { select: { nameAr: true } },
          customer: { select: { user: { select: operationsCustomerUserSelect } } },
          refunds: { select: { amount: true, status: true } },
        },
      },
    },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.cancellations.skip,
    take: queueWindows.cancellations.take,
  });
  const rescheduleRequestsPromise = db.bookingTimeChange.findMany({
    where: {
      status: 'PENDING',
      booking: bookingWhereFor('booking.reschedule'),
    },
    select: {
      id: true,
      bookingId: true,
      oldStartAt: true,
      requestedStartAt: true,
      requestedAt: true,
      reason: true,
      reviewNotes: true,
      booking: {
        select: {
          branchId: true,
          assignedTeamId: true,
          bookingNumber: true,
          branch: { select: { nameAr: true } },
          service: { select: { nameAr: true } },
          customer: { select: { user: { select: operationsCustomerUserSelect } } },
        },
      },
    },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.reschedules.skip,
    take: queueWindows.reschedules.take,
  });
  const qualityBookingsPromise = db.booking.findMany({
    where: {
      AND: [
        bookingWhereFor('quality.review'),
        ...(dateBounds ? [bookingDateWhere] : []),
        {
          bookingStatus: 'QUALITY_REVIEW',
          deletedAt: null,
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      assignedTeamId: true,
      bookingNumber: true,
      branch: { select: { nameAr: true } },
      service: {
        select: {
          nameAr: true,
          checklistTemplates: {
            select: {
              id: true,
              name: true,
              stage: true,
              items: {
                select: {
                  id: true,
                  labelAr: true,
                  required: true,
                  descriptionAr: true,
                },
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      },
      customer: { select: { user: { select: operationsCustomerUserSelect } } },
      files: {
        where: { fileType: { in: ['BEFORE_SERVICE', 'AFTER_SERVICE'] } },
        select: { id: true, fileType: true, fileUrl: true, createdAt: true },
      },
      checklistInstances: {
        select: {
          id: true,
          stage: true,
          completedAt: true,
          results: {
            select: {
              id: true,
              itemId: true,
              itemLabel: true,
              isChecked: true,
              note: true,
              checkedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.quality.skip,
    take: queueWindows.quality.take,
  });

  const complaintsPromise = db.complaint.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      booking: bookingWhereFor('complaint.manage'),
    },
    select: {
      id: true,
      bookingId: true,
      type: true,
      description: true,
      priority: true,
      status: true,
      createdAt: true,
      booking: {
        select: {
          branchId: true,
          assignedTeamId: true,
          bookingNumber: true,
          branch: { select: { nameAr: true } },
          service: { select: { nameAr: true } },
        },
      },
      customer: { select: { user: { select: operationsCustomerUserSelect } } },
      assignedToUser: { select: { id: true, fullName: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.complaints.skip,
    take: queueWindows.complaints.take,
  });
  const refundsAwaitingApprovalPromise = db.refund.findMany({
    where: {
      status: 'REFUND_PROCESSING',
      booking: {
        AND: [
          { terminalReopenSourceStatus: null },
          bookingWhereFor('refund.approve'),
        ],
      },
    },
    select: {
      id: true,
      bookingId: true,
      amount: true,
      refundMethod: true,
      referenceNumber: true,
      proofFileUrl: true,
      createdAt: true,
      booking: {
        select: {
          branchId: true,
          assignedTeamId: true,
          bookingNumber: true,
          branch: { select: { nameAr: true } },
          customer: { select: { user: { select: operationsCustomerUserSelect } } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip: queueWindows.refunds.skip,
    take: queueWindows.refunds.take,
  });

  const managedSubscriptionsPromise = db.customerSubscription.findMany({
    where: branchIds === null ? {} : { branchId: { in: branchIds } },
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
  });

  const [
    accessibleBranches,
    pendingProofRows,
    reviewBookingRows,
    unassignedBookingRows,
    activeBookingRows,
    terminalBookingRows,
    cancellationRequestRows,
    rescheduleRequestRows,
    qualityBookingRows,
    complaintRows,
    refundRows,
    managedSubscriptionsRaw,
  ] = await Promise.all([
    accessibleBranchesPromise,
    pendingProofsPromise,
    reviewBookingsPromise,
    unassignedBookingsPromise,
    activeBookingsPromise,
    terminalBookingsPromise,
    cancellationRequestsPromise,
    rescheduleRequestsPromise,
    qualityBookingsPromise,
    complaintsPromise,
    refundsAwaitingApprovalPromise,
    managedSubscriptionsPromise,
  ]);
  const { records: pendingProofs, pagination: pendingProofsPagination } = pageOperationsQueue(
    pendingProofRows,
    queueWindows.proofs,
    OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  );
  const { records: reviewBookings, pagination: reviewBookingsPagination } = pageOperationsQueue(
    reviewBookingRows,
    queueWindows.review,
    OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  );
  const { records: unassignedBookings, pagination: unassignedBookingsPagination } = pageOperationsQueue(
    unassignedBookingRows,
    queueWindows.unassigned,
    OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  );
  const { records: activeBookings, pagination: activeBookingsPagination } = pageOperationsQueue(
    activeBookingRows,
    queueWindows.bookings,
    OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  );
  const { records: terminalBookings, pagination: terminalBookingsPagination } = pageOperationsQueue(
    terminalBookingRows,
    queueWindows.terminal,
    OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  );
  const { records: cancellationRequests, pagination: cancellationRequestsPagination } = pageOperationsQueue(
    cancellationRequestRows,
    queueWindows.cancellations,
    OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  );
  const { records: rescheduleRequests, pagination: rescheduleRequestsPagination } = pageOperationsQueue(
    rescheduleRequestRows,
    queueWindows.reschedules,
    OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  );
  const { records: qualityBookings, pagination: qualityBookingsPagination } = pageOperationsQueue(
    qualityBookingRows,
    queueWindows.quality,
    OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  );
  const { records: complaints, pagination: complaintsPagination } = pageOperationsQueue(
    complaintRows,
    queueWindows.complaints,
    OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  );
  const { records: refundsAwaitingApproval, pagination: refundsAwaitingApprovalPagination } = pageOperationsQueue(
    refundRows,
    queueWindows.refunds,
    OPERATIONS_CASE_QUEUE_PAGE_SIZE,
  );

  const operationalFileReadByScope = new Map<string, Promise<boolean>>();
  const canReadOperationalBookingFile = (
    fileType: FileType,
    booking: { branchId: string; assignedTeamId: string | null },
  ) => {
    const cacheKey = `${fileType}:${booking.branchId}:${booking.assignedTeamId ?? ''}`;
    const cached = operationalFileReadByScope.get(cacheKey);
    if (cached) return cached;
    const permission = hasOperationalBookingFilePermission(manager, {
      fileType,
      branchId: booking.branchId,
      assignedTeamId: booking.assignedTeamId,
    });
    operationalFileReadByScope.set(cacheKey, permission);
    return permission;
  };
  const [
    workforceAccess,
    [canEditGlobalPrices, priceBranchAccess, reviewBranchAccess],
    readablePendingProofs,
    readableReviewBookings,
    assignableBookings,
    readableQualityBookings,
    cancellationDecisions,
    [readableRescheduleRequests, readableComplaints, approvableRefunds],
    activeBookingDecisions,
  ] = await Promise.all([
    Promise.all(accessibleBranches.map((branch) => hasPermission(
      manager,
      'workforce.manage',
      { type: 'BRANCH', id: branch.id },
    ))),
    Promise.all([
      hasPermission(manager, 'catalog.price.manage'),
      Promise.all(accessibleBranches.map((branch) => hasPermission(
        manager,
        'catalog.price.manage',
        { type: 'BRANCH', id: branch.id },
      ))),
      Promise.all(accessibleBranches.map((branch) => hasPermission(
        manager,
        'quality.review',
        { type: 'BRANCH', id: branch.id },
      ))),
    ]),
    filterByBookingPermission(pendingProofs, 'payment.review', (proof) => proof.booking),
    filterByBookingPermission(reviewBookings, 'booking.accept', (booking) => booking),
    filterByBookingPermission(unassignedBookings, 'booking.assign', (booking) => booking),
    filterByBookingPermission(qualityBookings, 'quality.review', (booking) => booking),
    Promise.all(cancellationRequests.map(async (request) => ({
      request,
      allowed: await canAccessBookingQueue(
        request.status === 'APPROVED_REFUND_PENDING'
          ? 'refund.record_proof'
          : 'cancellation.review',
        request.booking,
      ),
    }))),
    Promise.all([
      filterByBookingPermission(rescheduleRequests, 'booking.reschedule', (request) => request.booking),
      filterByBookingPermission(complaints, 'complaint.manage', (complaint) => complaint.booking),
      filterByBookingPermission(refundsAwaitingApproval, 'refund.approve', (refund) => refund.booking),
    ]),
    Promise.all(activeBookings.map(async (booking) => {
      const managerOverrideRole = manager.role === UserRole.OPERATIONS_MANAGER
        || manager.role === UserRole.OWNER;
      const [canRecordBalancePayment, canCloseBooking, canManagerOverrideClose] = await Promise.all([
        canAccessBookingQueue('payment.record_balance', booking),
        manager.role === UserRole.SYSTEM_SUPER_ADMIN
          ? Promise.resolve(false)
          : canAccessBookingQueue('booking.close', booking),
        managerOverrideRole
          ? canAccessBookingQueue('booking.override_close', booking)
          : Promise.resolve(false),
      ]);
      return {
        booking,
        canRecordBalancePayment,
        canCloseBooking,
        canManagerOverrideClose,
      };
    })),
  ]);
  const canOpenWorkforce = workforceAccess.some(Boolean);
  const canOpenPricing = canEditGlobalPrices || priceBranchAccess.some(Boolean);
  const canOpenCustomerReviews = reviewBranchAccess.some(Boolean);
  const readableCancellationRequests = cancellationDecisions
    .filter(({ allowed }) => allowed)
    .map(({ request }) => request);
  const activeBookingsWithPermissions = activeBookingDecisions
    .filter((decision) => (
      decision.canRecordBalancePayment
      || decision.canCloseBooking
      || decision.canManagerOverrideClose
    ))
    .map(({ booking, ...permissions }) => ({ ...booking, ...permissions }));
  const [qualityBookingsWithAccessibleFiles, refundsAwaitingApprovalWithAccessibleProofs] = await Promise.all([
    Promise.all(readableQualityBookings.map(async (booking) => {
      if (!booking.files.length) return booking;
      const allowed = await canReadOperationalBookingFile(FileType.BEFORE_SERVICE, booking);
      return allowed ? booking : { ...booking, files: [] };
    })),
    Promise.all(approvableRefunds.map(async (refund) => {
      if (!refund.proofFileUrl) return refund;
      const allowed = await canReadOperationalBookingFile(FileType.REFUND_PROOF, refund.booking);
      return allowed ? refund : { ...refund, proofFileUrl: null };
    })),
  ]);

  const complaintBranchIds = [...new Set(
    readableComplaints.map((complaint) => complaint.booking.branchId),
  )];
  const accessibleBranchIdList = accessibleBranches.map((branch) => branch.id);
  const [complaintAssignees, assignableTeams] = await Promise.all([
    complaintBranchIds.length
      ? db.user.findMany({
        where: {
          active: true,
          deletedAt: null,
          role: { in: ['OPERATIONS_MANAGER', 'EMPLOYEE'] },
          OR: [
            { branchMemberships: { some: { branchId: { in: complaintBranchIds } } } },
            { teamMemberships: { some: { team: { branchId: { in: complaintBranchIds } } } } },
          ],
        },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      })
      : Promise.resolve([]),
    accessibleBranchIdList.length
      ? db.team.findMany({
        where: { active: true, branchId: { in: accessibleBranchIdList } },
        select: {
          id: true,
          branchId: true,
          name: true,
          members: { select: { id: true } },
        },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
      })
      : Promise.resolve([]),
  ]);
  const dashboardPagination = {
    proofs: pendingProofsPagination,
    review: reviewBookingsPagination,
    unassigned: unassignedBookingsPagination,
    bookings: activeBookingsPagination,
    terminal: terminalBookingsPagination,
  };
  const caseQueuePagination = {
    cancellations: cancellationRequestsPagination,
    reschedules: rescheduleRequestsPagination,
    quality: qualityBookingsPagination,
    complaints: complaintsPagination,
    refunds: refundsAwaitingApprovalPagination,
  };
  const clientManager = {
    id: manager.id,
    fullName: manager.fullName,
    phone: manager.phone,
    role: manager.role,
  };
  const clientPendingProofs = readablePendingProofs.map(({ booking, ...proof }) => {
    return {
      ...proof,
      booking: omitClientFields(booking, ['branchId', 'assignedTeamId']),
    };
  });
  const clientReviewBookings = readableReviewBookings.map((booking) => {
    return omitClientFields(booking, ['assignedTeamId']);
  });
  const clientUnassignedBookings = assignableBookings.map((booking) => {
    return omitClientFields(booking, ['assignedTeamId']);
  });
  const clientActiveBookings = activeBookingsWithPermissions.map((booking) => {
    return omitClientFields(booking, ['branchId', 'assignedTeamId']);
  });
  const clientCancellationRequests = readableCancellationRequests.map((request) => {
    const reschedulingAllowed = evaluateCancellationPolicyRequest(
      readCancellationPolicySnapshot(request.booking.cancellationPolicySnapshot),
      'RESCHEDULING',
      request.booking.startAt,
      request.requestedAt,
    ).allowed;
    return {
      ...omitClientFields(request, ['booking', 'updatedAt']),
      reschedulingAllowed,
      booking: omitClientFields(request.booking, [
        'branchId',
        'assignedTeamId',
        'cancellationPolicySnapshot',
        'startAt',
      ]),
    };
  });
  const clientRescheduleRequests = readableRescheduleRequests.map(({ booking, ...request }) => {
    return {
      ...request,
      booking: omitClientFields(booking, ['branchId', 'assignedTeamId']),
    };
  });
  const clientQualityBookings = qualityBookingsWithAccessibleFiles.map((booking) => {
    return omitClientFields(booking, ['branchId', 'assignedTeamId']);
  });
  const clientComplaints = readableComplaints.map(({ booking, ...complaint }) => {
    return {
      ...complaint,
      booking: omitClientFields(booking, ['branchId', 'assignedTeamId']),
    };
  });
  const clientRefunds = refundsAwaitingApprovalWithAccessibleProofs.map(({ booking, ...refund }) => {
    return {
      ...refund,
      booking: omitClientFields(booking, ['branchId', 'assignedTeamId']),
    };
  });

  const clientManagedSubscriptions = managedSubscriptionsRaw.map((sub) => {
    const latestProof = sub.paymentProofs[0] ?? null;
    return {
      id: sub.id,
      customerName: sub.customer.user.fullName,
      customerPhone: sub.customer.user.phone,
      planName: sub.plan.nameAr,
      expectedPrice: sub.purchasePrice,
      branchName: sub.branch.nameAr,
      status: sub.status as 'PENDING_PAYMENT' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED',
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
      paymentProof: latestProof
        ? {
            id: latestProof.id,
            proofFileUrl: latestProof.proofFileUrl,
            amountSubmitted: latestProof.amountSubmitted,
            referenceNumber: latestProof.referenceNumber,
            status: latestProof.status as 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'AMOUNT_MISMATCH' | 'REUPLOAD_REQUIRED' | 'DUPLICATE_SUSPECTED',
            reviewNotes: latestProof.reviewNotes,
            createdAt: latestProof.createdAt.toISOString(),
            paymentMethod: { name: latestProof.paymentMethod.name },
          }
        : null,
    };
  });

  const qualityBookingsCount = clientQualityBookings.length;
  const openCasesCount =
    clientCancellationRequests.length +
    clientRescheduleRequests.length +
    clientComplaints.length +
    clientRefunds.length;

  return (
    <OperationsDashboardClient
      manager={clientManager}
      branches={accessibleBranches.map((b) => ({ id: b.id, nameAr: b.nameAr, status: b.status }))}
      pendingProofs={sanitizeClientData(clientPendingProofs)}
      reviewBookings={sanitizeClientData(clientReviewBookings)}
      unassignedBookings={sanitizeClientData(clientUnassignedBookings)}
      teams={sanitizeClientData(assignableTeams)}
      activeBookings={sanitizeClientData(clientActiveBookings)}
      terminalBookings={sanitizeClientData(terminalBookings)}
      managedSubscriptions={sanitizeClientData(clientManagedSubscriptions)}
      activeBookingQuery={activeBookingQuery}
      terminalBookingQuery={terminalBookingQuery}
      initialTab={dashboardTab}
      pagination={dashboardPagination}
      openCasesCount={openCasesCount}
      qualityBookingsCount={qualityBookingsCount}
      selectedDate={selectedDate}
      todayDate={todayDate}
      tomorrowDate={tomorrowDate}
      canOpenWorkforce={canOpenWorkforce}
      canOpenPricing={canOpenPricing}
      canOpenCustomerReviews={canOpenCustomerReviews}
      qualityQueuesSlot={
        <OperationsCaseQueues
          actorRole={manager.role}
          cancellationRequests={sanitizeClientData(clientCancellationRequests)}
          rescheduleRequests={sanitizeClientData(clientRescheduleRequests)}
          qualityBookings={sanitizeClientData(clientQualityBookings)}
          complaints={sanitizeClientData(clientComplaints)}
          refundsAwaitingApproval={sanitizeClientData(clientRefunds)}
          complaintAssignees={sanitizeClientData(complaintAssignees)}
          pagination={caseQueuePagination}
          mode="quality_only"
        />
      }
      caseQueuesSlot={
        <OperationsCaseQueues
          actorRole={manager.role}
          cancellationRequests={sanitizeClientData(clientCancellationRequests)}
          rescheduleRequests={sanitizeClientData(clientRescheduleRequests)}
          qualityBookings={sanitizeClientData(clientQualityBookings)}
          complaints={sanitizeClientData(clientComplaints)}
          refundsAwaitingApproval={sanitizeClientData(clientRefunds)}
          complaintAssignees={sanitizeClientData(complaintAssignees)}
          pagination={caseQueuePagination}
          mode="cases_only"
        />
      }
    />
  );
}

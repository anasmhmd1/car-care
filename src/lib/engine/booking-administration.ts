import {
  BookingStatus,
  FileType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { transitionBookingStatus } from './transition';

export const MANAGER_OVERRIDE_CLOSE_SOURCE_STATUSES = [
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
] as const;

export const TERMINAL_REOPEN_SOURCE_STATUSES = [
  BookingStatus.CLOSED,
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
] as const;

export const TERMINAL_REOPEN_TARGET_STATUS = BookingStatus.ADMIN_REVIEW_REQUIRED;

type AdministrationValidation =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | 'ROLE_FORBIDDEN'
        | 'REASON_REQUIRED'
        | 'INVALID_SOURCE_STATUS'
        | 'TEAM_NOT_ASSIGNED'
        | 'OUTSTANDING_BALANCE';
    };

export class BookingAdministrationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BookingAdministrationError';
  }
}

function hasAdministrativeReason(reason: string | null | undefined): boolean {
  return (reason?.trim().length ?? 0) >= 3;
}

function normalizeAdministrativeReason(reason: string): string {
  const normalized = reason.trim().slice(0, 1000);
  if (!hasAdministrativeReason(normalized)) {
    throw new BookingAdministrationError(
      'يجب تسجيل سبب واضح من 3 أحرف على الأقل.',
      'REASON_REQUIRED',
    );
  }
  return normalized;
}

export function validateManagerOverrideCloseRequest(input: {
  actorRole: UserRole;
  fromStatus: BookingStatus;
  reason?: string | null;
  assignedTeamId?: string | null;
  amountDue: number;
}): AdministrationValidation {
  if (
    input.actorRole !== UserRole.OPERATIONS_MANAGER
    && input.actorRole !== UserRole.OWNER
  ) {
    return { allowed: false, code: 'ROLE_FORBIDDEN' };
  }
  if (!hasAdministrativeReason(input.reason)) {
    return { allowed: false, code: 'REASON_REQUIRED' };
  }
  if (!(MANAGER_OVERRIDE_CLOSE_SOURCE_STATUSES as readonly BookingStatus[]).includes(input.fromStatus)) {
    return { allowed: false, code: 'INVALID_SOURCE_STATUS' };
  }
  if (!input.assignedTeamId) {
    return { allowed: false, code: 'TEAM_NOT_ASSIGNED' };
  }
  if (input.amountDue > 0) {
    return { allowed: false, code: 'OUTSTANDING_BALANCE' };
  }
  return { allowed: true };
}

export function validateTerminalReopenRequest(input: {
  actorRole: UserRole;
  fromStatus: BookingStatus;
  reason?: string | null;
}): AdministrationValidation {
  if (input.actorRole !== UserRole.OWNER) {
    return { allowed: false, code: 'ROLE_FORBIDDEN' };
  }
  if (!hasAdministrativeReason(input.reason)) {
    return { allowed: false, code: 'REASON_REQUIRED' };
  }
  if (!(TERMINAL_REOPEN_SOURCE_STATUSES as readonly BookingStatus[]).includes(input.fromStatus)) {
    return { allowed: false, code: 'INVALID_SOURCE_STATUS' };
  }
  return { allowed: true };
}

function throwManagerOverrideValidation(code: Exclude<AdministrationValidation, { allowed: true }>['code']): never {
  const messages: Record<typeof code, string> = {
    ROLE_FORBIDDEN: 'الاستثناء الإداري متاح لمدير التشغيل أو المالك فقط.',
    REASON_REQUIRED: 'يجب تسجيل سبب واضح للاستثناء الإداري.',
    INVALID_SOURCE_STATUS: 'يمكن استخدام الاستثناء فقط بعد بدء الخدمة وقبل اعتماد الجودة.',
    TEAM_NOT_ASSIGNED: 'لا يمكن إغلاق الحجز دون فريق مسند.',
    OUTSTANDING_BALANCE: 'لا يمكن إغلاق الحجز مع وجود مبلغ مستحق.',
  };
  throw new BookingAdministrationError(messages[code], code);
}

function throwTerminalReopenValidation(code: Exclude<AdministrationValidation, { allowed: true }>['code']): never {
  const messages: Record<typeof code, string> = {
    ROLE_FORBIDDEN: 'إعادة فتح الحجز الطرفي متاحة للمالك فقط.',
    REASON_REQUIRED: 'يجب تسجيل سبب واضح لإعادة فتح الحجز.',
    INVALID_SOURCE_STATUS: 'الحجز ليس في حالة طرفية قابلة لإعادة الفتح.',
    TEAM_NOT_ASSIGNED: 'تعذر إعادة فتح الحجز بسبب الفريق.',
    OUTSTANDING_BALANCE: 'تعذر إعادة فتح الحجز بسبب التسوية.',
  };
  throw new BookingAdministrationError(messages[code], code);
}

export async function closeBookingWithManagerOverride(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
  },
) {
  const reason = normalizeAdministrativeReason(input.reason);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-manager-override:${input.bookingId}`}))`;

  const booking = await tx.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      bookingStatus: true,
      paymentStatus: true,
      assignedTeamId: true,
      subscriptionId: true,
      amountPaid: true,
      amountDue: true,
      creditAppliedAmount: true,
      terminalReopenSourceStatus: true,
      terminalReopenedAt: true,
      qualityReview: {
        select: { approved: true, returnedToTeam: true },
      },
      checklistInstances: {
        select: { stage: true, completedAt: true },
      },
      files: {
        where: {
          fileType: { in: [FileType.BEFORE_SERVICE, FileType.AFTER_SERVICE] },
        },
        select: { fileType: true, mimeType: true },
      },
    },
  });
  if (!booking) {
    throw new BookingAdministrationError('الحجز غير موجود.', 'BOOKING_NOT_FOUND');
  }

  const validation = validateManagerOverrideCloseRequest({
    actorRole: input.actorRole,
    fromStatus: booking.bookingStatus,
    reason,
    assignedTeamId: booking.assignedTeamId,
    amountDue: booking.amountDue,
  });
  if (!validation.allowed) throwManagerOverrideValidation(validation.code);

  const path: BookingStatus[] = [booking.bookingStatus];
  const bypassedGuards = new Set<string>();
  const metadata = {
    managerOverride: true,
    overrideKind: 'CHECKLIST_AND_QUALITY_CLOSE',
    requestedFromStatus: booking.bookingStatus,
  } satisfies Prisma.InputJsonObject;

  if (booking.bookingStatus === BookingStatus.IN_SERVICE) {
    const qualityReviewTransition = await transitionBookingStatus(tx, {
      bookingId: booking.id,
      toStatus: BookingStatus.QUALITY_REVIEW,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      reason,
      metadata,
      managerOverride: true,
    });
    qualityReviewTransition.bypassedGuards.forEach((guard) => bypassedGuards.add(guard));
    path.push(BookingStatus.QUALITY_REVIEW);
  }

  const completionTransition = await transitionBookingStatus(tx, {
    bookingId: booking.id,
    toStatus: BookingStatus.SERVICE_COMPLETED,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason,
    metadata,
    managerOverride: true,
  });
  completionTransition.bypassedGuards.forEach((guard) => bypassedGuards.add(guard));
  path.push(BookingStatus.SERVICE_COMPLETED);

  await transitionBookingStatus(tx, {
    bookingId: booking.id,
    toStatus: BookingStatus.DELIVERED,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason,
    metadata,
  });
  path.push(BookingStatus.DELIVERED);

  await transitionBookingStatus(tx, {
    bookingId: booking.id,
    toStatus: BookingStatus.CLOSED,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    reason,
    metadata,
  });
  path.push(BookingStatus.CLOSED);

  const beforePhotoCount = booking.files.filter(
    (file) => file.fileType === FileType.BEFORE_SERVICE && file.mimeType.startsWith('image/'),
  ).length;
  const afterPhotoCount = booking.files.filter(
    (file) => file.fileType === FileType.AFTER_SERVICE && file.mimeType.startsWith('image/'),
  ).length;
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      branchId: booking.branchId,
      action: 'BOOKING_MANAGER_OVERRIDE_CLOSED',
      entityType: 'Booking',
      entityId: booking.id,
      beforeJson: {
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        amountDue: booking.amountDue,
        creditAppliedAmount: booking.creditAppliedAmount,
        assignedTeamId: booking.assignedTeamId,
        subscriptionId: booking.subscriptionId,
        qualityReview: booking.qualityReview,
        completedChecklistStages: booking.checklistInstances
          .filter(({ completedAt }) => Boolean(completedAt))
          .map(({ stage }) => stage),
        beforePhotoCount,
        afterPhotoCount,
      },
      afterJson: {
        bookingStatus: BookingStatus.CLOSED,
        managerOverride: true,
        transitionPath: path,
        bypassedGuards: [...bypassedGuards],
        preservedConstraints: ['ASSIGNED_TEAM', 'OUTSTANDING_BALANCE', 'SUBSCRIPTION_VISIT_LEDGER'],
      },
      reason,
    },
  });

  return { fromStatus: booking.bookingStatus, toStatus: BookingStatus.CLOSED, path };
}

export async function reopenTerminalBookingForOwner(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
  },
) {
  const reason = normalizeAdministrativeReason(input.reason);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${input.bookingId}`}))`;

  const booking = await tx.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      bookingStatus: true,
      paymentStatus: true,
      assignedTeamId: true,
      subscriptionId: true,
      amountPaid: true,
      amountDue: true,
      creditAppliedAmount: true,
    },
  });
  if (!booking) {
    throw new BookingAdministrationError('الحجز غير موجود.', 'BOOKING_NOT_FOUND');
  }

  const validation = validateTerminalReopenRequest({
    actorRole: input.actorRole,
    fromStatus: booking.bookingStatus,
    reason,
  });
  if (!validation.allowed) throwTerminalReopenValidation(validation.code);

  const [refunds, holds, visitLedgerEntries] = await Promise.all([
    tx.refund.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amount: true, status: true },
    }),
    tx.bookingHold.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    }),
    tx.subscriptionVisitLedger.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        visitChange: true,
        remainingAfter: true,
      },
    }),
  ]);

  const updateResult = await tx.booking.updateMany({
    where: {
      id: booking.id,
      bookingStatus: booking.bookingStatus,
      terminalReopenSourceStatus: null,
      deletedAt: null,
    },
    data: {
      bookingStatus: TERMINAL_REOPEN_TARGET_STATUS,
      terminalReopenSourceStatus: booking.bookingStatus,
      terminalReopenedAt: new Date(),
    },
  });
  if (updateResult.count !== 1) {
    throw new BookingAdministrationError(
      'تغيرت حالة الحجز أثناء إعادة الفتح؛ حدّث الصفحة وحاول مجددًا.',
      'STALE_BOOKING_STATUS',
    );
  }

  const preservationMetadata = {
    administrativeReopen: true,
    reviewOnly: true,
    previousTerminalStatus: booking.bookingStatus,
    targetStatus: TERMINAL_REOPEN_TARGET_STATUS,
    financialSettlementPreserved: true,
    assignmentPreserved: true,
    holdsPreservedWithoutReactivation: true,
    subscriptionLedgerPreserved: true,
  } satisfies Prisma.InputJsonObject;

  await tx.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: booking.bookingStatus,
      toStatus: TERMINAL_REOPEN_TARGET_STATUS,
      changedByUserId: input.actorUserId,
      actorRole: input.actorRole,
      reason,
      metadata: preservationMetadata,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      branchId: booking.branchId,
      action: 'BOOKING_TERMINAL_REOPENED',
      entityType: 'Booking',
      entityId: booking.id,
      beforeJson: {
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        amountDue: booking.amountDue,
        creditAppliedAmount: booking.creditAppliedAmount,
        assignedTeamId: booking.assignedTeamId,
        subscriptionId: booking.subscriptionId,
        refunds,
        holds,
        visitLedgerEntries,
      },
      afterJson: {
        bookingStatus: TERMINAL_REOPEN_TARGET_STATUS,
        terminalReopenSourceStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        amountDue: booking.amountDue,
        creditAppliedAmount: booking.creditAppliedAmount,
        assignedTeamId: booking.assignedTeamId,
        subscriptionId: booking.subscriptionId,
        ...preservationMetadata,
      },
      reason,
    },
  });

  return {
    fromStatus: booking.bookingStatus,
    toStatus: TERMINAL_REOPEN_TARGET_STATUS,
  };
}

/**
 * Ends a review-only terminal reopen by restoring the exact original terminal
 * status. Financial settlements, assignments, holds, and visit ledgers remain
 * untouched throughout the review.
 */
export async function closeTerminalBookingReviewForOwner(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
  },
) {
  const reason = normalizeAdministrativeReason(input.reason);
  if (input.actorRole !== UserRole.OWNER) {
    throw new BookingAdministrationError(
      'إغلاق مراجعة الحجز الطرفي متاح للمالك فقط.',
      'ROLE_FORBIDDEN',
    );
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${input.bookingId}`}))`;
  const booking = await tx.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      bookingStatus: true,
      terminalReopenSourceStatus: true,
      terminalReopenedAt: true,
      paymentStatus: true,
      assignedTeamId: true,
      subscriptionId: true,
      amountPaid: true,
      amountDue: true,
      creditAppliedAmount: true,
    },
  });
  if (!booking) {
    throw new BookingAdministrationError('الحجز غير موجود.', 'BOOKING_NOT_FOUND');
  }
  if (
    booking.bookingStatus !== TERMINAL_REOPEN_TARGET_STATUS
    || !booking.terminalReopenSourceStatus
    || !(TERMINAL_REOPEN_SOURCE_STATUSES as readonly BookingStatus[]).includes(
      booking.terminalReopenSourceStatus,
    )
  ) {
    throw new BookingAdministrationError(
      'الحجز ليس في مراجعة طرفية مفتوحة.',
      'TERMINAL_REVIEW_NOT_OPEN',
    );
  }

  const sourceStatus = booking.terminalReopenSourceStatus;
  const updateResult = await tx.booking.updateMany({
    where: {
      id: booking.id,
      bookingStatus: TERMINAL_REOPEN_TARGET_STATUS,
      terminalReopenSourceStatus: sourceStatus,
      deletedAt: null,
    },
    data: {
      bookingStatus: sourceStatus,
      terminalReopenSourceStatus: null,
      terminalReopenedAt: null,
    },
  });
  if (updateResult.count !== 1) {
    throw new BookingAdministrationError(
      'تغيرت مراجعة الحجز أثناء الإغلاق؛ حدّث الصفحة وحاول مجددًا.',
      'STALE_BOOKING_STATUS',
    );
  }

  const metadata = {
    terminalReviewClosed: true,
    restoredTerminalStatus: sourceStatus,
    financialSettlementPreserved: true,
    assignmentPreserved: true,
    holdsPreservedWithoutReactivation: true,
    subscriptionLedgerPreserved: true,
  } satisfies Prisma.InputJsonObject;

  await tx.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: TERMINAL_REOPEN_TARGET_STATUS,
      toStatus: sourceStatus,
      changedByUserId: input.actorUserId,
      actorRole: input.actorRole,
      reason,
      metadata,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      branchId: booking.branchId,
      action: 'BOOKING_TERMINAL_REVIEW_CLOSED',
      entityType: 'Booking',
      entityId: booking.id,
      beforeJson: {
        bookingStatus: booking.bookingStatus,
        terminalReopenSourceStatus: sourceStatus,
        terminalReopenedAt: booking.terminalReopenedAt,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        amountDue: booking.amountDue,
        creditAppliedAmount: booking.creditAppliedAmount,
        assignedTeamId: booking.assignedTeamId,
        subscriptionId: booking.subscriptionId,
      },
      afterJson: {
        bookingStatus: sourceStatus,
        terminalReopenSourceStatus: null,
        ...metadata,
      },
      reason,
    },
  });

  return {
    fromStatus: TERMINAL_REOPEN_TARGET_STATUS,
    toStatus: sourceStatus,
  };
}

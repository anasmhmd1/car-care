'use server';

import {
  AssignmentMode,
  BookingHoldStatus,
  BookingStatus,
  FileType,
  PaymentStatus,
  Prisma,
  RefundStatus,
  TimeChangeStatus,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { canAccessBranch } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import {
  AssignmentError,
  assignTeamToBookingInTransaction,
} from '@/lib/engine/assignment';
import { evaluateRequestedInterval } from '@/lib/engine/availability';
import {
  calculateCancellationSettlement,
  cancellationPaymentOutcome,
} from '@/lib/engine/cancellation-settlement';
import {
  CustomerCreditError,
  returnBookingValueToCredit,
} from '@/lib/engine/customer-credit';
import {
  BookingTransitionError,
  transitionBookingStatus,
} from '@/lib/engine/transition';
import { releaseSubscriptionVisitForBooking } from '@/lib/engine/subscription';
import {
  type CancellationPolicyCapability,
  type CancellationPolicySnapshot,
  evaluateCancellationPolicyRequest,
  readPolicyRequestTimestamp,
  readCancellationPolicySnapshot,
} from '@/lib/policies/cancellation';
import {
  approveRefundSchema,
  completeCancellationOverrideSchema,
  recordRefundSchema,
  requestCancellationSchema,
  requestRescheduleSchema,
  reviewCancellationSchema,
  reviewRescheduleSchema,
} from '@/lib/validations/operations';

const CANCELLATION_REVIEW_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;
const REFUND_RECORD_ROLES = [
  ...CANCELLATION_REVIEW_ROLES,
  UserRole.EMPLOYEE,
] as const;
const RESCHEDULE_HOLD_MINUTES = 24 * 60;

class CancellationInputError extends Error {}

function requirePolicyCapability(
  policy: CancellationPolicySnapshot,
  capability: CancellationPolicyCapability,
  startAt: Date,
  requestedAt: Date,
) {
  const eligibility = evaluateCancellationPolicyRequest(
    policy,
    capability,
    startAt,
    requestedAt,
  );
  if (eligibility.allowed) return eligibility;

  const actionLabel = capability === 'CANCELLATION' ? 'الإلغاء' : 'تعديل الموعد';
  if (eligibility.code === 'SERVICE_ALREADY_STARTED') {
    throw new CancellationInputError(
      `لا يمكن إرسال أو اعتماد طلب ${actionLabel} بعد بدء موعد الخدمة. تواصل مع الدعم.`,
    );
  }
  if (eligibility.code === 'CANCELLATION_DISABLED') {
    throw new CancellationInputError(
      'سياسة هذه الخدمة لا تتيح طلب الإلغاء من الحساب. تواصل مع الدعم لمراجعة الحالة.',
    );
  }
  if (eligibility.code === 'RESCHEDULING_DISABLED') {
    throw new CancellationInputError(
      'سياسة هذه الخدمة لا تتيح طلب تعديل الموعد أو اعتماده كحل بديل.',
    );
  }
  throw new CancellationInputError(
    `انتهت مهلة ${actionLabel} لهذا الحجز قبل ${policy.noticeHours} ساعة من الموعد. تواصل مع الدعم.`,
  );
}

function parseAlternativeDates(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n,،]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function errorMessage(error: unknown, fallback: string) {
  if (
    error instanceof CancellationInputError ||
    error instanceof BookingTransitionError ||
    error instanceof AssignmentError ||
    error instanceof CustomerCreditError
  ) return error.message;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) return 'تغيرت البيانات أثناء تنفيذ الطلب. حدّث الصفحة وحاول مرة أخرى.';
  console.error(fallback, error);
  return fallback;
}

function revalidateCancellationPaths(bookingId: string) {
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath('/account/bookings');
  revalidatePath('/operations');
  revalidatePath('/admin');
  revalidatePath('/staff/delegated');
}

async function assertBranchAccess(
  actor: { id: string; role: UserRole },
  branchId: string,
) {
  if (!(await canAccessBranch(actor, branchId))) {
    throw new CancellationInputError('غير مصرح لك بإدارة طلبات هذا الفرع.');
  }
}

async function releaseBookingResources(
  tx: Prisma.TransactionClient,
  booking: { id: string; assignedTeamId: string | null },
  actor: { id: string; role: UserRole },
  reason: string,
) {
  const now = new Date();
  await tx.bookingHold.updateMany({
    where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
    data: {
      status: BookingHoldStatus.RELEASED,
      releasedAt: now,
      releasedReason: reason,
    },
  });
  await tx.bookingAssignment.updateMany({
    where: { bookingId: booking.id, status: 'ACTIVE' },
    data: { status: 'ENDED', endedAt: now },
  });
  if (booking.assignedTeamId) {
    await tx.bookingAssignmentHistory.create({
      data: {
        bookingId: booking.id,
        fromTeamId: booking.assignedTeamId,
        toTeamId: null,
        changedByUserId: actor.id,
        action: 'UNASSIGNED',
        reason,
      },
    });
  }
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      assignedTeamId: null,
      assignedEmployeeId: null,
      operationalVehicleId: null,
    },
  });
}

async function applyApprovedReschedule(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    newStartAt: Date;
    actor: { id: string; role: UserRole };
    reason: string;
    policyMetadata?: Prisma.InputJsonObject;
  },
) {
  const booking = await tx.booking.findFirst({
    where: { id: input.bookingId, deletedAt: null },
    include: {
      branch: true,
      vehicle: { select: { vehicleSize: true } },
      addons: { select: { addonId: true } },
    },
  });
  if (!booking) throw new CancellationInputError('الحجز غير موجود.');
  if (input.newStartAt <= new Date()) {
    throw new CancellationInputError('الموعد الجديد يجب أن يكون في المستقبل.');
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${booking.branchId}`}))`;

  const availability = await evaluateRequestedInterval(tx, {
    branchId: booking.branchId,
    serviceId: booking.serviceId,
    coverageAreaId: booking.coverageAreaId,
    vehicleSize: booking.vehicle.vehicleSize,
    addonIds: booking.addons.map(({ addonId }) => addonId),
    startAt: input.newStartAt,
    excludeBookingId: booking.id,
    reservedDurationMinutes: booking.totalDurationMinutes,
  });
  if (!availability) {
    throw new CancellationInputError('الموعد الجديد غير متاح فعليًا لأي فريق. اختر موعدًا آخر.');
  }

  const newEndAt = new Date(
    input.newStartAt.getTime() + availability.totalDurationMinutes * 60_000,
  );
  if (booking.bookingStatus === BookingStatus.CANCELLATION_REQUESTED) {
    await transitionBookingStatus(tx, {
      bookingId: booking.id,
      toStatus: BookingStatus.RESCHEDULE_REQUESTED,
      actorUserId: input.actor.id,
      actorRole: input.actor.role,
      reason: input.reason,
    });
  }

  await releaseBookingResources(tx, booking, input.actor, 'إعادة جدولة الحجز');
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      startAt: input.newStartAt,
      endAt: newEndAt,
      totalDurationMinutes: availability.totalDurationMinutes,
    },
  });
  await tx.bookingHold.create({
    data: {
      bookingId: booking.id,
      teamId: availability.feasibleTeamIds[0],
      slotStartTime: input.newStartAt,
      slotEndTime: newEndAt,
      expiresAt: new Date(Date.now() + RESCHEDULE_HOLD_MINUTES * 60_000),
      status: BookingHoldStatus.ACTIVE,
    },
  });
  await transitionBookingStatus(tx, {
    bookingId: booking.id,
    toStatus: BookingStatus.AWAITING_ASSIGNMENT,
    actorUserId: input.actor.id,
    actorRole: input.actor.role,
    reason: input.reason,
    metadata: {
      ...(input.policyMetadata ?? {}),
      oldStartAt: booking.startAt.toISOString(),
      oldEndAt: booking.endAt.toISOString(),
      newStartAt: input.newStartAt.toISOString(),
      newEndAt: newEndAt.toISOString(),
    },
  });

  let assignment = null;
  if (booking.branch.assignmentMode === AssignmentMode.AUTOMATIC) {
    assignment = await assignTeamToBookingInTransaction(tx, {
      bookingId: booking.id,
      assignedByUserId: input.actor.id,
      actorRole: input.actor.role,
      reason: 'إعادة التوزيع تلقائيًا بعد اعتماد الموعد الجديد',
    });
  }

  return { booking, newEndAt, availability, assignment };
}

export async function requestCancellationAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const parsed = requestCancellationSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason'),
    preferredAction: formData.get('preferredAction') || 'REFUND',
    alternativeDates: formData.get('alternativeDates') || '',
    notes: formData.get('notes') || '',
    attachmentFileId: formData.get('attachmentFileId') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات طلب الإلغاء غير مكتملة.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cancellation:${parsed.data.bookingId}`}))`;
      const requestedAt = new Date();
      const booking = await tx.booking.findFirst({
        where: {
          id: parsed.data.bookingId,
          deletedAt: null,
          customer: { userId: user.id },
        },
        include: { cancellationRequest: true },
      });
      if (!booking) throw new CancellationInputError('الحجز غير موجود أو لا يخص حسابك.');
      const cancellationPolicy = readCancellationPolicySnapshot(
        booking.cancellationPolicySnapshot,
      );
      const { lateRequest } = requirePolicyCapability(
        cancellationPolicy,
        'CANCELLATION',
        booking.startAt,
        requestedAt,
      );
      if (parsed.data.preferredAction === 'RESCHEDULE') {
        requirePolicyCapability(
          cancellationPolicy,
          'RESCHEDULING',
          booking.startAt,
          requestedAt,
        );
      }
      if (
        booking.cancellationRequest &&
        ['PENDING', 'ESCALATED', 'APPROVED_REFUND_PENDING'].includes(booking.cancellationRequest.status)
      ) {
        throw new CancellationInputError('يوجد طلب إلغاء مفتوح لهذا الحجز بالفعل.');
      }

      let attachmentFileId: string | null = null;
      if (parsed.data.attachmentFileId) {
        const attachment = await tx.bookingFile.findFirst({
          where: {
            id: parsed.data.attachmentFileId,
            bookingId: booking.id,
            uploadedByUserId: user.id,
            fileType: FileType.CANCELLATION_EVIDENCE,
          },
          select: { id: true },
        });
        if (!attachment) throw new CancellationInputError('مرفق طلب الإلغاء غير صالح.');
        attachmentFileId = attachment.id;
      }

      const noticeHours = cancellationPolicy.noticeHours;
      const alternativeDates = parseAlternativeDates(parsed.data.alternativeDates);
      const requestData = {
        customerId: booking.customerId,
        reason: parsed.data.reason,
        preferredAction: parsed.data.preferredAction,
        previousBookingStatus: booking.bookingStatus,
        alternativeDates: alternativeDates as Prisma.InputJsonValue,
        customerNotes: parsed.data.notes || null,
        attachmentFileId,
        status: 'PENDING',
        resolvedByUserId: null,
        resolutionNotes: null,
        resolutionType: null,
        responsibleParty: null,
        refundRequired: null,
        approvedRefundAmount: null,
        resolvedAt: null,
      };
      const cancellation = booking.cancellationRequest
        ? await tx.cancellationRequest.update({
            where: { id: booking.cancellationRequest.id },
            data: requestData,
          })
        : await tx.cancellationRequest.create({
            data: { bookingId: booking.id, ...requestData },
          });

      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.CANCELLATION_REQUESTED,
        actorUserId: user.id,
        actorRole: user.role,
        reason: parsed.data.reason,
        metadata: {
          policyRequestedAt: requestedAt.toISOString(),
          lateRequest,
          noticeHours,
          cancellationPolicyId: cancellationPolicy.policyId,
          cancellationPolicyCode: cancellationPolicy.code,
          cancellationPolicyVersion: cancellationPolicy.version,
          alternativeDates,
          attachmentFileId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'CANCELLATION_REQUEST_CREATED',
          entityType: 'CancellationRequest',
          entityId: cancellation.id,
          afterJson: {
            preferredAction: cancellation.preferredAction,
            policyRequestedAt: requestedAt.toISOString(),
            lateRequest,
            noticeHours,
            cancellationPolicyId: cancellationPolicy.policyId,
            cancellationPolicyVersion: cancellationPolicy.version,
            attachmentFileId,
          },
          reason: parsed.data.reason,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateCancellationPaths(parsed.data.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر إرسال طلب الإلغاء.') };
  }
}

export async function reviewCancellationAction(formData: FormData) {
  const manager = await requireRole([...CANCELLATION_REVIEW_ROLES]);
  const parsed = reviewCancellationSchema.safeParse({
    cancellationId: formData.get('cancellationId'),
    decision: formData.get('decision'),
    resolutionType: formData.get('resolutionType') || undefined,
    resolutionNotes: formData.get('resolutionNotes'),
    responsibleParty: formData.get('responsibleParty') || undefined,
    approvedRefundAmount: formData.get('approvedRefundAmount') || undefined,
    visitFeeAmount: formData.get('visitFeeAmount') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات مراجعة الإلغاء غير مكتملة.' };
  }

  const scoped = await db.cancellationRequest.findUnique({
    where: { id: parsed.data.cancellationId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scoped) return { error: 'طلب الإلغاء غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'cancellation.review',
    bookingPermissionScopes(scoped.booking),
  ))) {
    return { error: 'لا تملك صلاحية مراجعة طلبات الإلغاء.' };
  }

  try {
    await assertBranchAccess(manager, scoped.booking.branchId);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cancellation:${scoped.bookingId}`}))`;
      const cancellation = await tx.cancellationRequest.findUnique({
        where: { id: parsed.data.cancellationId },
        include: {
          booking: {
            include: {
              branch: true,
              customer: { select: { userId: true } },
            },
          },
        },
      });
      if (!cancellation || !['PENDING', 'ESCALATED'].includes(cancellation.status)) {
        throw new CancellationInputError('تم اتخاذ قرار نهائي في هذا الطلب بالفعل.');
      }
      if (cancellation.booking.bookingStatus !== BookingStatus.CANCELLATION_REQUESTED) {
        throw new CancellationInputError('حالة الحجز لا تطابق طلب الإلغاء المفتوح.');
      }

      if (parsed.data.decision === 'REJECT') {
        const restoreStatus = cancellation.previousBookingStatus ?? BookingStatus.AWAITING_OPERATIONS_REVIEW;
        await tx.cancellationRequest.update({
          where: { id: cancellation.id },
          data: {
            status: 'REJECTED',
            resolutionNotes: parsed.data.resolutionNotes,
            resolvedByUserId: manager.id,
            resolvedAt: new Date(),
          },
        });
        await transitionBookingStatus(tx, {
          bookingId: cancellation.bookingId,
          toStatus: restoreStatus,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.resolutionNotes,
          metadata: { cancellationId: cancellation.id, decision: 'REJECT' },
        });
        return;
      }

      if (parsed.data.resolutionType === 'ESCALATE') {
        await tx.cancellationRequest.update({
          where: { id: cancellation.id },
          data: {
            status: 'ESCALATED',
            resolutionType: 'ESCALATE',
            resolutionNotes: parsed.data.resolutionNotes,
            responsibleParty: parsed.data.responsibleParty,
            resolvedByUserId: manager.id,
          },
        });
        return;
      }

      if (parsed.data.resolutionType === 'RESCHEDULE') {
        const requestTransition = await tx.bookingStatusHistory.findFirst({
          where: {
            bookingId: cancellation.bookingId,
            toStatus: BookingStatus.CANCELLATION_REQUESTED,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, metadata: true },
        });
        const cancellationPolicy = readCancellationPolicySnapshot(
          cancellation.booking.cancellationPolicySnapshot,
        );
        const requestEligibility = requirePolicyCapability(
          cancellationPolicy,
          'RESCHEDULING',
          cancellation.booking.startAt,
          readPolicyRequestTimestamp(
            requestTransition?.metadata,
            requestTransition?.createdAt ?? cancellation.updatedAt,
          ),
        );
        const proposed = Array.isArray(cancellation.alternativeDates)
          ? cancellation.alternativeDates.find((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
          : undefined;
        if (!proposed) {
          throw new CancellationInputError('لا يوجد موعد بديل صالح في الطلب؛ اطلب من العميل تحديد تاريخ ووقت واضحين.');
        }
        const newStartAt = new Date(proposed);
        const result = await applyApprovedReschedule(tx, {
          bookingId: cancellation.bookingId,
          newStartAt,
          actor: manager,
          reason: parsed.data.resolutionNotes,
          policyMetadata: {
            cancellationPolicyId: cancellationPolicy.policyId,
            cancellationPolicyCode: cancellationPolicy.code,
            cancellationPolicyVersion: cancellationPolicy.version,
            noticeHours: cancellationPolicy.noticeHours,
            lateRequest: requestEligibility.lateRequest,
            requestSource: 'CANCELLATION_REQUEST',
          },
        });
        await tx.bookingTimeChange.create({
          data: {
            bookingId: cancellation.bookingId,
            oldStartAt: result.booking.startAt,
            oldEndAt: result.booking.endAt,
            requestedStartAt: newStartAt,
            requestedEndAt: result.newEndAt,
            status: TimeChangeStatus.APPROVED,
            requestedByUserId: cancellation.booking.customer.userId,
            reviewedByUserId: manager.id,
            reason: cancellation.reason,
            reviewNotes: parsed.data.resolutionNotes,
            reviewedAt: new Date(),
          },
        });
        await tx.cancellationRequest.update({
          where: { id: cancellation.id },
          data: {
            status: 'COMPLETED',
            resolutionType: 'RESCHEDULE',
            resolutionNotes: parsed.data.resolutionNotes,
            responsibleParty: parsed.data.responsibleParty,
            resolvedByUserId: manager.id,
            resolvedAt: new Date(),
            refundRequired: false,
            approvedRefundAmount: 0,
          },
        });
        return;
      }

      const settlementResolutionType = parsed.data.resolutionType;
      if (!settlementResolutionType) {
        throw new CancellationInputError('نوع تسوية الإلغاء غير صالح.');
      }

      let settlement;
      try {
        settlement = calculateCancellationSettlement({
          resolutionType: settlementResolutionType,
          amountPaid: cancellation.booking.amountPaid,
          depositAmount: cancellation.booking.depositAmount,
          creditAppliedAmount: cancellation.booking.creditAppliedAmount,
          requestedRefundAmount: parsed.data.approvedRefundAmount,
          visitFeeAmount: parsed.data.visitFeeAmount,
        });
      } catch {
        throw new CancellationInputError('قيم التسوية غير صحيحة؛ راجع المبلغ المدفوع والاسترداد أو رسوم الزيارة.');
      }
      const { approvedRefundAmount, creditAmount, retainedAmount } = settlement;

      if (cancellation.booking.subscriptionId) {
        await releaseSubscriptionVisitForBooking(tx, {
          bookingId: cancellation.bookingId,
          userId: manager.id,
          role: manager.role,
          reason: 'اعتماد إلغاء الحجز وتحرير زيارة الاشتراك',
        });
      }
      await returnBookingValueToCredit(tx, {
        bookingId: cancellation.bookingId,
        customerId: cancellation.booking.customerId,
        amount: creditAmount,
        actorUserId: manager.id,
        transactionType: 'CANCELLATION_CREDIT',
        reason: parsed.data.resolutionNotes,
      });

      const refundRequired = approvedRefundAmount > 0;
      const paymentOutcome = cancellationPaymentOutcome({
        amountPaid: cancellation.booking.amountPaid,
        approvedRefundAmount,
        cashRefunded: 0,
        creditReturned: creditAmount,
      });
      await tx.cancellationRequest.update({
        where: { id: cancellation.id },
        data: {
          status: refundRequired ? 'APPROVED_REFUND_PENDING' : 'COMPLETED',
          resolutionType: parsed.data.resolutionType,
          resolutionNotes: parsed.data.resolutionNotes,
          responsibleParty: parsed.data.responsibleParty,
          resolvedByUserId: manager.id,
          resolvedAt: refundRequired ? null : new Date(),
          refundRequired,
          approvedRefundAmount,
          retainedAmount,
          creditAmount,
        },
      });
      await releaseBookingResources(tx, cancellation.booking, manager, 'اعتماد إلغاء الحجز');
      await tx.booking.update({
        where: { id: cancellation.bookingId },
        data: {
          paymentStatus: paymentOutcome
            ? PaymentStatus[paymentOutcome]
            : cancellation.booking.paymentStatus,
        },
      });
      await transitionBookingStatus(tx, {
        bookingId: cancellation.bookingId,
        toStatus: BookingStatus.CANCELLED,
        actorUserId: manager.id,
        actorRole: manager.role,
        reason: parsed.data.resolutionNotes,
        metadata: {
          cancellationId: cancellation.id,
          resolutionType: parsed.data.resolutionType,
          approvedRefundAmount,
          creditAmount,
          retainedAmount,
          responsibleParty: parsed.data.responsibleParty,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 25_000,
    });

    revalidateCancellationPaths(scoped.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر حفظ قرار طلب الإلغاء.') };
  }
}

export async function requestRescheduleAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const requestedAt = new Date();
  const parsed = requestRescheduleSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason'),
    requestedStartAt: formData.get('requestedStartAt'),
    proposedDates: formData.get('proposedDates') || '',
    notes: formData.get('notes') || '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات طلب تعديل الموعد غير مكتملة.' };
  }
  if (parsed.data.requestedStartAt <= requestedAt) {
    return { error: 'الموعد المقترح يجب أن يكون في المستقبل.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reschedule:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: {
          id: parsed.data.bookingId,
          deletedAt: null,
          customer: { userId: user.id },
        },
      });
      if (!booking) throw new CancellationInputError('الحجز غير موجود أو لا يخص حسابك.');
      const cancellationPolicy = readCancellationPolicySnapshot(
        booking.cancellationPolicySnapshot,
      );
      const { lateRequest } = requirePolicyCapability(
        cancellationPolicy,
        'RESCHEDULING',
        booking.startAt,
        requestedAt,
      );
      const existing = await tx.bookingTimeChange.findFirst({
        where: { bookingId: booking.id, status: TimeChangeStatus.PENDING },
      });
      if (existing) throw new CancellationInputError('يوجد طلب تعديل موعد قيد المراجعة بالفعل.');

      const requestedEndAt = new Date(
        parsed.data.requestedStartAt.getTime() + booking.totalDurationMinutes * 60_000,
      );
      const timeChange = await tx.bookingTimeChange.create({
        data: {
          bookingId: booking.id,
          oldStartAt: booking.startAt,
          oldEndAt: booking.endAt,
          requestedStartAt: parsed.data.requestedStartAt,
          requestedEndAt,
          requestedByUserId: user.id,
          reason: parsed.data.reason,
          reviewNotes: [parsed.data.proposedDates, parsed.data.notes].filter(Boolean).join('\n') || null,
        },
      });
      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.RESCHEDULE_REQUESTED,
        actorUserId: user.id,
        actorRole: user.role,
        reason: parsed.data.reason,
        metadata: {
          timeChangeId: timeChange.id,
          policyRequestedAt: requestedAt.toISOString(),
          requestedStartAt: parsed.data.requestedStartAt.toISOString(),
          lateRequest,
          noticeHours: cancellationPolicy.noticeHours,
          cancellationPolicyId: cancellationPolicy.policyId,
          cancellationPolicyCode: cancellationPolicy.code,
          cancellationPolicyVersion: cancellationPolicy.version,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateCancellationPaths(parsed.data.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر إرسال طلب تعديل الموعد.') };
  }
}

export async function reviewRescheduleAction(formData: FormData) {
  const manager = await requireRole([...CANCELLATION_REVIEW_ROLES]);
  const parsed = reviewRescheduleSchema.safeParse({
    timeChangeId: formData.get('timeChangeId'),
    decision: formData.get('decision'),
    approvedStartAt: formData.get('approvedStartAt') || undefined,
    reviewNotes: formData.get('reviewNotes'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات مراجعة الموعد غير مكتملة.' };
  }

  const scoped = await db.bookingTimeChange.findUnique({
    where: { id: parsed.data.timeChangeId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scoped) return { error: 'طلب تعديل الموعد غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'booking.reschedule',
    bookingPermissionScopes(scoped.booking),
  ))) {
    return { error: 'لا تملك صلاحية اعتماد تعديل المواعيد.' };
  }

  try {
    await assertBranchAccess(manager, scoped.booking.branchId);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reschedule:${scoped.bookingId}`}))`;
      const change = await tx.bookingTimeChange.findUnique({
        where: { id: parsed.data.timeChangeId },
        include: { booking: true },
      });
      if (!change || change.status !== TimeChangeStatus.PENDING) {
        throw new CancellationInputError('تمت مراجعة طلب تعديل الموعد بالفعل.');
      }
      if (change.booking.bookingStatus !== BookingStatus.RESCHEDULE_REQUESTED) {
        throw new CancellationInputError('حالة الحجز لا تسمح بمراجعة الموعد الآن.');
      }

      if (parsed.data.decision === 'REJECT') {
        const previousTransition = await tx.bookingStatusHistory.findFirst({
          where: {
            bookingId: change.bookingId,
            toStatus: BookingStatus.RESCHEDULE_REQUESTED,
          },
          orderBy: { createdAt: 'desc' },
        });
        const restoreStatus = previousTransition?.fromStatus ?? BookingStatus.AWAITING_ASSIGNMENT;
        await tx.bookingTimeChange.update({
          where: { id: change.id },
          data: {
            status: TimeChangeStatus.REJECTED,
            reviewedByUserId: manager.id,
            reviewNotes: parsed.data.reviewNotes,
            reviewedAt: new Date(),
          },
        });
        await transitionBookingStatus(tx, {
          bookingId: change.bookingId,
          toStatus: restoreStatus,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.reviewNotes,
          metadata: { timeChangeId: change.id, decision: 'REJECT' },
        });
        return;
      }

      const newStartAt = parsed.data.approvedStartAt!;
      const requestTransition = await tx.bookingStatusHistory.findFirst({
        where: {
          bookingId: change.bookingId,
          toStatus: BookingStatus.RESCHEDULE_REQUESTED,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      });
      const cancellationPolicy = readCancellationPolicySnapshot(
        change.booking.cancellationPolicySnapshot,
      );
      const requestEligibility = requirePolicyCapability(
        cancellationPolicy,
        'RESCHEDULING',
        change.booking.startAt,
        readPolicyRequestTimestamp(
          requestTransition?.metadata,
          requestTransition?.createdAt ?? change.createdAt,
        ),
      );
      const result = await applyApprovedReschedule(tx, {
        bookingId: change.bookingId,
        newStartAt,
        actor: manager,
        reason: parsed.data.reviewNotes,
        policyMetadata: {
          cancellationPolicyId: cancellationPolicy.policyId,
          cancellationPolicyCode: cancellationPolicy.code,
          cancellationPolicyVersion: cancellationPolicy.version,
          noticeHours: cancellationPolicy.noticeHours,
          lateRequest: requestEligibility.lateRequest,
          requestSource: 'RESCHEDULE_REQUEST',
        },
      });
      await tx.bookingTimeChange.update({
        where: { id: change.id },
        data: {
          requestedStartAt: newStartAt,
          requestedEndAt: result.newEndAt,
          status: TimeChangeStatus.APPROVED,
          reviewedByUserId: manager.id,
          reviewNotes: parsed.data.reviewNotes,
          reviewedAt: new Date(),
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 25_000,
    });

    revalidateCancellationPaths(scoped.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر اعتماد الموعد الجديد.') };
  }
}

export async function recordRefundAction(formData: FormData) {
  const manager = await requireRole([...REFUND_RECORD_ROLES]);
  const parsed = recordRefundSchema.safeParse({
    bookingId: formData.get('bookingId'),
    amount: formData.get('amount'),
    refundMethod: formData.get('refundMethod'),
    referenceNumber: formData.get('referenceNumber') || '',
    bookingFileId: formData.get('bookingFileId'),
    refundTimestamp: formData.get('refundTimestamp'),
    idempotencyKey: formData.get('idempotencyKey'),
    notes: formData.get('notes') || '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الاسترداد غير مكتملة.' };
  }
  if (parsed.data.refundTimestamp > new Date(Date.now() + 5 * 60_000)) {
    return { error: 'وقت تنفيذ الاسترداد لا يمكن أن يكون في المستقبل.' };
  }

  const scoped = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scoped) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'refund.record_proof',
    bookingPermissionScopes(scoped),
  ))) {
    return { error: 'لا تملك صلاحية تسجيل إثبات الاسترداد.' };
  }

  try {
    await assertBranchAccess(manager, scoped.branchId);
    const refund = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${parsed.data.bookingId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
        include: { cancellationRequest: true },
      });
      if (!booking?.cancellationRequest || booking.cancellationRequest.status !== 'APPROVED_REFUND_PENDING') {
        throw new CancellationInputError('لا يوجد قرار إلغاء معتمد ينتظر استردادًا لهذا الحجز.');
      }
      if (booking.terminalReopenSourceStatus) {
        throw new CancellationInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تسجيل أي استرداد.',
        );
      }
      const proofFile = await tx.bookingFile.findFirst({
        where: {
          id: parsed.data.bookingFileId,
          bookingId: booking.id,
          fileType: FileType.REFUND_PROOF,
        },
      });
      if (!proofFile) throw new CancellationInputError('إثبات الاسترداد غير مرتبط بهذا الحجز.');

      const existingRefunds = await tx.refund.aggregate({
        where: {
          bookingId: booking.id,
          status: { in: [RefundStatus.REFUND_PROCESSING, RefundStatus.REFUNDED] },
        },
        _sum: { amount: true },
      });
      const approvedAmount = booking.cancellationRequest.approvedRefundAmount ?? 0;
      const remainingApproved = approvedAmount - (existingRefunds._sum.amount ?? 0);
      if (parsed.data.amount > remainingApproved) {
        throw new CancellationInputError('مبلغ الاسترداد أكبر من الرصيد المعتمد المتبقي.');
      }

      const created = await tx.refund.create({
        data: {
          bookingId: booking.id,
          amount: parsed.data.amount,
          refundMethod: parsed.data.refundMethod,
          referenceNumber: parsed.data.referenceNumber || null,
          proofFileUrl: proofFile.fileUrl,
          proofFileId: proofFile.id,
          refundTimestamp: parsed.data.refundTimestamp,
          status: RefundStatus.REFUND_PROCESSING,
          recordedByUserId: manager.id,
          idempotencyKey: parsed.data.idempotencyKey,
          notes: [
            parsed.data.notes,
            `وقت تنفيذ الاسترداد: ${parsed.data.refundTimestamp.toISOString()}`,
          ].filter(Boolean).join('\n'),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: 'REFUND_RECORDED_FOR_APPROVAL',
          entityType: 'Refund',
          entityId: created.id,
          afterJson: {
            bookingId: booking.id,
            amount: created.amount,
            proofFileId: proofFile.id,
            refundTimestamp: parsed.data.refundTimestamp.toISOString(),
          },
          reason: parsed.data.notes || 'تسجيل استرداد يدوي',
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateCancellationPaths(parsed.data.bookingId);
    return { success: true, refundId: refund.id };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر تسجيل عملية الاسترداد.') };
  }
}

export async function approveRefundAction(formData: FormData) {
  const owner = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const parsed = approveRefundSchema.safeParse({
    refundId: formData.get('refundId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات اعتماد الاسترداد غير مكتملة.' };
  }

  const scoped = await db.refund.findUnique({
    where: { id: parsed.data.refundId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scoped) return { error: 'عملية الاسترداد غير موجودة.' };
  if (!(await hasPermissionAcrossScopes(
    owner,
    'refund.approve',
    bookingPermissionScopes(scoped.booking),
  ))) {
    return { error: 'لا تملك صلاحية اعتماد الاسترداد.' };
  }

  try {
    await assertBranchAccess(owner, scoped.booking.branchId);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${scoped.bookingId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${scoped.bookingId}`}))`;
      const refund = await tx.refund.findUnique({
        where: { id: parsed.data.refundId },
        include: { booking: { include: { cancellationRequest: true } } },
      });
      if (!refund || refund.status !== RefundStatus.REFUND_PROCESSING) {
        throw new CancellationInputError('تم اعتماد هذه العملية أو لم تعد قيد المعالجة.');
      }
      if (refund.booking.terminalReopenSourceStatus) {
        throw new CancellationInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل اعتماد أي استرداد.',
        );
      }
      const now = new Date();
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.REFUNDED,
          approvedByUserId: owner.id,
          approvedAt: now,
        },
      });
      const refunded = await tx.refund.aggregate({
        where: { bookingId: refund.bookingId, status: RefundStatus.REFUNDED },
        _sum: { amount: true },
      });
      const totalRefunded = refunded._sum.amount ?? 0;
      const approvedAmount = refund.booking.cancellationRequest?.approvedRefundAmount ?? 0;
      const paymentOutcome = cancellationPaymentOutcome({
        amountPaid: refund.booking.amountPaid,
        approvedRefundAmount: approvedAmount,
        cashRefunded: totalRefunded,
        creditReturned: refund.booking.cancellationRequest?.creditAmount ?? 0,
      });
      await tx.booking.update({
        where: { id: refund.bookingId },
        data: {
          paymentStatus: paymentOutcome
            ? PaymentStatus[paymentOutcome]
            : refund.booking.paymentStatus,
        },
      });
      if (refund.booking.cancellationRequest && totalRefunded >= approvedAmount) {
        await tx.cancellationRequest.update({
          where: { id: refund.booking.cancellationRequest.id },
          data: { status: 'COMPLETED', resolvedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: owner.id,
          actorRole: owner.role,
          action: 'REFUND_APPROVED',
          entityType: 'Refund',
          entityId: refund.id,
          beforeJson: { status: refund.status },
          afterJson: { status: RefundStatus.REFUNDED, totalRefunded },
          reason: parsed.data.reason,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateCancellationPaths(scoped.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر اعتماد عملية الاسترداد.') };
  }
}

export async function completeCancellationOverrideAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = completeCancellationOverrideSchema.safeParse({
    cancellationId: formData.get('cancellationId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'سبب التجاوز مطلوب.' };
  }
  const cancellation = await db.cancellationRequest.findUnique({
    where: { id: parsed.data.cancellationId },
    include: { booking: true },
  });
  if (!cancellation) return { error: 'طلب الإلغاء غير موجود.' };

  try {
    await assertBranchAccess(owner, cancellation.booking.branchId);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cancellation:${cancellation.bookingId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${cancellation.bookingId}`}))`;
      const current = await tx.cancellationRequest.findUnique({
        where: { id: cancellation.id },
        include: { booking: true },
      });
      if (!current || !['APPROVED_REFUND_PENDING', 'ESCALATED'].includes(current.status)) {
        throw new CancellationInputError('هذا الطلب لا يحتاج تجاوزًا إداريًا.');
      }
      if (current.booking.terminalReopenSourceStatus) {
        throw new CancellationInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل إكمال تسوية الإلغاء.',
        );
      }
      await tx.cancellationRequest.update({
        where: { id: current.id },
        data: {
          status: 'COMPLETED_OWNER_OVERRIDE',
          resolvedByUserId: owner.id,
          resolvedAt: new Date(),
          resolutionNotes: `${current.resolutionNotes ?? ''}\nتجاوز المالك: ${parsed.data.reason}`.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: owner.id,
          actorRole: owner.role,
          action: 'CANCELLATION_COMPLETED_WITH_OWNER_OVERRIDE',
          entityType: 'CancellationRequest',
          entityId: current.id,
          beforeJson: { status: current.status },
          afterJson: { status: 'COMPLETED_OWNER_OVERRIDE' },
          reason: parsed.data.reason,
        },
      });
    });
    revalidateCancellationPaths(cancellation.bookingId);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر إكمال طلب الإلغاء بالتجاوز الإداري.') };
  }
}

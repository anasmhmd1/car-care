'use server';

import { z } from 'zod';
import {
  BookingHoldStatus,
  BookingStatus,
  BranchStatus,
  FileType,
  PaymentStatus,
  Prisma,
  ProofStatus,
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
import { deleteUploadedFile } from '@/lib/upload';
import { localDateTimeToUtc } from '@/lib/engine/time';
import {
  AssignmentError,
  assignTeamToBooking,
  assignTeamToBookingInTransaction,
} from '@/lib/engine/assignment';
import {
  BookingTransitionError,
  transitionBookingStatus,
} from '@/lib/engine/transition';
import {
  calculateBookingPaymentTotals,
  canRecordBookingBalance,
} from '@/lib/engine/payment-totals';
import { CustomerCreditError } from '@/lib/engine/customer-credit';
import { syncInvoiceForBooking } from '@/lib/engine/invoice';
import { settleRejectedBooking } from '@/lib/engine/booking-rejection-settlement';
import { ensurePaymentVerificationReservation } from '@/lib/engine/payment-verification-reservation';
import {
  canExpireAwaitingPaymentBooking,
  expireAwaitingPaymentBooking,
} from '@/lib/engine/booking-expiration';
import {
  assignTeamManuallySchema,
  cancelBookingByOperationsSchema,
  recordBalancePaymentSchema,
  releaseBookingHoldSchema,
  rescheduleBookingByOperationsSchema,
  reviewBookingSchema,
  reviewPaymentProofSchema,
  toggleBranchScheduleLockSchema,
  transferBookingTeamSchema,
} from '@/lib/validations/operations';

const DELEGATED_OPERATIONS_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
  UserRole.EMPLOYEE,
] as const;
const MANAGEMENT_OPERATIONS_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;
const DEFAULT_HOLD_MINUTES = 120;
const OPERATIONS_REVIEW_HOLD_MINUTES = 24 * 60;

class OperationsInputError extends Error {}

function configuredMinutes(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function assertBranchScope(
  actor: { id: string; role: UserRole },
  branchId: string,
) {
  if (!(await canAccessBranch(actor, branchId))) {
    throw new OperationsInputError('غير مصرح لك بإدارة حجوزات هذا الفرع.');
  }
}

function operationError(error: unknown, fallback: string) {
  if (
    error instanceof OperationsInputError ||
    error instanceof AssignmentError ||
    error instanceof BookingTransitionError ||
    error instanceof CustomerCreditError
  ) {
    return error.message;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) {
    return 'تغيرت البيانات أثناء تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.';
  }
  console.error(fallback, error);
  return fallback;
}

function revalidateOperations(bookingId?: string) {
  revalidatePath('/operations');
  revalidatePath('/admin');
  revalidatePath('/staff/delegated');
  if (bookingId) {
    revalidatePath(`/account/bookings/${bookingId}`);
    revalidatePath('/account/bookings');
  }
}

/** Manual proof review. The proof, payment, totals, state history and audit are
 * committed together and a proof can only be decided once. */
export async function reviewPaymentProofAction(formData: FormData) {
  const manager = await requireRole([...DELEGATED_OPERATIONS_ROLES]);
  const parsed = reviewPaymentProofSchema.safeParse({
    proofId: formData.get('proofId'),
    decision: formData.get('decision'),
    reviewNotes: formData.get('reviewNotes') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات المراجعة غير مكتملة.' };
  }

  const scopedProof = await db.paymentProof.findUnique({
    where: { id: parsed.data.proofId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scopedProof) return { error: 'إثبات الدفع غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'payment.review',
    bookingPermissionScopes(scopedProof.booking),
  ))) {
    return { error: 'لا تملك صلاحية مراجعة إثباتات الدفع.' };
  }

  try {
    await assertBranchScope(manager, scopedProof.booking.branchId);
    await db.$transaction(async (tx) => {
      if (parsed.data.decision === 'VERIFY') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${scopedProof.booking.branchId}`}))`;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${scopedProof.bookingId}`}))`;
      const proof = await tx.paymentProof.findUnique({
        where: { id: parsed.data.proofId },
        include: {
          booking: {
            include: {
              vehicle: { select: { vehicleSize: true } },
              addons: { select: { addonId: true } },
            },
          },
          paymentMethod: true,
        },
      });
      if (!proof || proof.status !== ProofStatus.UNDER_REVIEW) {
        throw new OperationsInputError('تمت مراجعة هذا الإثبات بالفعل أو لم يعد متاحًا.');
      }
      if (proof.booking.bookingStatus !== BookingStatus.PAYMENT_UNDER_REVIEW) {
        throw new OperationsInputError('حالة الحجز لا تسمح بمراجعة هذا الإثبات الآن.');
      }

      const paidAggregate = await tx.payment.aggregate({
        where: { bookingId: proof.bookingId },
        _sum: { amount: true },
      });
      const verifiedPaid = paidAggregate._sum.amount ?? 0;
      const targetInitial = proof.booking.depositAmount > 0
        ? proof.booking.depositAmount
        : proof.booking.totalPrice;
      const remainingInitial = Math.max(0, targetInitial - verifiedPaid);
      const expectedAmount = Math.max(
        0,
        Math.min(
          proof.booking.amountDue > 0 ? proof.booking.amountDue : proof.booking.totalPrice,
          remainingInitial > 0 ? remainingInitial : Math.max(0, proof.booking.totalPrice - verifiedPaid),
        ),
      );
      if (parsed.data.decision === 'VERIFY') {
        if (expectedAmount <= 0) {
          throw new OperationsInputError('لا يوجد مبلغ أولي مستحق على هذا الحجز.');
        }
        if (proof.amountSubmitted < expectedAmount) {
          throw new OperationsInputError('المبلغ أقل من المطلوب؛ استخدم قرار «مبلغ ناقص».');
        }
        if (proof.amountSubmitted > (proof.booking.amountDue > 0 ? proof.booking.amountDue : proof.booking.totalPrice)) {
          throw new OperationsInputError('المبلغ المدخل أكبر من إجمالي المبلغ المستحق.');
        }
      }

      const proofStatusByDecision = {
        VERIFY: ProofStatus.VERIFIED,
        REJECT: ProofStatus.REJECTED,
        SHORT: ProofStatus.AMOUNT_SHORT,
        REUPLOAD: ProofStatus.REUPLOAD_REQUIRED,
        DUPLICATE: ProofStatus.DUPLICATE_SUSPECTED,
      } as const;
      const nextProofStatus = proofStatusByDecision[parsed.data.decision];
      const reviewedAt = new Date();
      let verificationReservation: Awaited<ReturnType<typeof ensurePaymentVerificationReservation>> = null;

      if (parsed.data.decision === 'VERIFY') {
        verificationReservation = await ensurePaymentVerificationReservation(tx, {
          booking: proof.booking,
          now: reviewedAt,
          holdMinutes: configuredMinutes(
            'OPERATIONS_REVIEW_HOLD_MINUTES',
            OPERATIONS_REVIEW_HOLD_MINUTES,
          ),
        });
        if (!verificationReservation) {
          throw new OperationsInputError(
            'لم يعد الموعد متاحًا عند اعتماد الدفع. لم يُسجل الدفع أو يُعدّل الإثبات؛ نسّق موعدًا بديلًا مع العميل.',
          );
        }
      }

      await tx.paymentReview.create({
        data: {
          proofId: proof.id,
          bookingId: proof.bookingId,
          reviewedByUserId: manager.id,
          decision: nextProofStatus,
          amountExpected: expectedAmount,
          amountSubmitted: proof.amountSubmitted,
          notes: parsed.data.reviewNotes || null,
          previousStatus: proof.status,
        },
      });
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: nextProofStatus,
          reviewedByUserId: manager.id,
          reviewNotes: parsed.data.reviewNotes || null,
          reviewedAt,
        },
      });

      if (parsed.data.decision === 'VERIFY') {
        if (!verificationReservation) {
          throw new OperationsInputError('تعذر تثبيت حجز الموعد قبل تسجيل الدفع.');
        }
        await tx.payment.create({
          data: {
            bookingId: proof.bookingId,
            proofId: proof.id,
            idempotencyKey: `proof:${proof.id}:verified`,
            amount: proof.amountSubmitted,
            paymentMethod: proof.paymentMethod.name,
            referenceNumber: proof.referenceNumber,
            recordedByUserId: manager.id,
            notes: parsed.data.reviewNotes || null,
          },
        });
        const paid = await tx.payment.aggregate({
          where: { bookingId: proof.bookingId },
          _sum: { amount: true },
        });
        const { amountPaid, amountDue } = calculateBookingPaymentTotals({
          totalPrice: proof.booking.totalPrice,
          creditAppliedAmount: proof.booking.creditAppliedAmount,
          verifiedCashAmount: paid._sum.amount ?? 0,
        });
        await tx.booking.update({
          where: { id: proof.bookingId },
          data: {
            amountPaid,
            amountDue,
            paymentStatus: amountDue === 0
              ? PaymentStatus.FULLY_PAID
              : PaymentStatus.PARTIALLY_PAID,
          },
        });
        await syncInvoiceForBooking(tx, {
          ...proof.booking,
          amountPaid,
          amountDue,
        }, manager.id);
        await transitionBookingStatus(tx, {
          bookingId: proof.bookingId,
          toStatus: BookingStatus.PAYMENT_VERIFIED,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: 'اعتماد إثبات التحويل يدويًا',
          metadata: {
            proofId: proof.id,
            amount: proof.amountSubmitted,
            reservationHoldId: verificationReservation.holdId,
            reservationTeamId: verificationReservation.teamId,
            reservationCreated: verificationReservation.created,
          },
        });
        await transitionBookingStatus(tx, {
          bookingId: proof.bookingId,
          toStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: 'إحالة الحجز إلى مراجعة التشغيل بعد اعتماد الدفع',
          metadata: { proofId: proof.id },
        });
      } else {
        const paymentStatusByDecision = {
          REJECT: PaymentStatus.REJECTED,
          SHORT: PaymentStatus.AMOUNT_SHORT,
          REUPLOAD: PaymentStatus.REUPLOAD_REQUIRED,
          DUPLICATE: PaymentStatus.DUPLICATE_SUSPECTED,
        } as const;
        await tx.booking.update({
          where: { id: proof.bookingId },
          data: { paymentStatus: paymentStatusByDecision[parsed.data.decision] },
        });
        await transitionBookingStatus(tx, {
          bookingId: proof.bookingId,
          toStatus: BookingStatus.AWAITING_PAYMENT_PROOF,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.reviewNotes,
          metadata: { proofId: proof.id, decision: parsed.data.decision },
        });
        await tx.bookingHold.updateMany({
          where: { bookingId: proof.bookingId, status: BookingHoldStatus.ACTIVE },
          data: {
            expiresAt: new Date(
              reviewedAt.getTime() +
              configuredMinutes('BOOKING_HOLD_MINUTES', DEFAULT_HOLD_MINUTES) * 60_000,
            ),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: `PAYMENT_PROOF_${parsed.data.decision}`,
          entityType: 'PaymentProof',
          entityId: proof.id,
          beforeJson: { status: proof.status },
          afterJson: {
            status: nextProofStatus,
            expectedAmount,
            submitted: proof.amountSubmitted,
            ...(verificationReservation ? {
              reservationHoldId: verificationReservation.holdId,
              reservationTeamId: verificationReservation.teamId,
              reservationCreated: verificationReservation.created,
            } : {}),
          },
          reason: parsed.data.reviewNotes || null,
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: 20_000,
    });

    revalidateOperations(scopedProof.bookingId);
    return { success: true };
  } catch (error) {
    return { error: operationError(error, 'تعذر إتمام مراجعة إثبات الدفع.') };
  }
}

/** Accepting the booking is intentionally separate from payment verification. */
export async function reviewBookingAction(formData: FormData) {
  const manager = await requireRole([...DELEGATED_OPERATIONS_ROLES]);
  const parsed = reviewBookingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات قرار الحجز غير مكتملة.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'booking.accept',
    bookingPermissionScopes(scopedBooking),
  ))) {
    return { error: 'لا تملك صلاحية اعتماد الحجوزات.' };
  }

  try {
    await assertBranchScope(manager, scopedBooking.branchId);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-review:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
      });
      if (!booking || booking.bookingStatus !== BookingStatus.AWAITING_OPERATIONS_REVIEW) {
        throw new OperationsInputError('تمت مراجعة هذا الحجز بالفعل أو تغيرت حالته.');
      }

      if (parsed.data.decision === 'REJECT') {
        await settleRejectedBooking(tx, {
          booking,
          actor: manager,
          reason: parsed.data.reason,
        });
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: BookingStatus.REJECTED,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.reason,
        });
        await tx.bookingHold.updateMany({
          where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
          data: {
            status: BookingHoldStatus.RELEASED,
            releasedAt: new Date(),
            releasedReason: `رفض الحجز: ${parsed.data.reason}`,
          },
        });
        return { accepted: false, assigned: false };
      }

      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.ACCEPTED,
        actorUserId: manager.id,
        actorRole: manager.role,
        reason: parsed.data.reason,
      });
      const assignment = await assignTeamToBookingInTransaction(tx, {
        bookingId: booking.id,
        assignedByUserId: manager.id,
        actorRole: manager.role,
        reason: 'توزيع الحجز بعد اعتماده تشغيليًا',
      });

      return { accepted: true, ...assignment };
    }, {
      maxWait: 15_000,
      timeout: 60_000,
    });

    revalidateOperations(parsed.data.bookingId);
    return { success: true, ...result };
  } catch (error) {
    return { error: operationError(error, 'تعذر حفظ قرار مراجعة الحجز.') };
  }
}

export async function assignTeamManuallyAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = assignTeamManuallySchema.safeParse({
    bookingId: formData.get('bookingId'),
    teamId: formData.get('teamId'),
    reason: formData.get('reason') || 'توزيع يدوي بواسطة مدير التشغيل',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'يرجى اختيار الحجز والفريق.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'booking.assign',
    bookingPermissionScopes(scopedBooking),
  ))) {
    return { error: 'لا تملك صلاحية توزيع الحجوزات.' };
  }

  try {
    await assertBranchScope(manager, scopedBooking.branchId);
    const assignment = await assignTeamToBooking({
      bookingId: parsed.data.bookingId,
      assignedByUserId: manager.id,
      actorRole: manager.role,
      preferredTeamId: parsed.data.teamId,
      reason: parsed.data.reason,
    });
    revalidateOperations(parsed.data.bookingId);
    return { success: true, ...assignment };
  } catch (error) {
    return { error: operationError(error, 'تعذر إسناد الفريق.') };
  }
}

export async function recordBalancePaymentAction(formData: FormData) {
  const manager = await requireRole([...DELEGATED_OPERATIONS_ROLES]);
  const parsed = recordBalancePaymentSchema.safeParse({
    bookingId: formData.get('bookingId'),
    amount: formData.get('amount'),
    paymentMethod: formData.get('paymentMethod'),
    referenceNumber: formData.get('referenceNumber') ?? '',
    notes: formData.get('notes') ?? '',
    idempotencyKey: formData.get('idempotencyKey'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات التحصيل غير مكتملة.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'payment.record_balance',
    bookingPermissionScopes(scopedBooking),
  ))) {
    return { error: 'لا تملك صلاحية تسجيل الرصيد المحصل.' };
  }

  try {
    await assertBranchScope(manager, scopedBooking.branchId);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`balance:${parsed.data.bookingId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
      });
      if (!booking) throw new OperationsInputError('الحجز غير موجود.');
      if (booking.terminalReopenSourceStatus) {
        throw new OperationsInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تسجيل أي تحصيل.',
        );
      }
      const existingPayment = await tx.payment.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyKey },
      });
      if (existingPayment) {
        if (
          existingPayment.bookingId !== booking.id
          || existingPayment.amount !== parsed.data.amount
          || existingPayment.paymentMethod !== parsed.data.paymentMethod
        ) {
          throw new OperationsInputError('مفتاح عملية التحصيل مستخدم لعملية مختلفة.');
        }
        return { idempotent: true };
      }
      if (
        manager.role === UserRole.EMPLOYEE
        && booking.assignedTeamId !== scopedBooking.assignedTeamId
      ) {
        throw new OperationsInputError('تغير الفريق المسند أثناء تسجيل التحصيل؛ حدّث الصفحة وأعد المحاولة.');
      }
      if (!canRecordBookingBalance(booking.bookingStatus)) {
        throw new OperationsInputError('لا يمكن تسجيل الرصيد لحجز ملغي أو غير مؤكد.');
      }

      const paidBefore = await tx.payment.aggregate({
        where: { bookingId: booking.id },
        _sum: { amount: true },
      });
      const totalsBefore = calculateBookingPaymentTotals({
        totalPrice: booking.totalPrice,
        creditAppliedAmount: booking.creditAppliedAmount,
        verifiedCashAmount: paidBefore._sum.amount ?? 0,
      });
      if (parsed.data.amount > totalsBefore.amountDue) {
        throw new OperationsInputError('المبلغ أكبر من الرصيد المستحق على الحجز.');
      }

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          idempotencyKey: parsed.data.idempotencyKey,
          amount: parsed.data.amount,
          paymentMethod: parsed.data.paymentMethod,
          referenceNumber: parsed.data.referenceNumber || null,
          recordedByUserId: manager.id,
          notes: parsed.data.notes || null,
        },
      });
      const { amountPaid, amountDue } = calculateBookingPaymentTotals({
        totalPrice: booking.totalPrice,
        creditAppliedAmount: booking.creditAppliedAmount,
        verifiedCashAmount: (paidBefore._sum.amount ?? 0) + parsed.data.amount,
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          amountPaid,
          amountDue,
          paymentStatus: amountDue === 0 ? PaymentStatus.FULLY_PAID : PaymentStatus.PARTIALLY_PAID,
        },
      });
      await syncInvoiceForBooking(tx, {
        ...booking,
        amountPaid,
        amountDue,
      }, manager.id);
      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: 'BOOKING_BALANCE_PAYMENT_RECORDED',
          entityType: 'Booking',
          entityId: booking.id,
          beforeJson: { amountPaid: totalsBefore.amountPaid, amountDue: totalsBefore.amountDue },
          afterJson: { amountPaid, amountDue, amount: parsed.data.amount },
          reason: parsed.data.notes || 'تسجيل تحصيل يدوي',
        },
      });
      return { idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateOperations(parsed.data.bookingId);
    return { success: true };
  } catch (error) {
    return { error: operationError(error, 'تعذر تسجيل المبلغ المحصل.') };
  }
}

export async function releaseBookingHoldAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = releaseBookingHoldSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'سبب تحرير الحجز المؤقت مطلوب.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'booking.release_hold',
    bookingPermissionScopes(scopedBooking),
  ))) {
    return { error: 'لا تملك صلاحية تحرير الحجز المؤقت.' };
  }

  try {
    await assertBranchScope(manager, scopedBooking.branchId);
    const releaseResult = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${scopedBooking.branchId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hold-expiry:${parsed.data.bookingId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          subscriptionId: true,
          bookingStatus: true,
          terminalReopenSourceStatus: true,
          creditAppliedAmount: true,
        },
      });
      if (!booking) throw new OperationsInputError('الحجز غير موجود.');
      if (booking.terminalReopenSourceStatus) {
        throw new OperationsInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تحرير أي حجز مؤقت.',
        );
      }

      const releasedAt = new Date();
      const result = await tx.bookingHold.updateMany({
        where: { bookingId: parsed.data.bookingId, status: BookingHoldStatus.ACTIVE },
        data: {
          status: BookingHoldStatus.RELEASED,
          releasedAt,
          releasedReason: parsed.data.reason,
        },
      });
      if (!result.count) throw new OperationsInputError('لا يوجد حجز مؤقت نشط لتحريره.');

      const expiration = canExpireAwaitingPaymentBooking(booking.bookingStatus)
        ? await expireAwaitingPaymentBooking(tx, {
            booking,
            actor: manager,
            now: releasedAt,
            reason: parsed.data.reason,
            automatic: false,
          })
        : { expired: false };
      const retainedHoldCount = expiration.expired
        ? 0
        : await tx.bookingHold.count({
            where: {
              bookingId: booking.id,
              status: BookingHoldStatus.ACTIVE,
              expiresAt: { gt: releasedAt },
            },
          });
      const reservationRetained = retainedHoldCount > 0;

      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: 'BOOKING_HOLD_RELEASED',
          entityType: 'Booking',
          entityId: parsed.data.bookingId,
          afterJson: {
            releasedCount: result.count,
            bookingExpired: expiration.expired,
            reservationRetained,
          },
          reason: parsed.data.reason,
        },
      });
      return {
        released: result.count,
        bookingExpired: expiration.expired,
        reservationRetained,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 15_000,
    });
    revalidateOperations(parsed.data.bookingId);
    return { success: true, ...releaseResult };
  } catch (error) {
    return { error: operationError(error, 'تعذر تحرير الحجز المؤقت.') };
  }
}

export async function cancelBookingByOperationsAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = cancelBookingByOperationsSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الإلغاء غير مكتملة.' };
  }

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      bookingStatus: true,
      bookingNumber: true,
      assignedTeamId: true,
      terminalReopenSourceStatus: true,
    },
  });
  if (!booking) return { error: 'الحجز غير موجود.' };
  await assertBranchScope(manager, booking.branchId);
  if (booking.terminalReopenSourceStatus) {
    return { error: 'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل إلغائه.' };
  }

  const TERMINAL: readonly string[] = ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'];
  if (TERMINAL.includes(booking.bookingStatus)) {
    return { error: 'لا يمكن إلغاء حجز منتهٍ أو ملغي بالفعل.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${booking.id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${booking.id}`}))`;

      // 1. Release any active holds
      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
        data: {
          status: BookingHoldStatus.RELEASED,
          releasedAt: new Date(),
          releasedReason: parsed.data.reason,
        },
      });

      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.CANCELLED,
        actorUserId: manager.id,
        actorRole: manager.role,
        reason: parsed.data.reason,
        metadata: { source: 'OPERATIONS_CANCELLATION' },
      });
    });

    revalidateOperations(booking.id);
    return { success: true, message: `تم إلغاء الحجز رقم #${booking.bookingNumber} بنجاح.` };
  } catch (error) {
    return { error: operationError(error, 'تعذر إلغاء الحجز.') };
  }
}

export async function rescheduleBookingByOperationsAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = rescheduleBookingByOperationsSchema.safeParse({
    bookingId: formData.get('bookingId'),
    targetDate: formData.get('targetDate'),
    targetTime: formData.get('targetTime'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الموعد الجديد غير مكتملة.' };
  }

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId, deletedAt: null },
    include: {
      branch: { include: { workingHours: true } },
      service: { include: { variants: true } },
      vehicle: true,
      addons: true,
    },
  });
  if (!booking) return { error: 'الحجز غير موجود.' };
  await assertBranchScope(manager, booking.branchId);
  if (booking.terminalReopenSourceStatus) {
    return { error: 'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تعديل موعده.' };
  }

  const TERMINAL: readonly string[] = ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'];
  if (TERMINAL.includes(booking.bookingStatus)) {
    return { error: 'لا يمكن تعديل موعد حجز منتهٍ أو ملغي.' };
  }

  const newStartAt = localDateTimeToUtc(
    parsed.data.targetDate,
    parsed.data.targetTime,
    booking.branch.timezone,
  );

  const durationMinutes = booking.service.variants.find(
    (v) => v.vehicleSize === booking.vehicle?.vehicleSize,
  )?.durationMinutes ?? 60;

  const newEndAt = new Date(newStartAt.getTime() + durationMinutes * 60_000);

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${booking.id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${booking.id}`}))`;
      const current = await tx.booking.findFirst({
        where: { id: booking.id, deletedAt: null },
        select: { terminalReopenSourceStatus: true },
      });
      if (!current || current.terminalReopenSourceStatus) {
        throw new OperationsInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل تعديل موعده.',
        );
      }

      const previousStartAt = booking.startAt;
      const previousEndAt = booking.endAt;
      const rescheduleTargetStatus = booking.bookingStatus === BookingStatus.RESCHEDULE_REQUESTED
        ? (booking.assignedTeamId ? BookingStatus.ASSIGNED : BookingStatus.ACCEPTED)
        : null;

      // Update booking date & time
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          startAt: newStartAt,
          endAt: newEndAt,
        },
      });

      if (rescheduleTargetStatus) {
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: rescheduleTargetStatus,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.reason,
          metadata: {
            source: 'OPERATIONS_RESCHEDULE_APPROVAL',
            previousStartAt: previousStartAt.toISOString(),
            previousEndAt: previousEndAt.toISOString(),
            newStartAt: newStartAt.toISOString(),
            newEndAt: newEndAt.toISOString(),
          },
        });
      }

      // If there was a pending time change request, approve it
      await tx.bookingTimeChange.updateMany({
        where: { bookingId: booking.id, status: TimeChangeStatus.PENDING },
        data: {
          status: TimeChangeStatus.APPROVED,
          reviewedByUserId: manager.id,
          reviewNotes: parsed.data.reason,
          reviewedAt: new Date(),
        },
      });

      // Log status history / time change
      if (!rescheduleTargetStatus) {
        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: booking.bookingStatus,
            toStatus: booking.bookingStatus,
            changedByUserId: manager.id,
            actorRole: manager.role,
            reason: `تعديل/تأجيل الموعد: ${parsed.data.reason}`,
            metadata: {
              previousStartAt: previousStartAt.toISOString(),
              previousEndAt: previousEndAt.toISOString(),
              newStartAt: newStartAt.toISOString(),
              newEndAt: newEndAt.toISOString(),
            },
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          branchId: booking.branchId,
          action: 'BOOKING_RESCHEDULED_BY_OPERATIONS',
          entityType: 'Booking',
          entityId: booking.id,
          beforeJson: { startAt: previousStartAt, endAt: previousEndAt },
          afterJson: { startAt: newStartAt, endAt: newEndAt },
          reason: parsed.data.reason,
        },
      });
    });

    revalidateOperations(booking.id);
    revalidatePath('/admin/calendar');
    return { success: true, message: `تم تأجيل وتعديل موعد الحجز #${booking.bookingNumber} بنجاح.` };
  } catch (error) {
    return { error: operationError(error, 'تعذر تعديل موعد الحجز.') };
  }
}

export async function transferBookingTeamAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = transferBookingTeamSchema.safeParse({
    bookingId: formData.get('bookingId'),
    targetTeamId: formData.get('targetTeamId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات نقل الفريق غير مكتملة.' };
  }

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      assignedTeamId: true,
      bookingNumber: true,
      bookingStatus: true,
      terminalReopenSourceStatus: true,
    },
  });
  if (!booking) return { error: 'الحجز غير موجود.' };
  await assertBranchScope(manager, booking.branchId);
  if (booking.terminalReopenSourceStatus) {
    return { error: 'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل نقل فريقه.' };
  }

  const targetTeam = await db.team.findUnique({
    where: { id: parsed.data.targetTeamId },
    select: { id: true, name: true, branchId: true, active: true },
  });
  if (!targetTeam || !targetTeam.active || targetTeam.branchId !== booking.branchId) {
    return { error: 'الفريق المستهدف غير متاح أو لا يتبع نفس الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${booking.id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-terminal-reopen:${booking.id}`}))`;
      const current = await tx.booking.findFirst({
        where: { id: booking.id, deletedAt: null },
        select: { terminalReopenSourceStatus: true },
      });
      if (!current || current.terminalReopenSourceStatus) {
        throw new OperationsInputError(
          'الحجز مفتوح لمراجعة إدارية طرفية؛ أغلق المراجعة قبل نقل فريقه.',
        );
      }

      const previousTeamId = booking.assignedTeamId;
      const nextStatus = booking.bookingStatus === BookingStatus.AWAITING_ASSIGNMENT
        ? BookingStatus.ASSIGNED
        : booking.bookingStatus;

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          assignedTeamId: targetTeam.id,
          assignedEmployeeId: null,
          operationalVehicleId: null,
        },
      });

      if (nextStatus !== booking.bookingStatus) {
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: nextStatus,
          actorUserId: manager.id,
          actorRole: manager.role,
          reason: parsed.data.reason,
          metadata: { source: 'OPERATIONS_TEAM_TRANSFER' },
        });
      }

      await tx.bookingAssignmentHistory.create({
        data: {
          bookingId: booking.id,
          fromTeamId: previousTeamId,
          toTeamId: targetTeam.id,
          changedByUserId: manager.id,
          action: 'REASSIGNED',
          reason: parsed.data.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          branchId: booking.branchId,
          action: 'BOOKING_TEAM_TRANSFERRED',
          entityType: 'Booking',
          entityId: booking.id,
          beforeJson: { assignedTeamId: previousTeamId },
          afterJson: { assignedTeamId: targetTeam.id, teamName: targetTeam.name },
          reason: parsed.data.reason,
        },
      });
    });

    revalidateOperations(booking.id);
    revalidatePath('/admin/calendar');
    revalidatePath('/staff');
    return { success: true, message: `تم نقل الحجز #${booking.bookingNumber} إلى ${targetTeam.name} بنجاح.` };
  } catch (error) {
    return { error: operationError(error, 'تعذر نقل الحجز للفريق الجديد.') };
  }
}

export async function toggleBranchScheduleLockAction(formData: FormData) {
  const manager = await requireRole([...MANAGEMENT_OPERATIONS_ROLES]);
  const parsed = toggleBranchScheduleLockSchema.safeParse({
    branchId: formData.get('branchId'),
    locked: formData.get('locked'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات قفل الجدول غير صالحة.' };
  }

  const { branchId, locked, reason } = parsed.data;
  await assertBranchScope(manager, branchId);

  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, nameAr: true, status: true },
  });
  if (!branch) return { error: 'الفرع غير موجود.' };

  const targetStatus = locked ? BranchStatus.PAUSED : BranchStatus.ACTIVE;

  try {
    await db.branch.update({
      where: { id: branchId },
      data: { status: targetStatus },
    });

    await db.auditLog.create({
      data: {
        actorUserId: manager.id,
        actorRole: manager.role,
        branchId,
        action: locked ? 'BRANCH_SCHEDULE_LOCKED' : 'BRANCH_SCHEDULE_UNLOCKED',
        entityType: 'Branch',
        entityId: branchId,
        beforeJson: { status: branch.status },
        afterJson: { status: targetStatus, locked },
        reason: reason || (locked ? 'قفل جدول المواعيد بقرار تشغيلي' : 'إلغاء قفل جدول المواعيد'),
      },
    });

    revalidateOperations();
    revalidatePath('/admin/calendar');
    revalidatePath('/admin');
    revalidatePath('/services');
    return {
      success: true,
      message: locked
        ? `تم قفل جدول مواعيد ${branch.nameAr} وإيقاف استقبال الحجوزات من الموقع.`
        : `تم فتح جدول مواعيد ${branch.nameAr} واستئناف استقبال الحجوزات.`,
    };
  } catch (error) {
    return { error: operationError(error, 'تعذر تحديث حالة جدول المواعيد.') };
  }
}

const deleteProofSchema = z.object({
  proofId: z.string().trim().min(1, 'معرّف الإثبات مطلوب.'),
  bookingId: z.string().trim().optional(),
});

export async function deletePaymentProofReceiptAction(formData: FormData) {
  try {
    const actor = await requireRole([
      UserRole.OWNER,
      UserRole.SYSTEM_SUPER_ADMIN,
      UserRole.OPERATIONS_MANAGER,
    ]);

    const parsed = deleteProofSchema.safeParse({
      proofId: formData.get('proofId'),
      bookingId: formData.get('bookingId') || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.' };
    }

    const proof = await db.paymentProof.findUnique({
      where: { id: parsed.data.proofId },
      include: {
        booking: {
          select: {
            id: true,
            branchId: true,
            bookingNumber: true,
          },
        },
      },
    });

    if (!proof) {
      return { error: 'إثبات الدفع غير موجود.' };
    }

    if (actor.role === UserRole.OPERATIONS_MANAGER) {
      const allowed = await canAccessBranch(actor, proof.booking.branchId);
      if (!allowed) {
        return { error: 'ليس لديك صلاحية على هذا الفرع.' };
      }
    }

    // Delete the file from storage if fileUrl exists
    if (proof.proofFileUrl && proof.proofFileUrl.startsWith('/api/files/')) {
      const parts = proof.proofFileUrl.split('/api/files/');
      if (parts[1]) {
        const [subDir, ...rest] = parts[1].split('/');
        const fileName = rest.join('/');
        if (subDir && fileName) {
          try {
            await deleteUploadedFile(subDir, fileName);
          } catch (err) {
            console.warn('[Delete Receipt] Failed to delete file from storage', err);
          }
        }
      }
    }

    // Update paymentProof and delete associated BookingFile
    await db.$transaction(async (tx) => {
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          proofFileUrl: '',
          proofFileId: null,
        },
      });

      if (proof.proofFileId) {
        await tx.bookingFile.deleteMany({
          where: { id: proof.proofFileId },
        });
      } else {
        await tx.bookingFile.deleteMany({
          where: {
            bookingId: proof.booking.id,
            fileType: FileType.PAYMENT_PROOF,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'PAYMENT_PROOF_RECEIPT_MANUALLY_DELETED',
          entityType: 'PaymentProof',
          entityId: proof.id,
          afterJson: {
            bookingId: proof.booking.id,
            bookingNumber: proof.booking.bookingNumber,
          },
        },
      });
    });

    revalidateOperations(proof.booking.id);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath(`/account/bookings/${proof.booking.id}`);

    return { success: true, message: 'تم حذف إيصال الدفع بنجاح.' };
  } catch (error) {
    return { error: operationError(error, 'تعذر حذف إيصال الدفع.') };
  }
}

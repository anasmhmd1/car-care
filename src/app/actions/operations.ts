'use server';

import {
  BookingHoldStatus,
  BookingStatus,
  PaymentStatus,
  Prisma,
  ProofStatus,
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
  recordBalancePaymentSchema,
  releaseBookingHoldSchema,
  reviewBookingSchema,
  reviewPaymentProofSchema,
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
const DEFAULT_HOLD_MINUTES = 30;
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

      const expectedAmount = Math.max(
        0,
        Math.min(
          proof.booking.amountDue,
          proof.booking.depositAmount - proof.booking.amountPaid,
        ),
      );
      if (parsed.data.decision === 'VERIFY') {
        if (expectedAmount <= 0) {
          throw new OperationsInputError('لا يوجد مبلغ أولي مستحق على هذا الحجز.');
        }
        if (proof.amountSubmitted < expectedAmount) {
          throw new OperationsInputError('المبلغ أقل من المطلوب؛ استخدم قرار «مبلغ ناقص».');
        }
        if (proof.amountSubmitted > proof.booking.amountDue) {
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
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 25_000,
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
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
      });
      if (!booking) throw new OperationsInputError('الحجز غير موجود.');
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
        throw new OperationsInputError('لا يمكن تسجيل الرصيد إلا بعد وصول الفريق وخلال تنفيذ أو إغلاق الخدمة.');
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

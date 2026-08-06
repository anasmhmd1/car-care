import {
  PaymentStatus,
  type Booking,
  type Prisma,
  type UserRole,
} from '@prisma/client';
import {
  calculateCancellationSettlement,
  cancellationPaymentOutcome,
} from './cancellation-settlement';
import { returnBookingValueToCredit } from './customer-credit';
import { releaseSubscriptionVisitForBooking } from './subscription';

type RejectedBookingFinancials = Pick<
  Booking,
  | 'id'
  | 'customerId'
  | 'subscriptionId'
  | 'bookingStatus'
  | 'paymentStatus'
  | 'amountPaid'
  | 'depositAmount'
  | 'creditAppliedAmount'
>;

export async function settleRejectedBooking(
  tx: Prisma.TransactionClient,
  input: {
    booking: RejectedBookingFinancials;
    actor: { id: string; role: UserRole };
    reason: string;
  },
) {
  const { booking, actor, reason } = input;
  if (booking.subscriptionId) {
    await releaseSubscriptionVisitForBooking(tx, {
      bookingId: booking.id,
      userId: actor.id,
      role: actor.role,
      reason: 'رفض الحجز تشغيليًا وتحرير زيارة الاشتراك المحجوزة',
    });
  }
  if (booking.amountPaid === 0) {
    return { refundRequired: false, settlement: null, paymentOutcome: null };
  }

  const settlement = calculateCancellationSettlement({
    resolutionType: 'REFUND_FULL',
    amountPaid: booking.amountPaid,
    depositAmount: booking.depositAmount,
    creditAppliedAmount: booking.creditAppliedAmount,
  });
  await returnBookingValueToCredit(tx, {
    bookingId: booking.id,
    customerId: booking.customerId,
    amount: settlement.creditAmount,
    actorUserId: actor.id,
    transactionType: 'BOOKING_REJECTION_CREDIT',
    reason,
  });

  const refundRequired = settlement.approvedRefundAmount > 0;
  const resolvedAt = refundRequired ? null : new Date();
  await tx.cancellationRequest.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      customerId: booking.customerId,
      reason: `رفض الحجز تشغيليًا: ${reason}`,
      preferredAction: 'REFUND',
      previousBookingStatus: booking.bookingStatus,
      status: refundRequired ? 'APPROVED_REFUND_PENDING' : 'COMPLETED',
      resolutionType: 'REFUND_FULL',
      resolutionNotes: reason,
      responsibleParty: 'BRANCH',
      refundRequired,
      approvedRefundAmount: settlement.approvedRefundAmount,
      retainedAmount: settlement.retainedAmount,
      creditAmount: settlement.creditAmount,
      resolvedByUserId: actor.id,
      resolvedAt,
    },
    update: {
      customerId: booking.customerId,
      reason: `رفض الحجز تشغيليًا: ${reason}`,
      preferredAction: 'REFUND',
      previousBookingStatus: booking.bookingStatus,
      status: refundRequired ? 'APPROVED_REFUND_PENDING' : 'COMPLETED',
      resolutionType: 'REFUND_FULL',
      resolutionNotes: reason,
      responsibleParty: 'BRANCH',
      refundRequired,
      approvedRefundAmount: settlement.approvedRefundAmount,
      retainedAmount: settlement.retainedAmount,
      creditAmount: settlement.creditAmount,
      resolvedByUserId: actor.id,
      resolvedAt,
    },
  });

  const paymentOutcome = cancellationPaymentOutcome({
    amountPaid: booking.amountPaid,
    approvedRefundAmount: settlement.approvedRefundAmount,
    cashRefunded: 0,
    creditReturned: settlement.creditAmount,
  });
  await tx.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: paymentOutcome
        ? PaymentStatus[paymentOutcome]
        : booking.paymentStatus,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'BOOKING_REJECTION_SETTLEMENT_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      afterJson: {
        approvedRefundAmount: settlement.approvedRefundAmount,
        creditAmount: settlement.creditAmount,
        retainedAmount: settlement.retainedAmount,
        paymentStatus: paymentOutcome,
      },
      reason,
    },
  });

  return { refundRequired, settlement, paymentOutcome };
}

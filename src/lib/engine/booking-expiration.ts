import {
  BookingStatus,
  PaymentStatus,
  type Booking,
  type Prisma,
  type UserRole,
} from '@prisma/client';
import { returnBookingValueToCredit } from './customer-credit';
import { releaseSubscriptionVisitForBooking } from './subscription';
import { transitionBookingStatus } from './transition';

const AWAITING_PAYMENT_EXPIRY_STATUSES = new Set<BookingStatus>([
  BookingStatus.REQUEST_SUBMITTED,
  BookingStatus.AWAITING_PAYMENT_PROOF,
]);

type ExpirableBooking = Pick<
  Booking,
  | 'id'
  | 'customerId'
  | 'subscriptionId'
  | 'bookingStatus'
  | 'creditAppliedAmount'
>;

export function canExpireAwaitingPaymentBooking(status: BookingStatus): boolean {
  return AWAITING_PAYMENT_EXPIRY_STATUSES.has(status);
}

/**
 * Finalizes a pre-proof hold expiry and reverses all reserved financial value.
 * The shared hold lock makes this safe against a simultaneous proof upload.
 */
export async function expireAwaitingPaymentBooking(
  tx: Prisma.TransactionClient,
  input: {
    booking: ExpirableBooking;
    actor: { id: string; role: UserRole };
    now: Date;
    reason?: string;
    automatic?: boolean;
  },
) {
  const { booking, actor, now } = input;
  if (!canExpireAwaitingPaymentBooking(booking.bookingStatus)) return { expired: false };

  const automatic = input.automatic ?? true;
  const transitionReason = input.reason ?? 'انتهت مهلة رفع إثبات الدفع تلقائيًا';
  const settlementReason = automatic
    ? 'انتهاء مهلة رفع إثبات الدفع'
    : 'تحرير الحجز المؤقت يدويًا';

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hold-expiry:${booking.id}`}))`;
  await transitionBookingStatus(tx, {
    bookingId: booking.id,
    toStatus: BookingStatus.EXPIRED,
    actorUserId: actor.id,
    actorRole: actor.role,
    reason: transitionReason,
    metadata: { automatic, expiredAt: now.toISOString() },
  });
  if (booking.subscriptionId) {
    await releaseSubscriptionVisitForBooking(tx, {
      bookingId: booking.id,
      userId: actor.id,
      role: actor.role,
      reason: `تحرير زيارة الاشتراك بعد ${settlementReason}`,
    });
  }
  await returnBookingValueToCredit(tx, {
    bookingId: booking.id,
    customerId: booking.customerId,
    amount: booking.creditAppliedAmount,
    actorUserId: actor.id,
    transactionType: 'BOOKING_EXPIRY_CREDIT',
    reason: `إعادة الرصيد بعد ${settlementReason}`,
  });
  if (booking.creditAppliedAmount > 0) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
  }
  return { expired: true };
}

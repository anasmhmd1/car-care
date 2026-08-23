import { BookingStatus } from '@prisma/client';

const BALANCE_COLLECTION_STATUSES = new Set<BookingStatus>([
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_ASSIGNMENT,
  BookingStatus.ASSIGNED,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
]);

export function canRecordBookingBalance(status: BookingStatus): boolean {
  return BALANCE_COLLECTION_STATUSES.has(status);
}

export function calculateBookingPaymentTotals(input: {
  totalPrice: number;
  creditAppliedAmount: number;
  verifiedCashAmount: number;
}) {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
  }

  const amountPaid = Math.min(
    input.totalPrice,
    input.creditAppliedAmount + input.verifiedCashAmount,
  );
  return {
    amountPaid,
    amountDue: input.totalPrice - amountPaid,
  };
}

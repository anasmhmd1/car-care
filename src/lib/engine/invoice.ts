import type { Prisma } from '@prisma/client';

type InvoiceBooking = {
  id: string;
  bookingNumber: string;
  customerId: string;
  branchId: string;
  totalPrice: number;
  amountPaid: number;
  amountDue: number;
};

/** Stable invoice identifiers make the operation idempotent and avoid a
 * sequence dependency during concurrent payment/booking updates. */
export function invoiceNumberForBooking(bookingNumber: string) {
  return `BRQ-${bookingNumber.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()}`;
}

export async function syncInvoiceForBooking(
  tx: Prisma.TransactionClient,
  booking: InvoiceBooking,
  issuedByUserId?: string | null,
) {
  const paidAmount = Math.max(0, booking.totalPrice - booking.amountDue);
  return tx.invoice.upsert({
    where: { bookingId: booking.id },
    create: {
      invoiceNumber: invoiceNumberForBooking(booking.bookingNumber),
      bookingId: booking.id,
      customerId: booking.customerId,
      branchId: booking.branchId,
      subtotalAmount: booking.totalPrice,
      paidAmount,
      dueAmount: Math.max(0, booking.amountDue),
      issuedByUserId: issuedByUserId ?? null,
    },
    update: {
      subtotalAmount: booking.totalPrice,
      paidAmount,
      dueAmount: Math.max(0, booking.amountDue),
      ...(issuedByUserId ? { issuedByUserId } : {}),
    },
  });
}

import type { Prisma } from '@prisma/client';

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export class CustomerCreditError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'CustomerCreditError';
  }
}

export interface ReturnBookingValueToCreditInput {
  bookingId: string;
  customerId: string;
  amount: number;
  actorUserId: string;
  transactionType: string;
  reason: string;
}

/**
 * Returns value to the customer's internal balance exactly once for a terminal
 * booking outcome. All terminal paths share the same idempotency key so an
 * expiry, rejection and cancellation can never credit the same booking twice.
 */
export async function returnBookingValueToCredit(
  tx: Prisma.TransactionClient,
  input: ReturnBookingValueToCreditInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount < 0) {
    throw new CustomerCreditError('قيمة الرصيد المراد إعادتها غير صالحة.', 'INVALID_CREDIT_AMOUNT');
  }
  if (input.amount === 0) return { applied: false, transaction: null };

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-credit:${input.customerId}`}))`;

  const idempotencyKey = `booking:${input.bookingId}:terminal-credit-returned`;
  const existing = await tx.customerCreditTransaction.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (
      existing.bookingId !== input.bookingId
      || existing.customerId !== input.customerId
      || existing.amount !== input.amount
    ) {
      throw new CustomerCreditError(
        'تعارضت محاولة إعادة الرصيد مع تسوية سابقة لهذا الحجز.',
        'CREDIT_IDEMPOTENCY_CONFLICT',
      );
    }
    return { applied: false, transaction: existing };
  }

  const [booking, customer] = await Promise.all([
    tx.booking.findUnique({
      where: { id: input.bookingId },
      select: { customerId: true },
    }),
    tx.customerProfile.findUnique({
      where: { id: input.customerId },
      select: { id: true, creditBalance: true },
    }),
  ]);
  if (!booking || booking.customerId !== input.customerId || !customer) {
    throw new CustomerCreditError('حساب العميل أو الحجز غير موجود.', 'CREDIT_OWNER_NOT_FOUND');
  }

  const balanceAfter = customer.creditBalance + input.amount;
  if (!Number.isSafeInteger(balanceAfter) || balanceAfter > POSTGRES_INTEGER_MAX) {
    throw new CustomerCreditError('رصيد العميل تجاوز الحد المسموح.', 'CREDIT_BALANCE_OVERFLOW');
  }

  const updated = await tx.customerProfile.updateMany({
    where: { id: customer.id, creditBalance: customer.creditBalance },
    data: { creditBalance: balanceAfter },
  });
  if (updated.count !== 1) {
    throw new CustomerCreditError(
      'تغير رصيد العميل بالتزامن؛ أعد المحاولة.',
      'CREDIT_BALANCE_CONFLICT',
    );
  }

  const transaction = await tx.customerCreditTransaction.create({
    data: {
      customerId: customer.id,
      bookingId: input.bookingId,
      amount: input.amount,
      balanceBefore: customer.creditBalance,
      balanceAfter,
      transactionType: input.transactionType,
      idempotencyKey,
      reason: input.reason,
      createdByUserId: input.actorUserId,
    },
  });

  return { applied: true, transaction };
}

export type CancellationSettlementType =
  | 'REFUND_FULL'
  | 'REFUND_PARTIAL'
  | 'NO_REFUND'
  | 'CREDIT'
  | 'KEEP_DEPOSIT'
  | 'VISIT_FEE';

export interface CancellationSettlementInput {
  resolutionType: CancellationSettlementType;
  amountPaid: number;
  depositAmount: number;
  creditAppliedAmount?: number;
  requestedRefundAmount?: number;
  visitFeeAmount?: number;
}

export interface CancellationSettlement {
  approvedRefundAmount: number;
  creditAmount: number;
  retainedAmount: number;
}

export type CancellationPaymentOutcome =
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'NON_REFUNDABLE';

function money(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

/**
 * Produces the complete, auditable settlement for a cancellation decision.
 * Refund, credit and retained amounts can never overlap or exceed amountPaid.
 */
export function calculateCancellationSettlement(
  input: CancellationSettlementInput,
): CancellationSettlement {
  const amountPaid = money(input.amountPaid, 'amountPaid');
  const depositAmount = money(input.depositAmount, 'depositAmount');
  const creditAppliedAmount = money(input.creditAppliedAmount ?? 0, 'creditAppliedAmount');
  if (creditAppliedAmount > amountPaid) {
    throw new Error('creditAppliedAmount cannot exceed amountPaid');
  }
  const cashPaid = amountPaid - creditAppliedAmount;

  let totalReturnedValue = 0;
  let approvedRefundAmount = 0;
  let creditAmount = 0;
  let retainedAmount = 0;

  switch (input.resolutionType) {
    case 'REFUND_FULL':
      totalReturnedValue = amountPaid;
      break;
    case 'REFUND_PARTIAL': {
      const requested = money(input.requestedRefundAmount ?? -1, 'requestedRefundAmount');
      if (requested <= 0 || requested > amountPaid) {
        throw new Error('requestedRefundAmount must be between 1 and amountPaid');
      }
      totalReturnedValue = requested;
      retainedAmount = amountPaid - requested;
      break;
    }
    case 'NO_REFUND':
      retainedAmount = amountPaid;
      break;
    case 'CREDIT':
      creditAmount = amountPaid;
      break;
    case 'KEEP_DEPOSIT':
      retainedAmount = Math.min(amountPaid, depositAmount);
      totalReturnedValue = amountPaid - retainedAmount;
      break;
    case 'VISIT_FEE': {
      const visitFee = money(input.visitFeeAmount ?? -1, 'visitFeeAmount');
      if (visitFee <= 0 || visitFee > amountPaid) {
        throw new Error('visitFeeAmount must be between 1 and amountPaid');
      }
      retainedAmount = visitFee;
      totalReturnedValue = amountPaid - visitFee;
      break;
    }
  }

  if (input.resolutionType !== 'CREDIT') {
    approvedRefundAmount = Math.min(totalReturnedValue, cashPaid);
    creditAmount = totalReturnedValue - approvedRefundAmount;
  }

  if (approvedRefundAmount + creditAmount + retainedAmount !== amountPaid) {
    throw new Error('Cancellation settlement does not balance');
  }

  return { approvedRefundAmount, creditAmount, retainedAmount };
}

/**
 * Derives the booking payment state from value actually returned, rather than
 * comparing cash refunds with amountPaid (which also contains applied credit).
 */
export function cancellationPaymentOutcome(input: {
  amountPaid: number;
  approvedRefundAmount: number;
  cashRefunded: number;
  creditReturned: number;
}): CancellationPaymentOutcome | null {
  const amountPaid = money(input.amountPaid, 'amountPaid');
  const approvedRefundAmount = money(input.approvedRefundAmount, 'approvedRefundAmount');
  const cashRefunded = money(input.cashRefunded, 'cashRefunded');
  const creditReturned = money(input.creditReturned, 'creditReturned');
  if (cashRefunded > approvedRefundAmount) {
    throw new Error('cashRefunded cannot exceed approvedRefundAmount');
  }
  if (cashRefunded + creditReturned > amountPaid) {
    throw new Error('returned value cannot exceed amountPaid');
  }
  if (amountPaid === 0) return null;
  if (cashRefunded === 0 && approvedRefundAmount > 0) return 'REFUND_PENDING';

  const returnedValue = cashRefunded + creditReturned;
  if (returnedValue >= amountPaid) return 'REFUNDED';
  if (returnedValue > 0) return 'PARTIALLY_REFUNDED';
  return 'NON_REFUNDABLE';
}

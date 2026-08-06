import { describe, expect, it } from 'vitest';
import {
  calculateCancellationSettlement,
  cancellationPaymentOutcome,
} from '@/lib/engine/cancellation-settlement';

describe('calculateCancellationSettlement', () => {
  it('keeps only the deposit and refunds the excess payment', () => {
    expect(calculateCancellationSettlement({
      resolutionType: 'KEEP_DEPOSIT', amountPaid: 1_000, depositAmount: 300,
    })).toEqual({ approvedRefundAmount: 700, creditAmount: 0, retainedAmount: 300 });
  });

  it('caps the retained deposit at the amount actually paid', () => {
    expect(calculateCancellationSettlement({
      resolutionType: 'KEEP_DEPOSIT', amountPaid: 200, depositAmount: 300,
    })).toEqual({ approvedRefundAmount: 0, creditAmount: 0, retainedAmount: 200 });
  });

  it('applies a visit fee and refunds only the remainder', () => {
    expect(calculateCancellationSettlement({
      resolutionType: 'VISIT_FEE', amountPaid: 1_000, depositAmount: 300, visitFeeAmount: 250,
    })).toEqual({ approvedRefundAmount: 750, creditAmount: 0, retainedAmount: 250 });
  });

  it('converts the whole paid amount to credit without double counting', () => {
    expect(calculateCancellationSettlement({
      resolutionType: 'CREDIT', amountPaid: 700, depositAmount: 300,
    })).toEqual({ approvedRefundAmount: 0, creditAmount: 700, retainedAmount: 0 });
  });

  it('never refunds internally applied credit as cash', () => {
    expect(calculateCancellationSettlement({
      resolutionType: 'REFUND_FULL', amountPaid: 700, depositAmount: 300, creditAppliedAmount: 200,
    })).toEqual({ approvedRefundAmount: 500, creditAmount: 200, retainedAmount: 0 });
  });

  it('rejects a visit fee greater than the paid amount', () => {
    expect(() => calculateCancellationSettlement({
      resolutionType: 'VISIT_FEE', amountPaid: 100, depositAmount: 50, visitFeeAmount: 101,
    })).toThrow(/visitFeeAmount/);
  });
});

describe('cancellationPaymentOutcome', () => {
  it('recognizes a full mixed cash and credit return', () => {
    expect(cancellationPaymentOutcome({
      amountPaid: 700,
      approvedRefundAmount: 500,
      cashRefunded: 500,
      creditReturned: 200,
    })).toBe('REFUNDED');
  });

  it('keeps a mixed settlement pending before its cash refund is approved', () => {
    expect(cancellationPaymentOutcome({
      amountPaid: 700,
      approvedRefundAmount: 500,
      cashRefunded: 0,
      creditReturned: 200,
    })).toBe('REFUND_PENDING');
  });

  it('marks returned credit as partial when part of the payment was retained', () => {
    expect(cancellationPaymentOutcome({
      amountPaid: 700,
      approvedRefundAmount: 0,
      cashRefunded: 0,
      creditReturned: 200,
    })).toBe('PARTIALLY_REFUNDED');
  });
});

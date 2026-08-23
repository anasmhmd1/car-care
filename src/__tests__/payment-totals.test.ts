import { describe, expect, it } from 'vitest';
import { BookingStatus } from '@prisma/client';
import {
  calculateBookingPaymentTotals,
  canRecordBookingBalance,
} from '@/lib/engine/payment-totals';

describe('calculateBookingPaymentTotals', () => {
  it('keeps applied customer credit when a transfer proof is verified', () => {
    expect(calculateBookingPaymentTotals({
      totalPrice: 1_000,
      creditAppliedAmount: 100,
      verifiedCashAmount: 200,
    })).toEqual({ amountPaid: 300, amountDue: 700 });
  });

  it('caps overpayment at the booking total', () => {
    expect(calculateBookingPaymentTotals({
      totalPrice: 1_000,
      creditAppliedAmount: 400,
      verifiedCashAmount: 800,
    })).toEqual({ amountPaid: 1_000, amountDue: 0 });
  });
});

describe('canRecordBookingBalance', () => {
  it('allows collection across all active booking stages', () => {
    expect(canRecordBookingBalance(BookingStatus.ACCEPTED)).toBe(true);
    expect(canRecordBookingBalance(BookingStatus.ASSIGNED)).toBe(true);
    expect(canRecordBookingBalance(BookingStatus.ARRIVED)).toBe(true);
    expect(canRecordBookingBalance(BookingStatus.SERVICE_COMPLETED)).toBe(true);
    expect(canRecordBookingBalance(BookingStatus.DELIVERED)).toBe(true);
    expect(canRecordBookingBalance(BookingStatus.AWAITING_PAYMENT_PROOF)).toBe(false);
    expect(canRecordBookingBalance(BookingStatus.CANCELLED)).toBe(false);
    expect(canRecordBookingBalance(BookingStatus.REJECTED)).toBe(false);
    expect(canRecordBookingBalance(BookingStatus.EXPIRED)).toBe(false);
  });
});

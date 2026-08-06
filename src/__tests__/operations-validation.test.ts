import { describe, expect, it } from 'vitest';
import {
  recordRefundSchema,
  requestRescheduleSchema,
  reviewCancellationSchema,
  reviewPaymentProofSchema,
} from '@/lib/validations/operations';

describe('operations input invariants', () => {
  it('requires a reason for every non-verified proof decision', () => {
    const base = {
      proofId: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '',
    };
    expect(reviewPaymentProofSchema.safeParse({ ...base, decision: 'VERIFY' }).success).toBe(true);
    expect(reviewPaymentProofSchema.safeParse({ ...base, decision: 'REUPLOAD' }).success).toBe(false);
    expect(reviewPaymentProofSchema.safeParse({ ...base, decision: 'DUPLICATE' }).success).toBe(false);
  });

  it('requires resolution and responsibility for an approved cancellation', () => {
    const result = reviewCancellationSchema.safeParse({
      cancellationId: '22222222-2222-4222-8222-222222222222',
      decision: 'APPROVE',
      resolutionNotes: 'تمت المراجعة',
    });
    expect(result.success).toBe(false);
  });

  it('requires a positive amount for partial refund decisions', () => {
    const result = reviewCancellationSchema.safeParse({
      cancellationId: '22222222-2222-4222-8222-222222222222',
      decision: 'APPROVE',
      resolutionType: 'REFUND_PARTIAL',
      resolutionNotes: 'رسوم تجهيز موثقة',
      responsibleParty: 'CUSTOMER',
      approvedRefundAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a reschedule request without an exact date', () => {
    const result = requestRescheduleSchema.safeParse({
      bookingId: '33333333-3333-4333-8333-333333333333',
      reason: 'تغيير الموعد',
    });
    expect(result.success).toBe(false);
  });

  it('requires a private booking file and idempotency key for refunds', () => {
    const result = recordRefundSchema.safeParse({
      bookingId: '33333333-3333-4333-8333-333333333333',
      amount: 100,
      refundMethod: 'InstaPay',
      refundTimestamp: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  cancellationNoticeDeadline,
  cancellationPolicyRevision,
  cancellationPolicySnapshot,
  DEFAULT_CANCELLATION_POLICY,
  evaluateCancellationPolicyRequest,
  readPolicyRequestTimestamp,
  isLateCancellationRequest,
  readCancellationPolicySnapshot,
} from '@/lib/policies/cancellation';

describe('cancellation policy snapshots', () => {
  it('uses the persisted update timestamp to identify the exact accepted revision', () => {
    expect(cancellationPolicyRevision({
      id: 'policy-1',
      version: '2',
      updatedAt: new Date('2026-08-01T12:30:00.000Z'),
    })).toBe('policy-1:2:2026-08-01T12:30:00.000Z');
  });

  it('copies the accepted catalog values instead of retaining a live policy reference', () => {
    const source = {
      id: 'policy-1',
      code: 'premium',
      nameAr: 'سياسة مميزة',
      version: '2',
      noticeHours: 12,
      allowsCancellation: true,
      allowsRescheduling: true,
      allowsLateRequests: false,
      policyTextAr: 'نص سياسة الإلغاء المعتمد للخدمة المميزة.',
    };

    const snapshot = cancellationPolicySnapshot(source);
    source.noticeHours = 24;
    source.version = '3';

    expect(snapshot.noticeHours).toBe(12);
    expect(snapshot.version).toBe('2');
    expect(snapshot.policyId).toBe('policy-1');
  });

  it('uses the safe historical fallback for an incomplete legacy snapshot', () => {
    const snapshot = readCancellationPolicySnapshot({ noticeHours: 2 });

    expect(snapshot).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(snapshot).not.toBe(DEFAULT_CANCELLATION_POLICY);
  });

  it('reads a complete persisted snapshot without consulting the current catalog', () => {
    const persisted = {
      policyId: 'policy-2',
      code: 'strict',
      nameAr: 'سياسة صارمة',
      version: '2026-09',
      noticeHours: 48,
      allowsCancellation: true,
      allowsRescheduling: false,
      allowsLateRequests: false,
      policyTextAr: 'يلزم تقديم طلب الإلغاء قبل الموعد بثمان وأربعين ساعة.',
    };

    expect(readCancellationPolicySnapshot(persisted)).toEqual(persisted);
  });

  it('rejects an invalid catalog revision timestamp', () => {
    expect(() => cancellationPolicyRevision({
      id: 'policy-1',
      version: '2',
      updatedAt: 'not-a-date',
    })).toThrow('Cancellation policy revision timestamp is invalid.');
  });
});

describe('cancellation notice window', () => {
  const startAt = new Date('2026-08-10T12:00:00.000Z');

  it('calculates the deadline from the booking start and snapshotted hours', () => {
    expect(cancellationNoticeDeadline(startAt, 6).toISOString()).toBe(
      '2026-08-10T06:00:00.000Z',
    );
  });

  it('treats the exact deadline as timely and only later requests as late', () => {
    expect(isLateCancellationRequest(
      startAt,
      new Date('2026-08-10T06:00:00.000Z'),
      6,
    )).toBe(false);
    expect(isLateCancellationRequest(
      startAt,
      new Date('2026-08-10T06:00:00.001Z'),
      6,
    )).toBe(true);
  });

  it('enforces cancellation and rescheduling capabilities independently', () => {
    const policy = {
      ...DEFAULT_CANCELLATION_POLICY,
      allowsCancellation: true,
      allowsRescheduling: false,
    };
    const requestedAt = new Date('2026-08-10T05:00:00.000Z');

    expect(evaluateCancellationPolicyRequest(
      policy,
      'CANCELLATION',
      startAt,
      requestedAt,
    )).toEqual({ allowed: true, lateRequest: false });
    expect(evaluateCancellationPolicyRequest(
      policy,
      'RESCHEDULING',
      startAt,
      requestedAt,
    )).toEqual({
      allowed: false,
      code: 'RESCHEDULING_DISABLED',
      lateRequest: false,
    });
  });

  it('uses the original request timestamp for late-window enforcement', () => {
    const policy = {
      ...DEFAULT_CANCELLATION_POLICY,
      noticeHours: 6,
      allowsLateRequests: false,
    };

    expect(evaluateCancellationPolicyRequest(
      policy,
      'RESCHEDULING',
      startAt,
      new Date('2026-08-10T06:00:00.000Z'),
    )).toEqual({ allowed: true, lateRequest: false });
    expect(evaluateCancellationPolicyRequest(
      policy,
      'RESCHEDULING',
      startAt,
      new Date('2026-08-10T06:00:00.001Z'),
    )).toEqual({
      allowed: false,
      code: 'LATE_REQUEST_DISABLED',
      lateRequest: true,
    });
  });

  it('uses the persisted policy request instant instead of a later row timestamp', () => {
    const requestedAt = new Date('2026-08-10T06:00:00.000Z');
    const fallback = new Date('2026-08-10T06:00:00.010Z');

    expect(readPolicyRequestTimestamp({
      policyRequestedAt: requestedAt.toISOString(),
    }, fallback)).toEqual(requestedAt);
    expect(readPolicyRequestTimestamp({ policyRequestedAt: 'invalid' }, fallback)).toEqual(fallback);
  });
});

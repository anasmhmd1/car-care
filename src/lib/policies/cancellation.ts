export interface CancellationPolicySnapshot {
  [key: string]: string | number | boolean | null;
  policyId: string | null;
  code: string;
  nameAr: string;
  version: string;
  noticeHours: number;
  allowsCancellation: boolean;
  allowsRescheduling: boolean;
  allowsLateRequests: boolean;
  policyTextAr: string;
}

export interface CancellationPolicySource {
  id: string;
  code: string;
  nameAr: string;
  version: string;
  noticeHours: number;
  allowsCancellation: boolean;
  allowsRescheduling: boolean;
  allowsLateRequests: boolean;
  policyTextAr: string;
}

export interface CancellationPolicyRevisionSource {
  id: string;
  version: string;
  updatedAt: Date | string;
}

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicySnapshot = Object.freeze({
  policyId: null,
  code: 'standard-cancellation',
  nameAr: 'سياسة الإلغاء القياسية',
  version: '2026-08-01',
  noticeHours: 6,
  allowsCancellation: true,
  allowsRescheduling: true,
  allowsLateRequests: true,
  policyTextAr:
    'يمكن للعميل تقديم طلب الإلغاء حتى قبل بدء موعد الخدمة. يُعد الطلب مبكرًا إذا قُدم قبل الموعد بـ 6 ساعات على الأقل. الطلبات داخل هذه المهلة تُوسم كطلبات متأخرة وتخضع لمراجعة التشغيل والتسوية المالية، ولا يعني إرسال الطلب استردادًا تلقائيًا. بعد بدء الخدمة يجب التواصل مع الدعم.',
});

export const DEFAULT_CANCELLATION_POLICY_REVISION =
  `fallback:${DEFAULT_CANCELLATION_POLICY.version}`;

/**
 * Identifies the exact catalog revision shown to the customer. Prisma updates
 * `updatedAt` on every catalog edit, including edits that retain the same
 * human-facing version label.
 */
export function cancellationPolicyRevision(
  policy: CancellationPolicyRevisionSource,
): string {
  const updatedAt = policy.updatedAt instanceof Date
    ? policy.updatedAt
    : new Date(policy.updatedAt);
  if (!Number.isFinite(updatedAt.getTime())) {
    throw new Error('Cancellation policy revision timestamp is invalid.');
  }
  return `${policy.id}:${policy.version}:${updatedAt.toISOString()}`;
}

export function cancellationPolicySnapshot(
  policy: CancellationPolicySource,
): CancellationPolicySnapshot {
  return {
    policyId: policy.id,
    code: policy.code,
    nameAr: policy.nameAr,
    version: policy.version,
    noticeHours: policy.noticeHours,
    allowsCancellation: policy.allowsCancellation,
    allowsRescheduling: policy.allowsRescheduling,
    allowsLateRequests: policy.allowsLateRequests,
    policyTextAr: policy.policyTextAr,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readCancellationPolicySnapshot(
  value: unknown,
): CancellationPolicySnapshot {
  if (!isRecord(value)) return { ...DEFAULT_CANCELLATION_POLICY };

  const noticeHours = value.noticeHours;
  const validNoticeHours =
    typeof noticeHours === 'number' &&
    Number.isInteger(noticeHours) &&
    noticeHours >= 0 &&
    noticeHours <= 720;

  if (
    typeof value.code !== 'string' || !value.code.trim() ||
    typeof value.nameAr !== 'string' || !value.nameAr.trim() ||
    typeof value.version !== 'string' || !value.version.trim() ||
    !validNoticeHours ||
    typeof value.allowsCancellation !== 'boolean' ||
    typeof value.allowsRescheduling !== 'boolean' ||
    typeof value.allowsLateRequests !== 'boolean' ||
    typeof value.policyTextAr !== 'string' || !value.policyTextAr.trim()
  ) {
    return { ...DEFAULT_CANCELLATION_POLICY };
  }

  return {
    policyId: typeof value.policyId === 'string' && value.policyId.trim()
      ? value.policyId
      : null,
    code: value.code,
    nameAr: value.nameAr,
    version: value.version,
    noticeHours,
    allowsCancellation: value.allowsCancellation,
    allowsRescheduling: value.allowsRescheduling,
    allowsLateRequests: value.allowsLateRequests,
    policyTextAr: value.policyTextAr,
  };
}

export function cancellationNoticeDeadline(startAt: Date, noticeHours: number) {
  return new Date(startAt.getTime() - noticeHours * 3_600_000);
}

export function isLateCancellationRequest(
  startAt: Date,
  requestedAt: Date,
  noticeHours: number,
) {
  return requestedAt > cancellationNoticeDeadline(startAt, noticeHours);
}

export type CancellationPolicyCapability = 'CANCELLATION' | 'RESCHEDULING';

export type CancellationPolicyEligibility =
  | { allowed: true; lateRequest: boolean }
  | {
      allowed: false;
      lateRequest: boolean;
      code:
        | 'SERVICE_ALREADY_STARTED'
        | 'CANCELLATION_DISABLED'
        | 'RESCHEDULING_DISABLED'
        | 'LATE_REQUEST_DISABLED';
    };

/**
 * Applies the immutable booking snapshot to every entry point that can create
 * or approve a cancellation/reschedule request. The request timestamp is
 * explicit so an on-time request does not become invalid while awaiting review.
 */
export function evaluateCancellationPolicyRequest(
  policy: CancellationPolicySnapshot,
  capability: CancellationPolicyCapability,
  startAt: Date,
  requestedAt: Date,
): CancellationPolicyEligibility {
  const lateRequest = isLateCancellationRequest(
    startAt,
    requestedAt,
    policy.noticeHours,
  );
  if (requestedAt >= startAt) {
    return { allowed: false, code: 'SERVICE_ALREADY_STARTED', lateRequest };
  }
  if (capability === 'CANCELLATION' && !policy.allowsCancellation) {
    return { allowed: false, code: 'CANCELLATION_DISABLED', lateRequest };
  }
  if (capability === 'RESCHEDULING' && !policy.allowsRescheduling) {
    return { allowed: false, code: 'RESCHEDULING_DISABLED', lateRequest };
  }
  if (lateRequest && !policy.allowsLateRequests) {
    return { allowed: false, code: 'LATE_REQUEST_DISABLED', lateRequest };
  }
  return { allowed: true, lateRequest };
}

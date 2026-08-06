export interface CoverageCandidate {
  active: boolean;
  branchId: string;
}

export interface TravelPolicy {
  fromZoneId: string;
  toZoneId: string;
  durationMinutes: number;
}

export interface TravelResolutionInput {
  fromZoneId: string;
  toZoneId: string;
  travelPolicies: readonly TravelPolicy[];
  areaOverrideMinutes?: number | null;
  branchDefaultMinutes: number;
  sameZoneDefaultMinutes?: number;
}

export interface RefundTotals {
  totalRefunded: number;
  remainingPaidAmount: number;
  remainingApprovedAmount: number;
  fullyRefunded: boolean;
  approvedRefundComplete: boolean;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer.');
  }
  return value;
}

export function isCoverageAreaEligible(
  candidate: CoverageCandidate,
  requestedBranchId: string,
): boolean {
  return candidate.active && candidate.branchId === requestedBranchId;
}

export function resolveTravelMinutes(input: TravelResolutionInput): number {
  const explicitPolicy = input.travelPolicies.find(
    (policy) =>
      policy.fromZoneId === input.fromZoneId &&
      policy.toZoneId === input.toZoneId,
  );
  if (explicitPolicy) {
    return requireNonNegativeInteger(explicitPolicy.durationMinutes, 'travel policy duration');
  }

  if (input.fromZoneId === input.toZoneId) {
    return requireNonNegativeInteger(input.sameZoneDefaultMinutes ?? 0, 'same-zone default');
  }

  if (input.areaOverrideMinutes !== null && input.areaOverrideMinutes !== undefined) {
    return requireNonNegativeInteger(input.areaOverrideMinutes, 'area travel override');
  }
  return requireNonNegativeInteger(input.branchDefaultMinutes, 'branch travel default');
}

export function calculateRefundTotals(input: {
  amountPaid: number;
  approvedRefundAmount: number;
  refundedAmounts: readonly number[];
}): RefundTotals {
  const amountPaid = requireNonNegativeInteger(input.amountPaid, 'amountPaid');
  const approvedRefundAmount = requireNonNegativeInteger(
    input.approvedRefundAmount,
    'approvedRefundAmount',
  );
  const totalRefunded = input.refundedAmounts.reduce(
    (total, amount, index) =>
      total + requireNonNegativeInteger(amount, 'refundedAmounts[' + index + ']'),
    0,
  );

  return {
    totalRefunded,
    remainingPaidAmount: Math.max(0, amountPaid - totalRefunded),
    remainingApprovedAmount: Math.max(0, approvedRefundAmount - totalRefunded),
    fullyRefunded: totalRefunded >= amountPaid,
    approvedRefundComplete: totalRefunded >= approvedRefundAmount,
  };
}

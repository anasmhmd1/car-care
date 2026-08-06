import { describe, expect, it } from 'vitest';
import { scoreTeamForAssignment } from '../lib/engine/assignment';
import {
  calculateRefundTotals,
  isCoverageAreaEligible,
  resolveTravelMinutes,
} from '../lib/engine/operations-math';

describe('pure operations math', () => {
  it('accepts only an active coverage area belonging to the requested branch', () => {
    expect(isCoverageAreaEligible({ active: true, branchId: 'zayed' }, 'zayed')).toBe(true);
    expect(isCoverageAreaEligible({ active: false, branchId: 'zayed' }, 'zayed')).toBe(false);
    expect(isCoverageAreaEligible({ active: true, branchId: 'other' }, 'zayed')).toBe(false);
  });

  it('uses directional travel policies before safe fallbacks', () => {
    const travelPolicies = [
      { fromZoneId: 'a', toZoneId: 'a', durationMinutes: 15 },
      { fromZoneId: 'a', toZoneId: 'b', durationMinutes: 30 },
      { fromZoneId: 'b', toZoneId: 'a', durationMinutes: 25 },
    ];
    expect(resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'a',
      travelPolicies,
      branchDefaultMinutes: 40,
    })).toBe(15);
    expect(resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'b',
      travelPolicies,
      branchDefaultMinutes: 40,
    })).toBe(30);
    expect(resolveTravelMinutes({
      fromZoneId: 'b',
      toZoneId: 'a',
      travelPolicies,
      branchDefaultMinutes: 40,
    })).toBe(25);
  });

  it('defaults an unconfigured same-zone trip to zero and cross-zone travel to override/default', () => {
    expect(resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'a',
      travelPolicies: [],
      branchDefaultMinutes: 30,
    })).toBe(0);
    expect(resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'b',
      travelPolicies: [],
      areaOverrideMinutes: 20,
      branchDefaultMinutes: 30,
    })).toBe(20);
    expect(resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'b',
      travelPolicies: [],
      branchDefaultMinutes: 30,
    })).toBe(30);
  });

  it('scores assignment capacity without exceeding the valid range', () => {
    expect(scoreTeamForAssignment(0, 5)).toBe(100);
    expect(scoreTeamForAssignment(2, 5)).toBe(60);
    expect(scoreTeamForAssignment(5, 5)).toBe(0);
    expect(scoreTeamForAssignment(1, 0)).toBe(0);
  });

  it('calculates cumulative and remaining refund totals', () => {
    expect(calculateRefundTotals({
      amountPaid: 1000,
      approvedRefundAmount: 700,
      refundedAmounts: [250, 200],
    })).toEqual({
      totalRefunded: 450,
      remainingPaidAmount: 550,
      remainingApprovedAmount: 250,
      fullyRefunded: false,
      approvedRefundComplete: false,
    });
    expect(calculateRefundTotals({
      amountPaid: 700,
      approvedRefundAmount: 700,
      refundedAmounts: [300, 400],
    })).toMatchObject({
      totalRefunded: 700,
      remainingPaidAmount: 0,
      remainingApprovedAmount: 0,
      fullyRefunded: true,
      approvedRefundComplete: true,
    });
  });

  it('rejects negative refund or travel inputs', () => {
    expect(() => calculateRefundTotals({
      amountPaid: 100,
      approvedRefundAmount: 100,
      refundedAmounts: [-1],
    })).toThrow(/non-negative integer/);
    expect(() => resolveTravelMinutes({
      fromZoneId: 'a',
      toZoneId: 'b',
      travelPolicies: [],
      branchDefaultMinutes: -1,
    })).toThrow(/non-negative integer/);
  });
});

import { describe, expect, it } from 'vitest';
import { calculateReservedDurationMinutes } from '../lib/engine/availability';
import { calculateBookingQuote } from '../lib/engine/pricing';

describe('Branch Service Slot & Duration Unification', () => {
  it('calculates reserved duration correctly for 30-minute branch slot unit', () => {
    // 1 slot at 30 min unit = 30 min
    expect(calculateReservedDurationMinutes(30, 1, 30)).toBe(30);
    // 2 slots at 30 min unit = 60 min
    expect(calculateReservedDurationMinutes(60, 2, 30)).toBe(60);
    // 3 slots at 30 min unit = 90 min
    expect(calculateReservedDurationMinutes(90, 3, 30)).toBe(90);
    // 4 slots at 30 min unit = 120 min
    expect(calculateReservedDurationMinutes(120, 4, 30)).toBe(120);
  });

  it('calculates reserved duration correctly for 60-minute branch slot unit', () => {
    // 1 slot at 60 min unit = 60 min
    expect(calculateReservedDurationMinutes(60, 1, 60)).toBe(60);
    // 2 slots at 60 min unit = 120 min
    expect(calculateReservedDurationMinutes(120, 2, 60)).toBe(120);
  });

  it('correctly respects branch duration override in quote calculation', () => {
    const branchSlotUnit = 30;
    const branchDurationOverrideMinutes = 30; // overridden to 1 slot (30 min)
    const baseSlotCount = Math.max(1, Math.round(branchDurationOverrideMinutes / branchSlotUnit));

    const quote = calculateBookingQuote({
      base: {
        price: 500,
        durationMinutes: branchDurationOverrideMinutes,
        slotCount: baseSlotCount,
      },
      addons: [],
      depositRequired: true,
      fullPrepayment: false,
      depositType: 'FIXED',
      depositValue: 100,
    });

    expect(quote.slotCount).toBe(1);
    expect(quote.totalDurationMinutes).toBe(30);

    const reserved = calculateReservedDurationMinutes(
      quote.totalDurationMinutes,
      quote.slotCount,
      branchSlotUnit,
    );
    expect(reserved).toBe(30);
  });

  it('correctly reserves multiple slots when branch duration override is longer', () => {
    const branchSlotUnit = 30;
    const branchDurationOverrideMinutes = 120; // overridden to 4 slots (120 min)
    const baseSlotCount = Math.max(1, Math.round(branchDurationOverrideMinutes / branchSlotUnit));

    const quote = calculateBookingQuote({
      base: {
        price: 500,
        durationMinutes: branchDurationOverrideMinutes,
        slotCount: baseSlotCount,
      },
      addons: [],
      depositRequired: true,
      fullPrepayment: false,
      depositType: 'FIXED',
      depositValue: 100,
    });

    expect(quote.slotCount).toBe(4);
    expect(quote.totalDurationMinutes).toBe(120);

    const reserved = calculateReservedDurationMinutes(
      quote.totalDurationMinutes,
      quote.slotCount,
      branchSlotUnit,
    );
    expect(reserved).toBe(120);
  });
});

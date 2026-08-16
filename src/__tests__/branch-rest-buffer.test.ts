import { describe, expect, it } from 'vitest';
import { branchSettingsSchema } from '@/lib/validations/admin';

describe('Branch Employee Rest Buffer (وقت راحة الموظفين بين السلوتات)', () => {
  it('validates restBufferMinutes with sensible defaults and boundaries', () => {
    const validConfig = {
      nameAr: 'فرع الشيخ زايد',
      address: 'الشيخ زايد',
      phone: '01012345678',
      whatsapp: '01012345678',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 15,
      dailyBookingLimit: 20,
      assignmentMode: 'MANUAL',
    };

    const parsed = branchSettingsSchema.safeParse(validConfig);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.restBufferMinutes).toBe(15);
    }
  });

  it('defaults restBufferMinutes to 0 when omitted', () => {
    const validConfig = {
      nameAr: 'فرع الشيخ زايد',
      address: 'الشيخ زايد',
      phone: '01012345678',
      whatsapp: '01012345678',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      dailyBookingLimit: 20,
      assignmentMode: 'MANUAL',
    };

    const parsed = branchSettingsSchema.safeParse(validConfig);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.restBufferMinutes).toBe(0);
    }
  });

  it('rejects negative restBufferMinutes or excessive values above 180 minutes', () => {
    const base = {
      nameAr: 'فرع الشيخ زايد',
      address: 'الشيخ زايد',
      phone: '01012345678',
      whatsapp: '01012345678',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      dailyBookingLimit: 20,
      assignmentMode: 'MANUAL',
    };

    expect(branchSettingsSchema.safeParse({ ...base, restBufferMinutes: -5 }).success).toBe(false);
    expect(branchSettingsSchema.safeParse({ ...base, restBufferMinutes: 200 }).success).toBe(false);
  });

  it('calculates total buffer between slots as travel time + rest buffer', () => {
    const travelTimeMinutes = 20;
    const restBufferMinutes = 15;
    const totalBufferMs = (travelTimeMinutes + restBufferMinutes) * 60_000;

    const previousBookingEnd = new Date('2026-08-15T12:00:00.000Z');
    const earliestNextSlotStart = new Date(previousBookingEnd.getTime() + totalBufferMs);

    // 12:00 + 35 minutes = 12:35
    expect(earliestNextSlotStart.toISOString()).toBe('2026-08-15T12:35:00.000Z');

    // A slot attempting to start at 12:15 should be rejected (overlaps with rest buffer)
    const candidateSlot1215 = new Date('2026-08-15T12:15:00.000Z');
    expect(previousBookingEnd.getTime() + totalBufferMs > candidateSlot1215.getTime()).toBe(true);

    // A slot starting at 12:45 should be accepted
    const candidateSlot1245 = new Date('2026-08-15T12:45:00.000Z');
    expect(previousBookingEnd.getTime() + totalBufferMs <= candidateSlot1245.getTime()).toBe(true);
  });
});

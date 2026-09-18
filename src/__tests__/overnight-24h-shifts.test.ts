import { describe, expect, it } from 'vitest';
import { intervalsOverlap, localDateTimeToUtc, formatTimeInZone } from '@/lib/engine/time';

describe('Overnight & 24h Continuous Operation Shifts (دعم الورديات الليلية والعمل المتواصل 24 ساعة)', () => {
  const TIMEZONE = 'Africa/Cairo';

  const parseMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const formatMinutesToDisplay = (totalMin: number, showDayOffset = false) => {
    const normalized = totalMin % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    const period = h >= 12 ? 'م' : 'ص';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const offsetBadge = showDayOffset && totalMin >= 1440 ? ' (+1)' : '';
    return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}${offsetBadge}`;
  };

  const getEffectiveClosingMinutes = (openTime: string, closeTime: string) => {
    const openMin = parseMinutes(openTime);
    let closeMin = parseMinutes(closeTime);
    if (closeMin <= openMin) {
      closeMin += 1440;
    }
    return { openMin, closeMin, durationMinutes: closeMin - openMin };
  };

  it('calculates 24-hour non-stop shift correctly (00:00 to 00:00 = 1440 minutes)', () => {
    const { openMin, closeMin, durationMinutes } = getEffectiveClosingMinutes('00:00', '00:00');
    expect(openMin).toBe(0);
    expect(closeMin).toBe(1440);
    expect(durationMinutes).toBe(1440);
  });

  it('calculates overnight shift correctly (09:00 AM to 01:00 AM next day = 16 hours = 960 minutes)', () => {
    const { openMin, closeMin, durationMinutes } = getEffectiveClosingMinutes('09:00', '01:00');
    expect(openMin).toBe(540);
    expect(closeMin).toBe(1500); // 60 + 1440
    expect(durationMinutes).toBe(960);
  });

  it('calculates evening-to-morning shift correctly (20:00 to 04:00 next day = 8 hours = 480 minutes)', () => {
    const { openMin, closeMin, durationMinutes } = getEffectiveClosingMinutes('20:00', '04:00');
    expect(openMin).toBe(1200);
    expect(closeMin).toBe(1680); // 240 + 1440
    expect(durationMinutes).toBe(480);
  });

  it('formats slot labels across midnight with (+1) day offset marker', () => {
    // 09:00 AM
    expect(formatMinutesToDisplay(540, true)).toBe('09:00 ص');
    // 11:00 PM
    expect(formatMinutesToDisplay(1380, true)).toBe('11:00 م');
    // 01:00 AM next day (1500 min)
    expect(formatMinutesToDisplay(1500, true)).toBe('01:00 ص (+1)');
    // Midnight next day (1440 min)
    expect(formatMinutesToDisplay(1440, true)).toBe('12:00 ص (+1)');
  });

  it('generates partitioned candidate slots across midnight for an overnight shift', () => {
    const dateStr = '2026-09-19';
    const openTime = '20:00';
    const closeTime = '04:00'; // Overnight
    const slotUnitMs = 120 * 60_000; // 2h

    const openAt = localDateTimeToUtc(dateStr, openTime, TIMEZONE);
    let closeAt = localDateTimeToUtc(dateStr, closeTime, TIMEZONE);
    if (closeAt.getTime() <= openAt.getTime()) {
      closeAt = new Date(closeAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const candidateSlots: Date[] = [];
    for (let ms = openAt.getTime(); ms <= closeAt.getTime(); ms += slotUnitMs) {
      if (ms + slotUnitMs <= closeAt.getTime()) {
        candidateSlots.push(new Date(ms));
      }
    }

    // 20:00 -> 22:00, 22:00 -> 00:00, 00:00 -> 02:00, 02:00 -> 04:00
    expect(candidateSlots.length).toBe(4);
    expect(formatTimeInZone(candidateSlots[0], TIMEZONE)).toBe('20:00');
    expect(candidateSlots[0].getTime()).toBe(openAt.getTime());
    expect(candidateSlots[3].getTime()).toBe(openAt.getTime() + 3 * slotUnitMs);
  });

  it('generates 24 slots for a 24-hour continuous operation schedule', () => {
    const dateStr = '2026-09-20';
    const openTime = '00:00';
    const closeTime = '00:00'; // 24 hours non-stop
    const slotUnitMs = 60 * 60_000; // 1 hour

    const openAt = localDateTimeToUtc(dateStr, openTime, TIMEZONE);
    let closeAt = localDateTimeToUtc(dateStr, closeTime, TIMEZONE);
    if (closeAt.getTime() <= openAt.getTime()) {
      closeAt = new Date(closeAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const candidateSlots: Date[] = [];
    for (let ms = openAt.getTime(); ms <= closeAt.getTime(); ms += slotUnitMs) {
      if (ms + slotUnitMs <= closeAt.getTime()) {
        candidateSlots.push(new Date(ms));
      }
    }

    expect(candidateSlots.length).toBe(24);
  });

  it('correctly filters out slots overlapping with break times past midnight', () => {
    const dateStr = '2026-09-19';
    const openTime = '22:00';
    const closeTime = '06:00'; // Overnight shift
    const slotUnitMs = 60 * 60_000;

    const openAt = localDateTimeToUtc(dateStr, openTime, TIMEZONE);
    let closeAt = localDateTimeToUtc(dateStr, closeTime, TIMEZONE);
    if (closeAt.getTime() <= openAt.getTime()) {
      closeAt = new Date(closeAt.getTime() + 24 * 60 * 60 * 1000);
    }

    // Break is at 02:00 to 03:00 (past midnight)
    let breakStart = localDateTimeToUtc(dateStr, '02:00', TIMEZONE);
    let breakEnd = localDateTimeToUtc(dateStr, '03:00', TIMEZONE);
    if (breakStart.getTime() < openAt.getTime()) {
      breakStart = new Date(breakStart.getTime() + 24 * 60 * 60 * 1000);
    }
    if (breakEnd.getTime() < openAt.getTime()) {
      breakEnd = new Date(breakEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const availableSlots: Date[] = [];
    for (let ms = openAt.getTime(); ms <= closeAt.getTime(); ms += slotUnitMs) {
      const slotStart = new Date(ms);
      const slotEnd = new Date(ms + slotUnitMs);
      if (slotEnd.getTime() > closeAt.getTime()) continue;

      if (intervalsOverlap(slotStart, slotEnd, breakStart, breakEnd)) {
        continue;
      }
      availableSlots.push(slotStart);
    }

    // Shift is 22:00 to 06:00 (8 hours). With 1 hour break, 7 slots should be available.
    expect(availableSlots.length).toBe(7);

    // Slot from 02:00 to 03:00 must NOT be in availableSlots
    const hasBreakSlot = availableSlots.some(
      (s) => s.getTime() === breakStart.getTime()
    );
    expect(hasBreakSlot).toBe(false);
  });
});

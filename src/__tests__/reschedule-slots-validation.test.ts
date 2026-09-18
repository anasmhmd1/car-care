import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, UserRole, VehicleSize } from '@prisma/client';
import { intervalsOverlap, localDateTimeToUtc } from '@/lib/engine/time';
import { rescheduleBookingByOperationsSchema } from '@/lib/validations/operations';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  transaction: vi.fn(),
  evaluateRequestedInterval: vi.fn(),
  revalidatePath: vi.fn(),
  bookingFindUnique: vi.fn(),
  canAccessBranch: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth/session', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('@/lib/auth/authorization', () => ({
  canAccessBranch: mocks.canAccessBranch,
}));

vi.mock('@/lib/engine/availability', () => ({
  evaluateRequestedInterval: mocks.evaluateRequestedInterval,
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    booking: {
      findUnique: mocks.bookingFindUnique,
    },
  },
}));

import { rescheduleBookingByOperationsAction } from '@/app/actions/operations';

const BRANCH_ID = 'b1111111-1111-4111-8111-111111111111';
const BOOKING_ID = 'c2222222-2222-4222-8222-222222222222';
const TIMEZONE = 'Africa/Cairo';

describe('Reschedule Slots & Break Time Conflict Validation (نظام الفترات وعدم التعارض مع الاستراحة)', () => {
  describe('Time and Interval Mathematics (التحقق الرياضي من الفترات والاستراحة)', () => {
    const targetDate = '2026-08-20';

    it('detects overlap between booking intervals and branch break times correctly', () => {
      // Break: 13:00 -> 14:00 (Cairo)
      const breakStart = localDateTimeToUtc(targetDate, '13:00', TIMEZONE);
      const breakEnd = localDateTimeToUtc(targetDate, '14:00', TIMEZONE);

      // Case 1: Booking from 12:30 to 13:30 (overlaps start of break)
      const b1Start = localDateTimeToUtc(targetDate, '12:30', TIMEZONE);
      const b1End = localDateTimeToUtc(targetDate, '13:30', TIMEZONE);
      expect(intervalsOverlap(b1Start, b1End, breakStart, breakEnd)).toBe(true);

      // Case 2: Booking inside break 13:15 to 13:45
      const b2Start = localDateTimeToUtc(targetDate, '13:15', TIMEZONE);
      const b2End = localDateTimeToUtc(targetDate, '13:45', TIMEZONE);
      expect(intervalsOverlap(b2Start, b2End, breakStart, breakEnd)).toBe(true);

      // Case 3: Booking ending exactly at break start 12:00 to 13:00 (half-open interval -> valid, no conflict)
      const b3Start = localDateTimeToUtc(targetDate, '12:00', TIMEZONE);
      const b3End = localDateTimeToUtc(targetDate, '13:00', TIMEZONE);
      expect(intervalsOverlap(b3Start, b3End, breakStart, breakEnd)).toBe(false);

      // Case 4: Booking starting exactly at break end 14:00 to 15:00 (half-open interval -> valid, no conflict)
      const b4Start = localDateTimeToUtc(targetDate, '14:00', TIMEZONE);
      const b4End = localDateTimeToUtc(targetDate, '15:00', TIMEZONE);
      expect(intervalsOverlap(b4Start, b4End, breakStart, breakEnd)).toBe(false);
    });

    it('enforces alignment to branch slotUnitMinutes from opening time', () => {
      const openTime = '09:00';
      const slotUnitMinutes = 30;
      const [openH, openM] = openTime.split(':').map(Number);
      const openMinute = openH * 60 + openM; // 540

      const isSlotAligned = (timeStr: string): boolean => {
        const [h, m] = timeStr.split(':').map(Number);
        const targetMinute = h * 60 + m;
        const offset = targetMinute - openMinute;
        return offset >= 0 && offset % slotUnitMinutes === 0;
      };

      // Valid slot times (multiples of 30 from 09:00)
      expect(isSlotAligned('09:00')).toBe(true);
      expect(isSlotAligned('09:30')).toBe(true);
      expect(isSlotAligned('10:00')).toBe(true);
      expect(isSlotAligned('14:30')).toBe(true);
      expect(isSlotAligned('16:30')).toBe(true);

      // Invalid unaligned slot times (like free manual entry 04:45 / 16:45 or 09:15)
      expect(isSlotAligned('09:15')).toBe(false);
      expect(isSlotAligned('09:45')).toBe(false);
      expect(isSlotAligned('14:45')).toBe(false);
      expect(isSlotAligned('16:45')).toBe(false);
      expect(isSlotAligned('08:30')).toBe(false); // Before opening
    });

    it('generates predefined slots that strictly filter out or mark break times', () => {
      const openMinute = 9 * 60; // 09:00
      const closeMinute = 13 * 60; // 13:00
      const slotUnitMinutes = 60;
      const durationMinutes = 60;
      const breakStart = localDateTimeToUtc(targetDate, '11:00', TIMEZONE);
      const breakEnd = localDateTimeToUtc(targetDate, '12:00', TIMEZONE);

      const slots: Array<{ time: string; available: boolean; reason?: string }> = [];

      for (let minute = openMinute; minute < closeMinute; minute += slotUnitMinutes) {
        const h = Math.floor(minute / 60);
        const m = minute % 60;
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const slotStart = localDateTimeToUtc(targetDate, timeStr, TIMEZONE);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

        if (intervalsOverlap(slotStart, slotEnd, breakStart, breakEnd)) {
          slots.push({ time: timeStr, available: false, reason: 'فترة استراحة' });
        } else {
          slots.push({ time: timeStr, available: true });
        }
      }

      expect(slots).toEqual([
        { time: '09:00', available: true },
        { time: '10:00', available: true },
        { time: '11:00', available: false, reason: 'فترة استراحة' },
        { time: '12:00', available: true },
      ]);
    });
  });

  describe('Operations Reschedule Schema Validation', () => {
    it('accepts well-formed reschedule parameters', () => {
      const parsed = rescheduleBookingByOperationsSchema.safeParse({
        bookingId: BOOKING_ID,
        targetDate: '2026-09-15',
        targetTime: '11:30',
        reason: 'تعديل الموعد حسب رغبة العميل والفترة المتاحة',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid time formats and empty reason', () => {
      expect(
        rescheduleBookingByOperationsSchema.safeParse({
          bookingId: BOOKING_ID,
          targetDate: '2026-09-15',
          targetTime: 'invalid-time',
          reason: 'سبب صالح',
        }).success
      ).toBe(false);

      expect(
        rescheduleBookingByOperationsSchema.safeParse({
          bookingId: BOOKING_ID,
          targetDate: '2026-09-15',
          targetTime: '10:00',
          reason: '  ',
        }).success
      ).toBe(false);
    });
  });

  describe('rescheduleBookingByOperationsAction Server Enforcement', () => {
    const defaultManager = {
      id: 'm1111111-1111-4111-8111-111111111111',
      role: UserRole.OPERATIONS_MANAGER,
      branchId: BRANCH_ID,
    };

    // Day of week for '2026-09-10' is Thursday (day 4)
    const mockBranchWorkingHours = [
      {
        dayOfWeek: 4,
        isClosed: false,
        openTime: '09:00',
        closeTime: '21:00',
        breakStartTime: '13:00',
        breakEndTime: '14:00',
      },
    ];

    const mockBooking = {
      id: BOOKING_ID,
      bookingNumber: 'BQ-2026-001',
      branchId: BRANCH_ID,
      bookingStatus: BookingStatus.ACCEPTED,
      terminalReopenSourceStatus: null,
      serviceId: 's1111111-1111-4111-8111-111111111111',
      coverageAreaId: 'a1111111-1111-4111-8111-111111111111',
      assignedTeamId: null,
      totalDurationMinutes: 60,
      startAt: new Date('2026-09-09T10:00:00.000Z'),
      endAt: new Date('2026-09-09T11:00:00.000Z'),
      branch: {
        id: BRANCH_ID,
        nameAr: 'فرع الرياض',
        timezone: TIMEZONE,
        slotUnitMinutes: 30,
        workingHours: mockBranchWorkingHours,
      },
      service: {
        variants: [{ vehicleSize: VehicleSize.SEDAN, durationMinutes: 60 }],
      },
      vehicle: { vehicleSize: VehicleSize.SEDAN },
      addons: [],
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-10T08:00:00.000Z'));
      vi.clearAllMocks();
      mocks.requireRole.mockResolvedValue(defaultManager);
      mocks.canAccessBranch.mockResolvedValue(true);
      mocks.bookingFindUnique.mockResolvedValue(mockBooking);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects unaligned slot time (e.g. 14:45 when slotUnitMinutes is 30) with clear Arabic error', async () => {
      const formData = new FormData();
      formData.set('bookingId', BOOKING_ID);
      formData.set('targetDate', '2026-09-10');
      formData.set('targetTime', '14:45'); // Not aligned with 30-min stride from 09:00
      formData.set('reason', 'تعديل موعد بتوقيت غير متوافق');

      const result = await rescheduleBookingByOperationsAction(formData);

      expect(result.error).toBe(
        'الوقت المختار (14:45) غير متوافق مع تقسيم فترات المواعيد المعتمدة (كل 30 دقيقة).'
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects target time falling inside branch break time (13:00 - 14:00)', async () => {
      const formData = new FormData();
      formData.set('bookingId', BOOKING_ID);
      formData.set('targetDate', '2026-09-10');
      formData.set('targetTime', '13:00'); // Exactly at break start
      formData.set('reason', 'محاولة حجز وقت الاستراحة');

      const result = await rescheduleBookingByOperationsAction(formData);

      expect(result.error).toContain('يتعارض الموعد مع فترة استراحة العمل المحددة للفرع');
      expect(result.error).toContain('من 13:00 إلى 14:00');
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects booking that overlaps branch break time due to service duration (12:30 + 60m = 13:30)', async () => {
      const formData = new FormData();
      formData.set('bookingId', BOOKING_ID);
      formData.set('targetDate', '2026-09-10');
      formData.set('targetTime', '12:30'); // Duration is 60m, so ends at 13:30 (overlaps break 13:00-14:00)
      formData.set('reason', 'محاولة حجز يمتد إلى وقت الاستراحة');

      const result = await rescheduleBookingByOperationsAction(formData);

      expect(result.error).toContain('يتعارض الموعد مع فترة استراحة العمل المحددة للفرع');
      expect(result.error).toContain('من 13:00 إلى 14:00');
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects times outside branch working hours (e.g. 08:00 or 22:00)', async () => {
      const formData = new FormData();
      formData.set('bookingId', BOOKING_ID);
      formData.set('targetDate', '2026-09-10');
      formData.set('targetTime', '08:00'); // Before 09:00 opening
      formData.set('reason', 'حجز قبل بداية العمل');

      const result = await rescheduleBookingByOperationsAction(formData);

      expect(result.error).toContain('الموعد يجب أن يكون ضمن ساعات عمل الفرع (09:00 - 21:00)');
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });
});

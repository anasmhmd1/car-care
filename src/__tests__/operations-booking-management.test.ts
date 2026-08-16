import { describe, expect, it } from 'vitest';
import {
  cancelBookingByOperationsSchema,
  rescheduleBookingByOperationsSchema,
  toggleBranchScheduleLockSchema,
  transferBookingTeamSchema,
} from '@/lib/validations/operations';

describe('Operations Manager Booking Control & Schedule Lock (صلاحيات مدير التشغيل لإدارة الحجوزات وقفل الجدول)', () => {
  describe('Cancel Booking Validation', () => {
    it('validates bookingId and requires a cancellation reason of at least 3 characters', () => {
      const valid = cancelBookingByOperationsSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        reason: 'طلب العميل إلغاء الحجز لظرف طارئ',
      });
      expect(valid.success).toBe(true);

      const invalidReason = cancelBookingByOperationsSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        reason: '  ',
      });
      expect(invalidReason.success).toBe(false);
    });
  });

  describe('Reschedule / Shift Booking Validation', () => {
    it('validates new target date, time, and reason', () => {
      const valid = rescheduleBookingByOperationsSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        targetDate: '2026-08-20',
        targetTime: '14:30',
        reason: 'تأجيل الموعد بناءً على اتصال العميل',
      });
      expect(valid.success).toBe(true);

      const invalidTime = rescheduleBookingByOperationsSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        targetDate: '2026-08-20',
        targetTime: '25:99',
        reason: 'موعد غير صالح',
      });
      expect(invalidTime.success).toBe(false);
    });
  });

  describe('Transfer Team Validation', () => {
    it('validates bookingId, targetTeamId, and transfer reason', () => {
      const valid = transferBookingTeamSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        targetTeamId: 't1234567-89ab-cdef-0123-456789abcdef',
        reason: 'إعادة توزيع الأحمال التشغيلية بين الفرق',
      });
      expect(valid.success).toBe(true);

      const emptyReason = transferBookingTeamSchema.safeParse({
        bookingId: 'c1234567-89ab-cdef-0123-456789abcdef',
        targetTeamId: 't1234567-89ab-cdef-0123-456789abcdef',
        reason: '',
      });
      expect(emptyReason.success).toBe(false);
    });
  });

  describe('Schedule Lock Validation', () => {
    it('validates branchId and locked boolean state', () => {
      const lock = toggleBranchScheduleLockSchema.safeParse({
        branchId: 'b1234567-89ab-cdef-0123-456789abcdef',
        locked: 'true',
        reason: 'قفل جدول المواعيد لأعمال صيانة طارئة',
      });
      expect(lock.success).toBe(true);
      if (lock.success) {
        expect(lock.data.locked).toBe(true);
      }

      const unlock = toggleBranchScheduleLockSchema.safeParse({
        branchId: 'b1234567-89ab-cdef-0123-456789abcdef',
        locked: 'false',
        reason: 'استئناف استقبال الحجوزات',
      });
      expect(unlock.success).toBe(true);
      if (unlock.success) {
        expect(unlock.data.locked).toBe(false);
      }
    });
  });
});

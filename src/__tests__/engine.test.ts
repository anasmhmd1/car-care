import { describe, expect, it } from 'vitest';
import {
  BookingStatus,
  ChecklistStage,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import {
  getCustomerFacingStatusLabel,
  isValidStatusTransition,
  validateStatusTransition,
} from '../lib/engine/state-machine';
import { detectMimeFromBuffer, isValidMimeType } from '../lib/upload';
import {
  compareAssignmentCandidates,
  resolveTeamRouteContext,
  scoreTeamForAssignment,
  scoreTeamWorkload,
} from '../lib/engine/assignment';
import { calculateBookingQuote, calculateDeposit } from '../lib/engine/pricing';
import {
  dayOfWeekForLocalDate,
  intervalsOverlap,
  localDateTimeToUtc,
  roundDurationToSlot,
} from '../lib/engine/time';
import {
  canReachFirstTaskFromBase,
  calculateReservedDurationMinutes,
  DAILY_CAPACITY_CONSUMING_STATUSES,
  SCHEDULE_BLOCKING_STATUSES,
} from '../lib/engine/availability';

describe('Bareeq engine', () => {
  describe('booking state machine', () => {
    it('allows only the canonical happy-path sequence', () => {
      expect(isValidStatusTransition(BookingStatus.REQUEST_SUBMITTED, BookingStatus.AWAITING_PAYMENT_PROOF)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.AWAITING_PAYMENT_PROOF, BookingStatus.PAYMENT_UNDER_REVIEW)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.PAYMENT_UNDER_REVIEW, BookingStatus.PAYMENT_VERIFIED)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.ACCEPTED, BookingStatus.ASSIGNED)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.ON_THE_WAY, BookingStatus.ARRIVED)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW)).toBe(true);
      expect(isValidStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED)).toBe(true);
    });

    it('rejects illegal, skipped, terminal, and repeated transitions', () => {
      expect(isValidStatusTransition(BookingStatus.REQUEST_SUBMITTED, BookingStatus.IN_SERVICE)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.CLOSED, BookingStatus.DRAFT)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.CANCELLED, BookingStatus.ACCEPTED)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.ASSIGNED, BookingStatus.ASSIGNED)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.ASSIGNED, BookingStatus.ON_THE_WAY)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.SERVICE_COMPLETED)).toBe(false);
    });

    it('returns readable customer-facing Arabic labels', () => {
      expect(getCustomerFacingStatusLabel(BookingStatus.REQUEST_SUBMITTED)).toBe('تم استلام طلب الحجز');
      expect(getCustomerFacingStatusLabel(BookingStatus.ON_THE_WAY)).toBe('الفريق في الطريق إليك');
      expect(getCustomerFacingStatusLabel(BookingStatus.IN_SERVICE)).toBe('الخدمة قيد التنفيذ');
      expect(getCustomerFacingStatusLabel(BookingStatus.SERVICE_COMPLETED)).toBe('اكتملت الخدمة بنجاح');
      expect(getCustomerFacingStatusLabel(BookingStatus.CANCELLED)).toBe('تم إلغاء الحجز');
    });

    it('requires confirmed payment before operations review', () => {
      expect(validateStatusTransition(
        BookingStatus.PAYMENT_VERIFIED,
        BookingStatus.AWAITING_OPERATIONS_REVIEW,
        { paymentStatus: PaymentStatus.AMOUNT_SHORT },
      )).toMatchObject({ allowed: false, code: 'PAYMENT_NOT_CONFIRMED' });

      expect(validateStatusTransition(
        BookingStatus.PAYMENT_VERIFIED,
        BookingStatus.AWAITING_OPERATIONS_REVIEW,
        { paymentStatus: PaymentStatus.VERIFIED },
      ).allowed).toBe(true);
    });

    it('requires a reason for cancellation and failure paths', () => {
      expect(validateStatusTransition(
        BookingStatus.ACCEPTED,
        BookingStatus.CANCELLATION_REQUESTED,
      )).toMatchObject({ allowed: false, code: 'REASON_REQUIRED' });

      expect(validateStatusTransition(
        BookingStatus.ACCEPTED,
        BookingStatus.CANCELLATION_REQUESTED,
        { reason: 'طلب العميل تغيير الموعد' },
      ).allowed).toBe(true);
    });

    it('blocks service start until team scope and preparation/arrival checklists are satisfied', () => {
      const baseEvidence = {
        actorRole: UserRole.EMPLOYEE,
        hasAssignedTeam: true,
        actorBelongsToAssignedTeam: true,
      };

      expect(validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.IN_SERVICE, baseEvidence)).toMatchObject({
        allowed: false,
        code: 'CHECKLIST_INCOMPLETE',
      });

      expect(validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.IN_SERVICE, {
        ...baseEvidence,
        completedChecklistStages: [ChecklistStage.TEAM_PREPARATION, ChecklistStage.ARRIVAL_INSPECTION],
      }).allowed).toBe(true);
    });

    it('requires quality approval and a settled balance for final states', () => {
      expect(validateStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED, {
        hasAssignedTeam: true,
        qualityApproved: false,
      })).toMatchObject({ allowed: false, code: 'QUALITY_APPROVAL_REQUIRED' });

      expect(validateStatusTransition(BookingStatus.DELIVERED, BookingStatus.CLOSED, {
        hasAssignedTeam: true,
        amountDue: 100,
      })).toMatchObject({ allowed: false, code: 'OUTSTANDING_BALANCE' });
    });
  });

  describe('upload validation', () => {
    it('allows supported MIME/extension pairs and rejects executables', () => {
      expect(isValidMimeType('image/jpeg', 'receipt.jpg')).toBe(true);
      expect(isValidMimeType('image/png', 'proof.png')).toBe(true);
      expect(isValidMimeType('application/pdf', 'document.pdf')).toBe(true);
      expect(isValidMimeType('application/x-executable', 'hacker.exe')).toBe(false);
    });

    it('detects supported magic bytes and rejects unknown content', () => {
      expect(detectMimeFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
      expect(detectMimeFromBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
      expect(detectMimeFromBuffer(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBeNull();
    });
  });

  describe('assignment scoring', () => {
    it('prefers a team with more remaining capacity', () => {
      expect(scoreTeamForAssignment(1, 6)).toBeGreaterThan(scoreTeamForAssignment(5, 6));
    });

    it('ranks assignment priority 1 ahead of priority 10 when all other factors are equal', () => {
      const commonScore = 200;
      const ranked = [
        {
          teamId: 'priority-10',
          score: commonScore,
          assignmentPriority: 10,
          routeTravelMinutes: 15,
        },
        {
          teamId: 'priority-1',
          score: commonScore,
          assignmentPriority: 1,
          routeTravelMinutes: 15,
        },
      ].sort(compareAssignmentCandidates);

      expect(ranked.map((candidate) => candidate.teamId)).toEqual([
        'priority-1',
        'priority-10',
      ]);
    });

    it('uses current booking count and daily capacity for workload pressure', () => {
      expect(scoreTeamWorkload(1, 5)).toBeGreaterThan(scoreTeamWorkload(4, 5));
      expect(scoreTeamWorkload(2, 10)).toBeGreaterThan(scoreTeamWorkload(2, 4));
    });

    it('uses the configured home zone as the route origin when there are no adjacent bookings', () => {
      const route = resolveTeamRouteContext({
        baseZoneId: 'team-home',
        targetZoneId: 'customer-zone',
        startAt: new Date('2026-08-04T10:00:00.000Z'),
        endAt: new Date('2026-08-04T11:00:00.000Z'),
        bookings: [],
        travelPolicies: [{
          fromZoneId: 'team-home',
          toZoneId: 'customer-zone',
          durationMinutes: 12,
        }],
        branchDefaultMinutes: 30,
      });

      expect(route).toMatchObject({
        baseZoneId: 'team-home',
        usedBaseZone: true,
        previousBookingId: null,
        nextBookingId: null,
        routeTravelMinutes: 12,
      });
    });

    it('uses neighbouring jobs instead of the home zone when deriving a route', () => {
      const route = resolveTeamRouteContext({
        baseZoneId: 'team-home',
        targetZoneId: 'customer-zone',
        startAt: new Date('2026-08-04T10:00:00.000Z'),
        endAt: new Date('2026-08-04T11:00:00.000Z'),
        bookings: [{
          id: 'previous-job',
          startAt: new Date('2026-08-04T08:00:00.000Z'),
          endAt: new Date('2026-08-04T09:00:00.000Z'),
          zoneId: 'previous-zone',
        }],
        travelPolicies: [
          { fromZoneId: 'team-home', toZoneId: 'customer-zone', durationMinutes: 1 },
          { fromZoneId: 'previous-zone', toZoneId: 'customer-zone', durationMinutes: 22 },
        ],
        branchDefaultMinutes: 30,
      });

      expect(route).toMatchObject({
        usedBaseZone: false,
        previousBookingId: 'previous-job',
        routeTravelMinutes: 22,
      });
    });

    it('requires base-zone travel before the first task of a team', () => {
      const operationalDayStartAt = new Date('2026-08-04T09:00:00.000Z');
      const getTravelMinutes = (fromZoneId: string, toZoneId: string) => {
        expect([fromZoneId, toZoneId]).toEqual(['team-home', 'customer-zone']);
        return 30;
      };

      expect(canReachFirstTaskFromBase({
        baseZoneId: 'team-home',
        targetZoneId: 'customer-zone',
        operationalDayStartAt,
        slotStartAt: new Date('2026-08-04T09:29:00.000Z'),
        getTravelMinutes,
      })).toBe(false);
      expect(canReachFirstTaskFromBase({
        baseZoneId: 'team-home',
        targetZoneId: 'customer-zone',
        operationalDayStartAt,
        slotStartAt: new Date('2026-08-04T09:30:00.000Z'),
        getTravelMinutes,
      })).toBe(true);
      expect(canReachFirstTaskFromBase({
        baseZoneId: null,
        targetZoneId: 'customer-zone',
        operationalDayStartAt,
        slotStartAt: new Date('2026-08-04T09:00:00.000Z'),
        getTravelMinutes,
      })).toBe(true);
    });
  });

  describe('pricing and deposit calculations', () => {
    it('calculates percentage, fixed, full, and capped deposits', () => {
      expect(calculateDeposit(1000, true, false, 'PERCENTAGE', 30)).toBe(300);
      expect(calculateDeposit(1000, true, false, 'FIXED', 250)).toBe(250);
      expect(calculateDeposit(1000, true, true, 'PERCENTAGE', 30)).toBe(1000);
      expect(calculateDeposit(1000, true, false, 'FIXED', 1500)).toBe(1000);
      expect(calculateDeposit(1000, false, false, 'FIXED', 250)).toBe(0);
    });

    it('uses production quote rules for variants, addons, duration, slots, and subscriptions', () => {
      expect(calculateBookingQuote({
        base: { price: 700, durationMinutes: 90, slotCount: 2 },
        addons: [{ price: 150, durationMinutes: 20, slotCount: 1 }],
        depositRequired: true,
        fullPrepayment: false,
        depositType: 'PERCENTAGE',
        depositValue: 30,
      })).toEqual({
        basePrice: 700,
        addonPrice: 150,
        totalPrice: 850,
        depositAmount: 255,
        totalDurationMinutes: 110,
        slotCount: 3,
      });

      expect(calculateBookingQuote({
        base: { price: 700, durationMinutes: 90 },
        addons: [{ price: 150, durationMinutes: 20 }],
        depositRequired: true,
        fullPrepayment: false,
        depositType: 'PERCENTAGE',
        depositValue: 30,
        subscriptionCoversBase: true,
      }).totalPrice).toBe(150);
    });
  });

  describe('availability time primitives', () => {
    it('keeps completed and failed visits in daily capacity while terminal cancellations stay excluded', () => {
      for (const status of [
        BookingStatus.CLOSED,
        BookingStatus.EXECUTION_FAILED,
        BookingStatus.CUSTOMER_NO_SHOW,
        BookingStatus.ACCESS_DENIED,
      ]) {
        expect(DAILY_CAPACITY_CONSUMING_STATUSES).toContain(status);
        expect(SCHEDULE_BLOCKING_STATUSES).toContain(status);
      }

      for (const status of [
        BookingStatus.CANCELLED,
        BookingStatus.REJECTED,
        BookingStatus.EXPIRED,
      ]) {
        expect(DAILY_CAPACITY_CONSUMING_STATUSES).not.toContain(status);
        expect(SCHEDULE_BLOCKING_STATUSES).not.toContain(status);
      }
    });

    it('rounds service duration to the branch slot unit', () => {
      expect(roundDurationToSlot(61, 30)).toBe(90);
      expect(roundDurationToSlot(120, 30)).toBe(120);
    });

    it('reserves the greater of measured duration and commercial slot units', () => {
      expect(calculateReservedDurationMinutes(70, 4, 30)).toBe(120);
      expect(calculateReservedDurationMinutes(140, 2, 30)).toBe(150);
      expect(() => calculateReservedDurationMinutes(60, 0, 30)).toThrow(/slotCount/);
    });

    it('uses half-open intervals so adjacent bookings do not overlap', () => {
      const start = new Date('2026-08-01T08:00:00.000Z');
      const end = new Date('2026-08-01T09:00:00.000Z');
      expect(intervalsOverlap(start, end, end, new Date('2026-08-01T10:00:00.000Z'))).toBe(false);
      expect(intervalsOverlap(start, end, new Date('2026-08-01T08:30:00.000Z'), new Date('2026-08-01T09:30:00.000Z'))).toBe(true);
    });

    it('converts branch-local Cairo times independently of the server timezone', () => {
      expect(localDateTimeToUtc('2026-01-15', '09:00', 'Africa/Cairo').toISOString()).toBe('2026-01-15T07:00:00.000Z');
      expect(dayOfWeekForLocalDate('2026-08-01')).toBe(6);
    });
  });
});

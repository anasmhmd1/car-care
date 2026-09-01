import { describe, expect, it } from 'vitest';
import {
  BookingStatus,
  ChecklistStage,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import {
  isValidStatusTransition,
  validateStatusTransition,
  EXECUTION_CHECKLIST_STAGES,
  getCustomerFacingStatusLabel,
} from '@/lib/engine/state-machine';
import {
  compareAssignmentCandidates,
  resolveTeamRouteContext,
  scoreTeamWorkload,
  type AssignmentRankingCandidate,
} from '@/lib/engine/assignment';
import {
  calculateReservedDurationMinutes,
} from '@/lib/engine/availability';
import {
  cancelBookingByOperationsSchema,
  rescheduleBookingByOperationsSchema,
  toggleBranchScheduleLockSchema,
  transferBookingTeamSchema,
  reviewPaymentProofSchema,
  reviewBookingSchema,
  assignTeamManuallySchema,
  recordBalancePaymentSchema,
  reviewCancellationSchema,
  approveRefundSchema,
  recordRefundSchema,
  reviewRescheduleSchema,
  qualityReviewSchema,
  triageComplaintSchema,
  resolveComplaintSchema,
} from '@/lib/validations/operations';
import {
  databaseIdSchema,
} from '@/lib/validations/database-id';
import {
  calculateDeposit,
} from '@/lib/engine/pricing';
import {
  intervalsOverlap,
} from '@/lib/engine/time';

describe('Operations Manager (مدير التشغيل) Complete E2E & Logical Test Suite', () => {

  // =========================================================================
  // 1. Payment Proofs Queue & Decisions (إثباتات التحويل والدفع)
  // =========================================================================
  describe('1. Payment Proof Queue & Operational Decisions', () => {
    it('validates review payment proof schemas for all decisions', () => {
      const verify = reviewPaymentProofSchema.safeParse({
        proofId: '12345678-1234-1234-1234-123456789abc',
        decision: 'VERIFY',
        reviewNotes: 'تمت مطابقة الإيصال وتأكيد التحويل',
      });
      expect(verify.success).toBe(true);

      const rejectWithoutReason = reviewPaymentProofSchema.safeParse({
        proofId: '12345678-1234-1234-1234-123456789abc',
        decision: 'REJECT',
        reviewNotes: '',
      });
      expect(rejectWithoutReason.success).toBe(false);

      const reuploadWithReason = reviewPaymentProofSchema.safeParse({
        proofId: '12345678-1234-1234-1234-123456789abc',
        decision: 'REUPLOAD',
        reviewNotes: 'صورة الإيصال غير واضحة يرجى إعادة رفع صورة أوضح',
      });
      expect(reuploadWithReason.success).toBe(true);
    });

    it('handles state machine transition on VERIFY vs short payment', () => {
      const transition = validateStatusTransition(
        BookingStatus.PAYMENT_UNDER_REVIEW,
        BookingStatus.PAYMENT_VERIFIED,
        { paymentStatus: PaymentStatus.VERIFIED },
      );
      expect(transition.allowed).toBe(true);

      const shortTransition = validateStatusTransition(
        BookingStatus.PAYMENT_VERIFIED,
        BookingStatus.AWAITING_OPERATIONS_REVIEW,
        { paymentStatus: PaymentStatus.AMOUNT_SHORT },
      );
      expect(shortTransition.allowed).toBe(false);
      expect(shortTransition.code).toBe('PAYMENT_NOT_CONFIRMED');
    });

    it('validates deposit calculations for fixed and percentage deposit modes', () => {
      const fixedDeposit = calculateDeposit(500, true, false, 'FIXED', 100);
      expect(fixedDeposit).toBe(100);

      const pctDeposit = calculateDeposit(600, true, false, 'PERCENTAGE', 30);
      expect(pctDeposit).toBe(180);

      const cappedDeposit = calculateDeposit(300, true, false, 'FIXED', 500);
      expect(cappedDeposit).toBe(300);
    });
  });

  // =========================================================================
  // 2. Booking Review Queue (مراجعة الحجوزات)
  // =========================================================================
  describe('2. Booking Review & Acceptance/Rejection Flow', () => {
    it('validates review booking schema for ACCEPT and REJECT', () => {
      const accept = reviewBookingSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        decision: 'ACCEPT',
        reason: 'تمت مراجعة الحجز والموافقة عليه للتوزيع الميداني',
      });
      expect(accept.success).toBe(true);

      const reject = reviewBookingSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        decision: 'REJECT',
        reason: 'المنطقة خارج نطاق التغطية الميدانية للفرع',
      });
      expect(reject.success).toBe(true);
    });

    it('accepts valid booking and allows progression to assignment queue', () => {
      const acceptTransition = validateStatusTransition(
        BookingStatus.AWAITING_OPERATIONS_REVIEW,
        BookingStatus.ACCEPTED,
        {
          actorRole: UserRole.OPERATIONS_MANAGER,
          paymentStatus: PaymentStatus.VERIFIED,
        },
      );
      expect(acceptTransition.allowed).toBe(true);

      const toUnassigned = validateStatusTransition(
        BookingStatus.ACCEPTED,
        BookingStatus.AWAITING_ASSIGNMENT,
      );
      expect(toUnassigned.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 3. Team Assignment & Smart Scoring Engine (قائمة الإسناد وخوارزمية التوزيع)
  // =========================================================================
  describe('3. Team Assignment & Smart Scoring Engine', () => {
    it('validates assignTeamManuallySchema', () => {
      const valid = assignTeamManuallySchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        teamId: '87654321-4321-4321-4321-cba987654321',
        reason: 'إسناد يدوي بمعرفة مدير التشغيل',
      });
      expect(valid.success).toBe(true);
    });

    it('ranks teams correctly based on capacity, route, home zone, and priority', () => {
      const candidateA: AssignmentRankingCandidate = {
        teamId: 'team-a',
        score: 180,
        routeTravelMinutes: 10,
        assignmentPriority: 1,
      };
      const candidateB: AssignmentRankingCandidate = {
        teamId: 'team-b',
        score: 140,
        routeTravelMinutes: 25,
        assignmentPriority: 2,
      };
      const candidates = [candidateB, candidateA];
      candidates.sort(compareAssignmentCandidates);

      expect(candidates[0].teamId).toBe('team-a');
    });

    it('breaks ties using route travel time, then assignment priority', () => {
      const tiedHighTravel: AssignmentRankingCandidate = {
        teamId: 'team-slow',
        score: 150,
        routeTravelMinutes: 30,
        assignmentPriority: 1,
      };
      const tiedFastTravel: AssignmentRankingCandidate = {
        teamId: 'team-fast',
        score: 150,
        routeTravelMinutes: 12,
        assignmentPriority: 2,
      };
      const list = [tiedHighTravel, tiedFastTravel].sort(compareAssignmentCandidates);
      expect(list[0].teamId).toBe('team-fast');
    });

    it('scores workload pressure correctly against daily capacity', () => {
      expect(scoreTeamWorkload(0, 5)).toBe(20);
      expect(scoreTeamWorkload(4, 5)).toBe(4);
      expect(scoreTeamWorkload(5, 5)).toBe(0);
    });

    it('resolves route context and travel minutes from home base or previous booking', () => {
      const route = resolveTeamRouteContext({
        baseZoneId: 'zone-zamalek',
        targetZoneId: 'zone-dokki',
        startAt: new Date('2026-08-25T10:00:00Z'),
        endAt: new Date('2026-08-25T11:30:00Z'),
        bookings: [],
        travelPolicies: [
          { fromZoneId: 'zone-zamalek', toZoneId: 'zone-dokki', durationMinutes: 18 },
        ],
        branchDefaultMinutes: 20,
      });

      expect(route.usedBaseZone).toBe(true);
      expect(route.routeTravelMinutes).toBe(18);
      expect(route.homeZoneMatch).toBe(false);
    });
  });

  // =========================================================================
  // 4. Active Bookings: Rescheduling & Team Transfers (الحجوزات النشطة)
  // =========================================================================
  describe('4. Active Bookings: Reschedule, Transfer & Status Guard', () => {
    it('validates operations reschedule input with strict date and time formats', () => {
      const valid = rescheduleBookingByOperationsSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        targetDate: '2026-08-25',
        targetTime: '16:00',
        reason: 'تأجيل بناء على طلب العميل بالهاتف',
      });
      expect(valid.success).toBe(true);

      const invalidDate = rescheduleBookingByOperationsSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        targetDate: 'invalid-date',
        targetTime: '16:00',
        reason: 'سبب صحيح',
      });
      expect(invalidDate.success).toBe(false);
    });

    it('validates team transfer schema requiring a valid target team and reason', () => {
      const valid = transferBookingTeamSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        targetTeamId: '87654321-4321-4321-4321-cba987654321',
        reason: 'إعادة توازن ورديات الفرق الميدانية',
      });
      expect(valid.success).toBe(true);
    });

    it('enforces team assignment guard on in-flight statuses', () => {
      const unassignedToOnTheWay = validateStatusTransition(
        BookingStatus.ASSIGNED,
        BookingStatus.TEAM_ACKNOWLEDGED,
        { hasAssignedTeam: false },
      );
      expect(unassignedToOnTheWay.allowed).toBe(false);
      expect(unassignedToOnTheWay.code).toBe('TEAM_NOT_ASSIGNED');

      const assignedToOnTheWay = validateStatusTransition(
        BookingStatus.ASSIGNED,
        BookingStatus.TEAM_ACKNOWLEDGED,
        { hasAssignedTeam: true },
      );
      expect(assignedToOnTheWay.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 5. Quality Review & Checklist Approval (مراجعة واعتماد الجودة)
  // =========================================================================
  describe('5. Quality Review, Inspection Stages & Checklists', () => {
    it('requires all execution checklist stages before moving to QUALITY_REVIEW without override', () => {
      const incompleteChecklist = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION],
        },
      );
      expect(incompleteChecklist.allowed).toBe(false);
      expect(incompleteChecklist.code).toBe('CHECKLIST_INCOMPLETE');

      const completeChecklist = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          hasAssignedTeam: true,
          completedChecklistStages: EXECUTION_CHECKLIST_STAGES,
        },
      );
      expect(completeChecklist.allowed).toBe(true);
    });

    it('allows manager override with reason when completing transition with exceptions', () => {
      const managerOverrideTransition = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          hasAssignedTeam: true,
          managerOverride: true,
          actorRole: UserRole.OPERATIONS_MANAGER,
          reason: 'استثناء من مدير التشغيل بسبب عطل كاميرا الفني مع التأكيد الهاتفي',
        },
      );
      expect(managerOverrideTransition.allowed).toBe(true);
    });

    it('validates qualityReviewSchema with score rating and notes', () => {
      const validApproval = qualityReviewSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        approved: 'true',
        score: '5',
        notes: 'تنفيذ ممتاز ومطابق لكافة بنود الجودة',
      });
      expect(validApproval.success).toBe(true);

      const invalidScore = qualityReviewSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        approved: 'true',
        score: '7',
        notes: 'ملاحظة',
      });
      expect(invalidScore.success).toBe(false);

      const returnToTeam = qualityReviewSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        approved: 'false',
        score: '2',
        returnedToTeam: 'true',
        notes: 'يرجى إعادة تلميع الجنوط ومراجعة تنظيف الزوايا بدقة',
      });
      expect(returnToTeam.success).toBe(true);
      if (returnToTeam.success) {
        expect(returnToTeam.data.approved).toBe(false);
        expect(returnToTeam.data.returnedToTeam).toBe(true);
      }
    });
  });

  // =========================================================================
  // 6. Balance Settlement & Final Booking Close (التحصيل والتسوية والإغلاق)
  // =========================================================================
  describe('6. Balance Payment & Final Booking Close', () => {
    it('validates recordBalancePaymentSchema', () => {
      const valid = recordBalancePaymentSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        amount: 250,
        paymentMethod: 'CASH',
        referenceNumber: 'CASH-REC-001',
        notes: 'تحصيل نقدي عند التسليم',
        idempotencyKey: 'idemp-balance-pay-123456',
      });
      expect(valid.success).toBe(true);
    });

    it('blocks closing booking when remaining balance (amountDue) is greater than zero', () => {
      const closeWithUnpaidBalance = validateStatusTransition(
        BookingStatus.DELIVERED,
        BookingStatus.CLOSED,
        {
          hasAssignedTeam: true,
          amountDue: 250,
        },
      );
      expect(closeWithUnpaidBalance.allowed).toBe(false);
      expect(closeWithUnpaidBalance.code).toBe('OUTSTANDING_BALANCE');

      const closeFullyPaid = validateStatusTransition(
        BookingStatus.DELIVERED,
        BookingStatus.CLOSED,
        {
          hasAssignedTeam: true,
          amountDue: 0,
        },
      );
      expect(closeFullyPaid.allowed).toBe(true);
    });

    it('requires quality approval before advancing to SERVICE_COMPLETED', () => {
      const unapproved = validateStatusTransition(
        BookingStatus.QUALITY_REVIEW,
        BookingStatus.SERVICE_COMPLETED,
        {
          hasAssignedTeam: true,
          qualityApproved: false,
        },
      );
      expect(unapproved.allowed).toBe(false);
      expect(unapproved.code).toBe('QUALITY_APPROVAL_REQUIRED');

      const approved = validateStatusTransition(
        BookingStatus.QUALITY_REVIEW,
        BookingStatus.SERVICE_COMPLETED,
        {
          hasAssignedTeam: true,
          qualityApproved: true,
        },
      );
      expect(approved.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 7. Cancellations, Refunds & Complaints (الحالات والشكاوى والاسترداد)
  // =========================================================================
  describe('7. Cases, Cancellations, Refunds & Complaints Triage', () => {
    it('validates reviewCancellationSchema by operations manager', () => {
      const validReview = reviewCancellationSchema.safeParse({
        cancellationId: '12345678-1234-1234-1234-123456789abc',
        decision: 'APPROVE',
        resolutionType: 'REFUND_FULL',
        responsibleParty: 'CUSTOMER',
        resolutionNotes: 'الموافقة على الإلغاء واسترداد العربون وفق السياسة المعتمدة',
      });
      expect(validReview.success).toBe(true);
    });

    it('validates approveRefundSchema and recordRefundSchema', () => {
      const approveRefund = approveRefundSchema.safeParse({
        refundId: '12345678-1234-1234-1234-123456789abc',
        reason: 'اعتماد تحويل المبلغ لحساب العميل البنكي',
      });
      expect(approveRefund.success).toBe(true);

      const recordRefund = recordRefundSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        amount: 300,
        refundMethod: 'INSTAPAY',
        referenceNumber: 'TXN-99887766',
        bookingFileId: '12345678-1234-1234-1234-123456789abc',
        refundTimestamp: new Date(),
        idempotencyKey: 'idemp-refund-123456',
        notes: 'تم التحويل بنجاح',
      });
      expect(recordRefund.success).toBe(true);
    });

    it('validates reviewRescheduleSchema for reschedule requests', () => {
      const valid = reviewRescheduleSchema.safeParse({
        timeChangeId: '12345678-1234-1234-1234-123456789abc',
        decision: 'APPROVE',
        approvedStartAt: new Date('2026-08-26T14:00:00Z'),
        reviewNotes: 'الموافقة على تقديم الموعد ساعة واحدة',
      });
      expect(valid.success).toBe(true);
    });

    it('validates cancelBookingByOperationsSchema', () => {
      const valid = cancelBookingByOperationsSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        reason: 'إلغاء بمعرفة إدارة التشغيل لظرف طارئ',
      });
      expect(valid.success).toBe(true);
    });

    it('validates triageComplaintSchema and resolveComplaintSchema', () => {
      const triage = triageComplaintSchema.safeParse({
        complaintId: '12345678-1234-1234-1234-123456789abc',
        priority: 'HIGH',
        status: 'UNDER_REVIEW',
        assignedToUserId: '12345678-1234-1234-1234-123456789abc',
        notes: 'ملاحظات الفرز وتوجيه الشكوى للمشرف المختص',
      });
      expect(triage.success).toBe(true);

      const resolve = resolveComplaintSchema.safeParse({
        complaintId: '12345678-1234-1234-1234-123456789abc',
        resolution: 'تم التواصل مع العميل وتقديم خدمة غسيل مجانية ترضية',
      });
      expect(resolve.success).toBe(true);
    });
  });

  // =========================================================================
  // 8. Terminal Bookings Reopen (إعادة فتح الحجوزات الطرفية)
  // =========================================================================
  describe('8. Terminal Bookings Reopen Validation', () => {
    it('validates bookingId format and reason requirements for terminal reopen', () => {
      const validBookingId = databaseIdSchema.safeParse('12345678-1234-1234-1234-123456789abc');
      expect(validBookingId.success).toBe(true);

      const invalidBookingId = databaseIdSchema.safeParse('invalid id with spaces/slashes');
      expect(invalidBookingId.success).toBe(false);

      const reason = 'إعادة فتح لمراجعة شكوى لاحقة من العميل بشأن جودة التلميع';
      expect(reason.trim().length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // 9. Branch Schedule Locking & Availability Impact (قفل جدول المواعيد)
  // =========================================================================
  describe('9. Branch Schedule Lock & Online Availability Control', () => {
    it('validates schedule lock toggle with reason', () => {
      const lock = toggleBranchScheduleLockSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        locked: 'true',
        reason: 'قفل المواعيد مؤقتاً لسوء الأحوال الجوية',
      });
      expect(lock.success).toBe(true);
      if (lock.success) {
        expect(lock.data.locked).toBe(true);
      }

      const unlock = toggleBranchScheduleLockSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        locked: 'false',
        reason: 'استئناف استقبال الحجوزات بعد تحسن الطقس',
      });
      expect(unlock.success).toBe(true);
      if (unlock.success) {
        expect(unlock.data.locked).toBe(false);
      }
    });

    it('calculates reserved duration considering slot units and service duration', () => {
      const reserved = calculateReservedDurationMinutes(90, 1, 60);
      expect(reserved).toBe(120);

      const reserved60 = calculateReservedDurationMinutes(45, 1, 60);
      expect(reserved60).toBe(60);
    });

    it('checks interval overlaps for breaks and active bookings accurately', () => {
      const start1 = new Date('2026-08-25T10:00:00Z');
      const end1 = new Date('2026-08-25T11:30:00Z');

      const start2 = new Date('2026-08-25T11:00:00Z');
      const end2 = new Date('2026-08-25T12:00:00Z');

      const start3 = new Date('2026-08-25T12:00:00Z');
      const end3 = new Date('2026-08-25T13:00:00Z');

      expect(intervalsOverlap(start1, end1, start2, end2)).toBe(true);
      expect(intervalsOverlap(start1, end1, start3, end3)).toBe(false);
    });
  });

  // =========================================================================
  // 10. Audit & State Machine Integrity (سجل التدقيق وسلامة محرك الحالات)
  // =========================================================================
  describe('10. Audit & State Machine Integrity', () => {
    it('verifies that terminal statuses do not allow further transitions', () => {
      expect(isValidStatusTransition(BookingStatus.CLOSED, BookingStatus.IN_SERVICE)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.CANCELLED, BookingStatus.ACCEPTED)).toBe(false);
      expect(isValidStatusTransition(BookingStatus.EXPIRED, BookingStatus.ACCEPTED)).toBe(false);
    });

    it('verifies customer facing Arabic status labels coverage', () => {
      const statuses = [
        BookingStatus.REQUEST_SUBMITTED,
        BookingStatus.AWAITING_PAYMENT_PROOF,
        BookingStatus.PAYMENT_UNDER_REVIEW,
        BookingStatus.ACCEPTED,
        BookingStatus.ASSIGNED,
        BookingStatus.ON_THE_WAY,
        BookingStatus.ARRIVED,
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        BookingStatus.SERVICE_COMPLETED,
        BookingStatus.DELIVERED,
        BookingStatus.CLOSED,
        BookingStatus.CANCELLED,
      ];

      for (const status of statuses) {
        const label = getCustomerFacingStatusLabel(status);
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(3);
      }
    });
  });
});

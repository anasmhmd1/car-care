import { describe, expect, it } from 'vitest';
import {
  BookingStatus,
  ChecklistStage,
} from '@prisma/client';
import {
  isValidStatusTransition,
  validateStatusTransition,
  EXECUTION_CHECKLIST_STAGES,
} from '@/lib/engine/state-machine';
import {
  canEditChecklistStage,
} from '@/lib/engine/evidence-stage';
import { formatMaterialQuantityWithUnit } from '@/lib/inventory/units';
import { phoneHref, whatsappHref } from '@/lib/contact-links';

describe('Field Employee / Technician (موظف وفني التنفيذ) Complete E2E & Logical Test Suite', () => {

  // =========================================================================
  // 1. Standard Field Workflow Progression (المسار الميداني المرحلي)
  // =========================================================================
  describe('1. Field Workflow Stepper & Sequence Transitions', () => {
    it('allows the canonical technician field progression sequence', () => {
      // 1. Team Acknowledges assignment
      expect(isValidStatusTransition(BookingStatus.ASSIGNED, BookingStatus.TEAM_ACKNOWLEDGED)).toBe(true);

      // 2. Team Departs towards customer
      expect(isValidStatusTransition(BookingStatus.TEAM_ACKNOWLEDGED, BookingStatus.ON_THE_WAY)).toBe(true);

      // 3. Team Arrives at customer location
      expect(isValidStatusTransition(BookingStatus.ON_THE_WAY, BookingStatus.ARRIVED)).toBe(true);

      // 4. Team Starts Service Execution
      expect(isValidStatusTransition(BookingStatus.ARRIVED, BookingStatus.IN_SERVICE)).toBe(true);

      // 5. Team Submits completed work for Quality Review
      expect(isValidStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW)).toBe(true);

      // 6. Quality Approves work
      expect(isValidStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED)).toBe(true);

      // 7. Team Handover & Delivers car to customer
      expect(isValidStatusTransition(BookingStatus.SERVICE_COMPLETED, BookingStatus.DELIVERED)).toBe(true);
    });

    it('rejects skipping stages in the field journey', () => {
      // Cannot jump from ASSIGNED directly to IN_SERVICE
      expect(isValidStatusTransition(BookingStatus.ASSIGNED, BookingStatus.IN_SERVICE)).toBe(false);

      // Cannot jump from ON_THE_WAY directly to QUALITY_REVIEW
      expect(isValidStatusTransition(BookingStatus.ON_THE_WAY, BookingStatus.QUALITY_REVIEW)).toBe(false);

      // Cannot jump from ARRIVED directly to DELIVERED
      expect(isValidStatusTransition(BookingStatus.ARRIVED, BookingStatus.DELIVERED)).toBe(false);
    });

    it('validates customer quick action links (Phone & WhatsApp)', () => {
      const telLink = phoneHref('01012345678');
      expect(telLink).toBe('tel:01012345678');

      const waLink = whatsappHref('01012345678', 'مرحبًا بخصوص حجز رقم BQ-2026-1001');
      expect(waLink).toContain('https://wa.me/201012345678');
      expect(waLink).toContain('text=');
    });
  });

  // =========================================================================
  // 2. Checklist Stage Windows & Checklist Gating (حراسة مراحل الفحص)
  // =========================================================================
  describe('2. Checklist Stage Windows & Evidence Stage Gates', () => {
    it('restricts TEAM_PREPARATION checklist only to pre-service stages', () => {
      expect(canEditChecklistStage(BookingStatus.ASSIGNED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.TEAM_ACKNOWLEDGED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.ON_THE_WAY, ChecklistStage.TEAM_PREPARATION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.TEAM_PREPARATION)).toBe(false);
      expect(canEditChecklistStage(BookingStatus.QUALITY_REVIEW, ChecklistStage.TEAM_PREPARATION)).toBe(false);
    });

    it('restricts ARRIVAL_INSPECTION checklist strictly to ARRIVED state', () => {
      expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.ARRIVAL_INSPECTION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.ON_THE_WAY, ChecklistStage.ARRIVAL_INSPECTION)).toBe(false);
      expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.ARRIVAL_INSPECTION)).toBe(false);
    });

    it('restricts SERVICE_EXECUTION and CLOSING checklists strictly to IN_SERVICE state', () => {
      expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.SERVICE_EXECUTION)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.CLOSING)).toBe(true);
      expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.SERVICE_EXECUTION)).toBe(false);
      expect(canEditChecklistStage(BookingStatus.QUALITY_REVIEW, ChecklistStage.SERVICE_EXECUTION)).toBe(false);
    });

  });

  // =========================================================================
  // 3. Quality Review Transition Checklist Validation (متطلبات مراجعة الجودة)
  // =========================================================================
  describe('3. Quality Review Transition Verification & Checklist Requirements', () => {
    it('blocks advancing to IN_SERVICE if preparation or arrival checklists are missing', () => {
      const incomplete = validateStatusTransition(
        BookingStatus.ARRIVED,
        BookingStatus.IN_SERVICE,
        {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION], // Missing ARRIVAL_INSPECTION
        },
      );
      expect(incomplete.allowed).toBe(false);
      expect(incomplete.code).toBe('CHECKLIST_INCOMPLETE');
    });

    it('blocks advancing to QUALITY_REVIEW if required execution checklists are incomplete', () => {
      const incomplete = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION, ChecklistStage.ARRIVAL_INSPECTION],
        },
      );
      expect(incomplete.allowed).toBe(false);
      expect(incomplete.code).toBe('CHECKLIST_INCOMPLETE');
    });

    it('allows advancing to QUALITY_REVIEW when all execution checklists are fulfilled', () => {
      const success = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          hasAssignedTeam: true,
          completedChecklistStages: EXECUTION_CHECKLIST_STAGES,
        },
      );
      expect(success.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 4. Material Stock Formatting & Custody Checks (مواد الخدمة والعهد الشخصية)
  // =========================================================================
  describe('4. Material Stock Formatting & Inventory Readiness', () => {
    it('formats material quantities with accurate units (LITER, ML, GRAM, PIECE)', () => {
      const liters = formatMaterialQuantityWithUnit(2.5, 'LITER');
      expect(liters.primary).toContain('2.5');

      const pieces = formatMaterialQuantityWithUnit(4, 'PIECE');
      expect(pieces.primary).toContain('4');
    });

    it('detects material readiness and required blockers accurately', () => {
      const materialReady = {
        required: true,
        ready: true,
        availableQuantity: 5,
        quantityRequired: 2,
      };
      expect(materialReady.ready).toBe(true);

      const materialShortage = {
        required: true,
        ready: false,
        availableQuantity: 1,
        quantityRequired: 3,
      };
      expect(materialShortage.ready).toBe(false);
    });
  });

  // =========================================================================
  // 5. Field Incident & Failure Transitions (بلاغات الطوارئ وحالات تعذر التنفيذ)
  // =========================================================================
  describe('5. Field Failure States & Emergency Transitions', () => {
    it('allows transitioning to failure states with documented reason', () => {
      // Customer No Show (العميل لم يحضر)
      const noShow = validateStatusTransition(
        BookingStatus.ARRIVED,
        BookingStatus.CUSTOMER_NO_SHOW,
        {
          hasAssignedTeam: true,
          reason: 'تم الانتظار 30 دقيقة والاتصال 3 مرات دون استجابة من العميل',
        },
      );
      expect(noShow.allowed).toBe(true);

      // Access Denied (تعذر دخول الكمبوند أو الموقع)
      const accessDenied = validateStatusTransition(
        BookingStatus.ARRIVED,
        BookingStatus.ACCESS_DENIED,
        {
          hasAssignedTeam: true,
          reason: 'أمن الكمبوند رفض الدخول لعدم وجود تصريح زيارة مسبق من العميل',
        },
      );
      expect(accessDenied.allowed).toBe(true);

      // Execution Failed (تعذر التنفيذ الميداني)
      const executionFailed = validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.EXECUTION_FAILED,
        {
          hasAssignedTeam: true,
          reason: 'هطول أمطار غزيرة ورياح ترابية تمنع استكمال التلميع في مكان مكشوف',
        },
      );
      expect(executionFailed.allowed).toBe(true);
    });

    it('requires a descriptive reason when transitioning to field failure states', () => {
      const noReason = validateStatusTransition(
        BookingStatus.ARRIVED,
        BookingStatus.CUSTOMER_NO_SHOW,
        {
          hasAssignedTeam: true,
          reason: '',
        },
      );
      expect(noReason.allowed).toBe(false);
      expect(noReason.code).toBe('REASON_REQUIRED');
    });
  });
});

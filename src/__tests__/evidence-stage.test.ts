import { BookingStatus, ChecklistStage } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  canEditChecklistStage,
} from '@/lib/engine/evidence-stage';

describe('execution evidence stage gates', () => {
  it('allows preparation only after acknowledgement and through arrival', () => {
    expect(canEditChecklistStage(BookingStatus.TEAM_ACKNOWLEDGED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.ON_THE_WAY, ChecklistStage.TEAM_PREPARATION)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.ASSIGNED, ChecklistStage.TEAM_PREPARATION)).toBe(false);
    expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.TEAM_PREPARATION)).toBe(false);
  });

  it('locks every checklist stage to its workflow window', () => {
    expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.ARRIVAL_INSPECTION)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.ARRIVAL_INSPECTION)).toBe(false);
    expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.SERVICE_EXECUTION)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.CLOSING)).toBe(true);
    expect(canEditChecklistStage(BookingStatus.QUALITY_REVIEW, ChecklistStage.CLOSING)).toBe(false);
    expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.BOOKING_REVIEW)).toBe(false);
  });
});

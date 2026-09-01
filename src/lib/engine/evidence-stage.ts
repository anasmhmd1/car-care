import { BookingStatus, ChecklistStage } from '@prisma/client';

const CHECKLIST_STAGE_STATUSES: Partial<
  Record<ChecklistStage, ReadonlySet<BookingStatus>>
> = {
  [ChecklistStage.TEAM_PREPARATION]: new Set([
    BookingStatus.TEAM_ACKNOWLEDGED,
    BookingStatus.ON_THE_WAY,
    BookingStatus.ARRIVED,
  ]),
  [ChecklistStage.ARRIVAL_INSPECTION]: new Set([
    BookingStatus.ARRIVED,
  ]),
  [ChecklistStage.SERVICE_EXECUTION]: new Set([
    BookingStatus.IN_SERVICE,
  ]),
  [ChecklistStage.CLOSING]: new Set([
    BookingStatus.IN_SERVICE,
  ]),
};

export function canEditChecklistStage(
  bookingStatus: BookingStatus,
  stage: ChecklistStage,
): boolean {
  return CHECKLIST_STAGE_STATUSES[stage]?.has(bookingStatus) ?? false;
}

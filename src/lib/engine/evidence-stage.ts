import { BookingStatus, ChecklistStage, FileType } from '@prisma/client';

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

const EXECUTION_FILE_STATUSES: Partial<
  Record<FileType, ReadonlySet<BookingStatus>>
> = {
  [FileType.BEFORE_SERVICE]: new Set([BookingStatus.ARRIVED]),
  [FileType.EXISTING_DAMAGE]: new Set([BookingStatus.ARRIVED]),
  [FileType.DURING_SERVICE]: new Set([BookingStatus.IN_SERVICE]),
  [FileType.AFTER_SERVICE]: new Set([BookingStatus.IN_SERVICE]),
};

export function canEditChecklistStage(
  bookingStatus: BookingStatus,
  stage: ChecklistStage,
): boolean {
  return CHECKLIST_STAGE_STATUSES[stage]?.has(bookingStatus) ?? false;
}

export function canUploadExecutionFile(
  bookingStatus: BookingStatus,
  fileType: FileType,
): boolean {
  return EXECUTION_FILE_STATUSES[fileType]?.has(bookingStatus) ?? false;
}

export function isExecutionFileType(fileType: FileType): boolean {
  return Object.hasOwn(EXECUTION_FILE_STATUSES, fileType);
}

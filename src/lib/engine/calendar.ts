import { BookingStatus } from '@prisma/client';

/**
 * A calendar move is an operational correction, not a way to rewind execution.
 * Keep this list deliberately narrower than "anything that has not completed".
 */
export const CALENDAR_RESCHEDULABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.AWAITING_OPERATIONS_REVIEW,
  BookingStatus.ACCEPTED,
  BookingStatus.AWAITING_ASSIGNMENT,
  BookingStatus.ASSIGNED,
];

const calendarReschedulableStatusSet = new Set<BookingStatus>(
  CALENDAR_RESCHEDULABLE_STATUSES,
);

export function isCalendarReschedulableStatus(status: BookingStatus): boolean {
  return calendarReschedulableStatusSet.has(status);
}

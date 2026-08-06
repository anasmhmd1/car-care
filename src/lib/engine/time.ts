const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function roundDurationToSlot(durationMinutes: number, slotUnitMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Service duration must be a positive number.');
  }
  if (!Number.isInteger(slotUnitMinutes) || slotUnitMinutes <= 0) {
    throw new Error('Slot unit must be a positive integer.');
  }
  return Math.ceil(durationMinutes / slotUnitMinutes) * slotUnitMinutes;
}

export function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function partsAsUtcEpoch(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
}

/** Convert a branch-local date/time to its exact UTC instant without a server timezone dependency. */
export function localDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  if (!DATE_PATTERN.test(dateStr) || !TIME_PATTERN.test(timeStr)) {
    throw new Error('Invalid local date or time.');
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const desiredEpoch = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(desiredEpoch);

  // Two passes cover timezone offsets and daylight-saving transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const observedEpoch = partsAsUtcEpoch(candidate, timeZone);
    candidate = new Date(candidate.getTime() + desiredEpoch - observedEpoch);
  }
  return candidate;
}

export function localDateBoundsUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  if (!DATE_PATTERN.test(dateStr)) throw new Error('Invalid local date.');
  const [year, month, day] = dateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateStr = [
    nextDate.getUTCFullYear(),
    String(nextDate.getUTCMonth() + 1).padStart(2, '0'),
    String(nextDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return {
    start: localDateTimeToUtc(dateStr, '00:00', timeZone),
    end: localDateTimeToUtc(nextDateStr, '00:00', timeZone),
  };
}

export function dayOfWeekForLocalDate(dateStr: string): number {
  if (!DATE_PATTERN.test(dateStr)) throw new Error('Invalid local date.');
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

import { BookingStatus, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { localDateBoundsUtc } from '@/lib/engine/time';

export const REPORT_TIME_ZONE = 'Africa/Cairo';

export interface ReportFilters {
  from: string;
  to: string;
  branchId?: string;
  teamId?: string;
  serviceId?: string;
  zoneId?: string;
  bookingStatus?: BookingStatus;
  paymentStatus?: PaymentStatus;
}

export type ReportSearchParams = Record<string, string | string[] | undefined>;

const identifierSchema = z.string().trim().min(1).max(100);
const dateSchema = z.string().refine(isCalendarDate, 'Invalid calendar date');
const bookingStatusSchema = z.nativeEnum(BookingStatus);
const paymentStatusSchema = z.nativeEnum(PaymentStatus);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function optionalIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const result = identifierSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function defaultReportDates(now = new Date()): Pick<ReportFilters, 'from' | 'to'> {
  const to = dateInTimeZone(now, REPORT_TIME_ZONE);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function parseReportFilters(
  input: ReportSearchParams | URLSearchParams,
  now = new Date(),
): ReportFilters {
  const read = (key: string): string | undefined => input instanceof URLSearchParams
    ? input.get(key) ?? undefined
    : first(input[key]);
  const defaults = defaultReportDates(now);
  const parsedFrom = dateSchema.safeParse(read('from'));
  const parsedTo = dateSchema.safeParse(read('to'));
  let from = parsedFrom.success ? parsedFrom.data : defaults.from;
  let to = parsedTo.success ? parsedTo.data : defaults.to;
  if (from > to) [from, to] = [to, from];

  const bookingStatus = bookingStatusSchema.safeParse(read('status'));
  const paymentStatus = paymentStatusSchema.safeParse(read('payment'));

  return {
    from,
    to,
    branchId: optionalIdentifier(read('branch')),
    teamId: optionalIdentifier(read('team')),
    serviceId: optionalIdentifier(read('service')),
    zoneId: optionalIdentifier(read('zone')),
    bookingStatus: bookingStatus.success ? bookingStatus.data : undefined,
    paymentStatus: paymentStatus.success ? paymentStatus.data : undefined,
  };
}

export function reportDateRange(filters: ReportFilters): { gte: Date; lt: Date } {
  return {
    gte: localDateBoundsUtc(filters.from, REPORT_TIME_ZONE).start,
    lt: localDateBoundsUtc(filters.to, REPORT_TIME_ZONE).end,
  };
}

export function reportFiltersToSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.branchId) params.set('branch', filters.branchId);
  if (filters.teamId) params.set('team', filters.teamId);
  if (filters.serviceId) params.set('service', filters.serviceId);
  if (filters.zoneId) params.set('zone', filters.zoneId);
  if (filters.bookingStatus) params.set('status', filters.bookingStatus);
  if (filters.paymentStatus) params.set('payment', filters.paymentStatus);
  return params;
}

import { z } from 'zod';
import { databaseIdSchema } from '@/lib/validations/database-id';

export const MAX_AVAILABILITY_ADDON_IDS = 12;
export const AVAILABILITY_MAX_DAYS_AHEAD = 90;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ensures seed IDs, UUIDs, and custom IDs conforming to databaseIdSchema
 * remain uniformly accepted in availability requests across all environments.
 */
export function allowsLegacyAvailabilitySeedIds(
  _environment = process.env.NODE_ENV,
  _explicitOptIn = process.env.ALLOW_LEGACY_SEED_IDS,
) {
  void _environment;
  void _explicitOptIn;
  return true;
}

function isRealIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function dateKeyInCairo(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`;
}

function dayNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Keeps public availability lookups bounded to the booking horizon. */
export function isAvailabilityDateInWindow(value: string, now = new Date()) {
  if (!isRealIsoDate(value)) return false;
  const difference = dayNumber(value) - dayNumber(dateKeyInCairo(now));
  return difference >= 0 && difference <= AVAILABILITY_MAX_DAYS_AHEAD;
}

export function createAvailabilityRequestSchema(
  _allowLegacySeedIds = allowsLegacyAvailabilitySeedIds(),
) {
  void _allowLegacySeedIds;
  const addonIdsSchema = z.array(databaseIdSchema)
    .max(MAX_AVAILABILITY_ADDON_IDS, `يمكن اختيار ${MAX_AVAILABILITY_ADDON_IDS} إضافات كحد أقصى.`)
    .superRefine((addonIds, context) => {
      if (new Set(addonIds).size !== addonIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'لا يمكن تكرار الإضافات.',
        });
      }
    });

  return z.object({
    branchId: databaseIdSchema,
    serviceId: databaseIdSchema,
    coverageAreaId: databaseIdSchema,
    vehicleSize: z.enum(['SEDAN', 'CROSSOVER', 'SUV', 'LARGE_SUV']),
    date: z.string().refine(isRealIsoDate, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD.'),
    addonIds: z.string().optional()
      .transform((value) => value === undefined || value === '' ? [] : value.split(','))
      .pipe(addonIdsSchema),
  });
}

export const availabilityRequestSchema = createAvailabilityRequestSchema();

const PARAMETER_NAMES = [
  'branchId',
  'serviceId',
  'coverageAreaId',
  'vehicleSize',
  'date',
  'addonIds',
] as const;

/**
 * Parses a URL query without accepting duplicate scalar parameters. The route
 * can therefore never calculate slots against an ambiguous request.
 */
export function parseAvailabilityRequest(
  searchParams: URLSearchParams,
  now = new Date(),
  allowLegacySeedIds = allowsLegacyAvailabilitySeedIds(),
) {
  const repeatedParameter = PARAMETER_NAMES.find((name) => searchParams.getAll(name).length > 1);
  if (repeatedParameter) {
    return {
      success: false as const,
      error: new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: [repeatedParameter],
        message: 'لا يمكن تكرار معامل الطلب.',
      }]),
    };
  }

  const parsed = createAvailabilityRequestSchema(allowLegacySeedIds).safeParse({
    branchId: searchParams.get('branchId'),
    serviceId: searchParams.get('serviceId'),
    coverageAreaId: searchParams.get('coverageAreaId'),
    vehicleSize: searchParams.get('vehicleSize'),
    date: searchParams.get('date'),
    addonIds: searchParams.get('addonIds') ?? undefined,
  });
  if (!parsed.success) return parsed;

  if (!isAvailabilityDateInWindow(parsed.data.date, now)) {
    return {
      success: false as const,
      error: new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: `اختر تاريخًا من اليوم وحتى ${AVAILABILITY_MAX_DAYS_AHEAD} يومًا قادمًا.`,
      }]),
    };
  }

  return parsed;
}
